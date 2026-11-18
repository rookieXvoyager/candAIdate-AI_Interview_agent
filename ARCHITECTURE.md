# candAIdate System Architecture

This document describes the current production architecture for the
candAIdate AI interview platform. It covers the complete candidate workflow,
Docker deployment, agent orchestration, Firebase/Firestore integration,
Judge0 coding execution, live voice behavior, evaluation, and Cloudflare
public ingress.

## 1. Current Production Stack

```mermaid
flowchart LR
    U[Candidate Browser]
    CF[Cloudflare DNS + Tunnel]
    CD[cloudflared]
    C[Caddy :80]
    F[React + Vite + Nginx Frontend]
    B[FastAPI Backend :8000]
    FA[Firebase Auth]
    FS[Firebase Firestore]
    GEM[Google Gemini]
    GROQ[Groq GPT-OSS]
    J[Judge0 Server]
    JW[Judge0 Workers]
    PG[(Judge0 PostgreSQL)]
    RD[(Judge0 Redis)]

    U -->|HTTPS candaidate.app| CF
    CF -->|Encrypted tunnel| CD
    CD -->|HTTP| C
    C -->|/api/*| B
    C -->|all other routes| F
    F -->|Firebase SDK| FA
    F -->|REST JSON / WebSocket| C
    B -->|verify Firebase JWT| FA
    B -->|service account access| FS
    F -->|Firestore web SDK| FS
    B -->|Gemini APIs| GEM
    B -->|Groq fallback APIs| GROQ
    B -->|Judge0 execute/submit| J
    J --> JW
    JW --> PG
    JW --> RD
```

## 2. Six-Step Agentic Candidate Flow

```mermaid
flowchart TD
    A[1. Upload Resume + Job Description] --> B[2. Profile Parser]
    B --> C[3. Profile Review]
    C --> D[4. MCQ Assessment]
    D -->|pending_coding| E[5. Coding Assessment]
    E -->|submit or skip| F[pending_interview]
    F --> G[6. Live AI Interview]
    G -->|candidate 0-answer fallback or normal completion| H[Coach Evaluation]
    H --> I[completed]
    I --> J[Holistic Feedback Dashboard]

    B --> PA[Parser Agent]
    D --> AA[Assessor Agent]
    G --> IA[Interviewer Agent]
    H --> CA[Coach Agent]
```

The persisted session state is:

```text
pending_assessment
  -> pending_coding
  -> pending_interview
  -> completed
```

## 3. Agent Architecture

```mermaid
flowchart TB
    subgraph FASTAPI["FastAPI application"]
        Setup["Setup Router<br/>parse / sample-jd / generate-mcq / submit-mcq"]
        Coding["Coding Router<br/>questions / execute / submit / skip"]
        Interview["Interview Router<br/>WebSocket"]
        Evaluate["Evaluation Router<br/>POST /evaluate/session"]
    end

    subgraph AGENTS["AI agent layer"]
        Parser["Parser Agent"]
        Assessor["Assessor Agent"]
        Interviewer["Interviewer Agent"]
        Coach["Coach Agent"]
    end

    subgraph PROVIDERS["Model and infrastructure providers"]
        Gemini["Google Gemini"]
        Groq["Groq GPT-OSS"]
        Judge0["Judge0 CE"]
        Firestore["Firestore"]
    end

    Setup --> Parser
    Setup --> Assessor
    Coding --> Judge0
    Interview --> Interviewer
    Evaluate --> Coach

    Parser --> Gemini
    Assessor --> Gemini
    Interviewer --> Gemini
    Interviewer --> Groq
    Coach --> Gemini
    Coach --> Groq

    Setup --> Firestore
    Coding --> Firestore
    Interview --> Firestore
    Evaluate --> Firestore
```

### Parser Agent

The Parser Agent:

- Accepts PDF, DOCX, or TXT resume content.
- Reads the target job description.
- Produces a structured candidate profile.
- Persists the profile through `app/core/db.py`.

### Assessor Agent

The Assessor Agent:

- Uses the parsed profile.
- Generates the pre-screen MCQ set.
- Persists quiz questions in the Firestore session.

### Interviewer Agent

The Interviewer Agent:

- Maintains the conversation history.
- Uses the Gemini model chain first.
- Falls back to Groq for provider failures.
- Appends `[INTERVIEW_COMPLETE]` when closing.
- Uses a server-side candidate-answer cap of 7 turns.

### Coach Agent

The Coach Agent:

- Reads the live transcript.
- Reads MCQ accuracy and breakdown.
- Reads coding pass rate and submitted verdicts.
- Produces section feedback and final overall feedback.
- Uses a deterministic fallback if the LLM fails or the interview has zero
  candidate answers.

## 4. Authentication and Firebase Integration

```mermaid
sequenceDiagram
    actor Candidate
    participant React as React/Vite
    participant FirebaseAuth as Firebase Authentication
    participant API as FastAPI
    participant Admin as Firebase Admin SDK
    participant Firestore as Cloud Firestore

    Candidate->>React: Open /login
    Candidate->>React: Choose Email/Password or OAuth
    React->>FirebaseAuth: signInWithPopup / email methods
    FirebaseAuth-->>React: Firebase user + ID token
    React->>React: onAuthStateChanged updates context
    React->>API: REST request with Bearer ID token
    API->>Admin: verify_id_token
    Admin-->>API: verified uid
    API->>Firestore: read/write uid-scoped session data
    Firestore-->>React: Dashboard and History queries
```

Supported popup providers:

- Google
- GitHub
- Microsoft

OAuth providers require:

- Authorized domains: `localhost` and `candaidate.app`
- Google/GitHub/Microsoft providers enabled
- Provider OAuth credentials
- Firebase callback:
  `https://<firebase-project-id>.firebaseapp.com/__/auth/handler`

The frontend uses `same-origin-allow-popups` so Firebase popup polling remains
usable on the custom production domain.

## 5. Firestore Data Model

```mermaid
flowchart LR
    U[(users)]
    S[(sessions)]
    E[(evaluations)]
    C[(coding_bank)]

    U -->|uid| S
    S -->|evaluation_id| E
    C -->|question_id| S

    subgraph Users["users/{uid}"]
        UP[parsed profile]
        UM[updatedAt]
    end

    subgraph Sessions["sessions/{sessionId}"]
        ST[status]
        MC[mcq_quiz / mcq_answers / mcq_result]
        CR[coding_result / submitted code / verdicts]
        TR[transcript]
        EB[ended_early]
        ER[evaluation_report]
        OS[overall_score / score_breakdown]
    end

    subgraph Evaluations["evaluations/{evaluationId}"]
        ES[score / overall_score]
        SF[section_feedback]
        OF[overall_feedback]
        LF[legacy strengths / weaknesses]
    end

    U --- Users
    S --- Sessions
    E --- Evaluations
```

Firestore session status values:

```text
pending_assessment
pending_coding
pending_interview
ready_for_evaluation
in_progress
completed
cancelled
```

## 6. Judge0 Coding Pipeline

```mermaid
sequenceDiagram
    participant UI as Coding React Page
    participant API as FastAPI Coding Router
    participant J as Judge0 Server
    participant W as Judge0 Workers
    participant PG as PostgreSQL
    participant R as Redis
    participant FS as Firestore

    UI->>API: GET /coding/questions
    API->>FS: Read coding_bank problems
    FS-->>UI: Visible problem + starter template

    UI->>API: POST /coding/execute
    API->>J: Submit custom-input execution
    J->>W: Enqueue task
    W->>PG: Store/read task data
    W->>R: Queue coordination
    J-->>API: status/stdout/stderr
    API-->>UI: execution result

    UI->>API: POST /coding/submit
    API->>J: Submit every hidden test case
    J-->>API: pass/fail/verdict outputs
    API->>FS: Persist code, pass total, verdicts
    API->>FS: Set status=pending_interview
    API-->>UI: submission result
```

## 7. Live Voice Interview Architecture

```mermaid
sequenceDiagram
    actor Candidate
    participant UI as LiveInterview React
    participant STT as Web Speech API
    participant TTS as window.speechSynthesis
    participant WS as FastAPI WebSocket
    participant Agent as Interviewer Agent
    participant Gemini as Gemini
    participant Groq as Groq
    participant FS as Firestore

    WS-->>UI: ai_response / ai_message
    UI->>TTS: Speak interviewer text
    Candidate->>STT: Record or pause/resume speech
    STT-->>UI: final + interim transcript
    UI->>UI: Put transcript in editable textarea
    Candidate->>UI: Enter or Send
    UI->>WS: {"type":"text","text":"answer"}
    WS->>Agent: Candidate answer
    Agent->>Gemini: Generate next question
    alt Gemini unavailable or exhausted
        Agent->>Groq: GPT-OSS fallback
    end
    Agent-->>WS: Response or closing marker
    WS->>FS: Persist interviewer/candidate transcript
    WS-->>UI: ai_message + interview_complete
    UI->>TTS: Wait for closing utterance
    UI->>WS: Close cleanly
    UI->>API[Evaluation]: POST /evaluate/session
```

The STT state machine is:

```text
idle -> recording -> paused -> recording
idle <- stop
paused -> idle
```

The STT implementation:

- Uses final and interim Web Speech results.
- Keeps committed text separate from interim preview.
- Never sends audio automatically.
- Restarts after Chrome recognition's ~60-second auto-stop.
- Cleans up recognition listeners and timers on unmount/send/end.

Browser TTS:

- Uses `window.speechSynthesis`.
- Chooses an English voice when available.
- Supports mute, replay, and initial autoplay unlock.
- Is canceled when recording begins, a message sends, or feedback starts.

## 8. Evaluation and Weighted Scoring

```mermaid
flowchart TD
    Session[Firestore Session] --> LoadMCQ[MCQ answers + breakdown]
    Session --> LoadCoding[Coding submission + verdicts]
    Session --> LoadInterview[Candidate transcript]

    LoadMCQ --> MCQ[MCQ raw score 0-100]
    LoadCoding --> Coding[Coding raw score 0-100]
    LoadInterview --> Interview[Coach interview raw score 0-100]

    CodingAvailable{Coding problem exists?}
    CodingAvailable -->|Yes| W1[25% MCQ / 35% Coding / 40% Interview]
    CodingAvailable -->|No| W2[40% MCQ / 60% Interview]

    MCQ --> W1
    Coding --> W1
    Interview --> W1
    MCQ --> W2
    Interview --> W2

    W1 --> Final[Rounded weighted sum, clamped 0-100]
    W2 --> Final
    Final --> Report[Persist evaluation_report]
    Report --> SessionCompleted[status = completed]
```

Default formula:

```text
overall = round((MCQ raw × 0.25)
              + (Coding raw × 0.35)
              + (Interview raw × 0.40))
```

Legacy formula without any coding round:

```text
overall = round((MCQ raw × 0.40)
              + (Interview raw × 0.60))
```

Skipped or missing sections retain their weight and contribute `0`.

The evaluation response includes:

- `overall_score`
- legacy `score`
- `score_breakdown`
- `section_feedback`
- `overall_feedback`
- legacy `strengths`
- legacy `weaknesses`
- legacy `detailed_feedback`

The endpoint is idempotent. Completed sessions return the stored report when
possible. Empty interviews return deterministic zero-answer reports and complete
the session.

## 9. Deployment Pipeline

```mermaid
flowchart LR
    Dev[Developer Machine]
    Repo[Git Repository]
    Env[.env + secret files]
    Compose[Docker Compose]

    Dev -->|build / push| Repo
    Dev --> Env
    Env --> Compose
    Repo --> Compose

    Compose --> FEImage[Frontend image build]
    Compose --> BEImage[Backend image build]
    FEImage --> Nginx[Nginx static server]
    BEImage --> Backend[FastAPI]

    Compose --> Caddy
    Compose --> Cloudflared
    Compose --> Judge0

    subgraph DockerNetwork["candaidate-net"]
        Nginx
        Caddy
        Backend
        Judge0
        Workers[Judge0 workers]
        PG[(PostgreSQL)]
        RD[(Redis)]
        Cloudflared
    end

    Cloudflared -->|outbound Tunnel| CF[Cloudflare Edge]
    CF -->|HTTPS| Internet[Candidate Browser]
    Internet --> CF
    Caddy -->|/api/*| Backend
    Caddy -->|SPA and assets| Nginx

    Backend --> Judge0
    Judge0 --> Workers
    Workers --> PG
    Workers --> RD
```

Cloudflare terminates public HTTPS. Caddy listens on internal HTTP port `80`.
Cloudflared uses `--protocol http2` for reliable macOS local hosting.

On macOS, keep the host awake while running local infrastructure:

```bash
caffeinate -s
```

## 10. Complete Tool and Integration Map

```mermaid
flowchart TB
    Browser[Candidate Browser]

    subgraph Edge["Public edge"]
        NameCom[name.com DNS registration]
        CF[Cloudflare DNS + Tunnel]
    end

    subgraph Host["Docker Compose host"]
        Cloudflared[cloudflared]
        Caddy[Caddy reverse proxy]
        Frontend[React/Vite build + Nginx]
        Backend[FastAPI]

        subgraph JudgeInfra["Judge0 infrastructure"]
            Judge[judge0-server]
            Worker[judge0-workers]
            Postgres[(PostgreSQL)]
            Redis[(Redis)]
        end
    end

    subgraph AuthData["Google Firebase"]
        FirebaseAuth[Firebase Authentication]
        Firestore[Cloud Firestore]
    end

    subgraph AI["AI providers"]
        Gemini[Google Gemini]
        Groq[Groq GPT-OSS]
    end

    subgraph BrowserVoice["Browser-native voice"]
        SpeechRecognition[Web Speech API/STT]
        SpeechSynthesis[speechSynthesis/TTS]
    end

    NameCom --> CF
    Browser --> CF
    CF --> Cloudflared
    Cloudflared --> Caddy
    Caddy --> Frontend
    Caddy --> Backend

    Browser --> FirebaseAuth
    Frontend --> FirebaseAuth
    Backend --> FirebaseAuth
    Frontend --> Firestore
    Backend --> Firestore

    Browser --> SpeechRecognition
    SpeechRecognition --> Browser
    Browser --> SpeechSynthesis

    Backend --> Gemini
    Backend --> Groq
    Backend --> Judge
    Backend --> Firestore

    Judge --> Worker
    Worker --> Postgres
    Worker --> Redis

    Frontend <-->|REST JSON + WebSocket| Caddy
```

## 11. Security and Secret Boundaries

Browser-safe:

- Firebase web API keys
- Firebase auth domain/project values
- `VITE_API_URL`

Server-only:

- Gemini API key
- Groq API key
- Firebase service account private key
- Cloudflare tunnel token
- Judge0 credentials
- Judge0 PostgreSQL/Redis passwords

Never expose server-only credentials to `VITE_*` variables or browser network
responses.
