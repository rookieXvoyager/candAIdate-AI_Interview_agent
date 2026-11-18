# candAIdate Agentic AI Suite

> **Current-state notice:** The deployed funnel now includes MCQ, Coding, Live
> Interview, and Holistic Evaluation stages. Statuses are
> `pending_assessment -> pending_coding -> pending_interview -> completed`.
> Cloudflare Tunnel serves Caddy, and Caddy routes `/api/*` to backend and
> everything else to the Vite/Nginx frontend.

## 1. Product Goals and Agentic Architecture

candAIdate is an AI-assisted technical interview platform with this primary journey:

1. Authenticate a candidate with Firebase.
2. Upload a resume and provide a target job description.
3. Parse the resume into a validated candidate profile.
4. Generate a tailored 20-question technical assessment.
5. Run a real-time interview over WebSocket.
6. Accept typed or recorded-audio candidate responses.
7. Convert audio to text, generate interviewer responses, and synthesize interviewer audio.
8. Persist the transcript and generate a coaching evaluation.
9. Display feedback and interview history through the React frontend.

The main runtime components are:

- **FastAPI backend**: API routes, WebSocket streaming, agent orchestration, Firebase/Firestore persistence.
- **Gemini agents**: resume parsing, assessment generation, live interviewing, and job-description generation.
- **Groq fallback**: provider-level fallback for assessment and interview generation when Gemini is unavailable.
- **Azure Speech**: speech-to-text and text-to-speech for the live interview experience.
- **Judge0 CE**: sandboxed code execution for coding assessments.
- **React/Vite frontend**: authenticated candidate workflow and live interview UI.
- **Caddy**: HTTPS termination and routing between the public frontend and backend containers.

## 2. Shared Gemini Model Configuration

[`app/core/config.py`](app/core/config.py) is now the sole source of Gemini model names:

- Primary model: `gemini-4-hydrogen`
- Gemini fallback: `gemini-3.5-flash-lite`

`settings.resolved_models` constructs an ordered, de-duplicated list with the primary model first, followed by the comma-separated fallback configuration. All agents that use shared Gemini fallback logic already pass this list to `generate_with_fallback`.

[`app/agents/interviewer.py`](app/agents/interviewer.py) now assigns:

```python
self._models = settings.resolved_models
```

The interviewer no longer maintains a separate hardcoded model list. This prevents configuration drift between Parser, Assessor, and Interviewer behavior.

The deployment `.env` must use the same values if it overrides the defaults:

```env
GEMINI_MODEL=gemini-4-hydrogen
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite
```

The existing `extra="ignore"` settings behavior remains important because the shared `.env` also contains frontend `VITE_*` variables.

## 3. End-to-End API Usage and Fallback Strategy

### 3.1 Resume parsing and profile creation

Frontend flow:

```text
POST /api/v1/setup/parse
multipart/form-data:
  resume: PDF, DOCX, or TXT
  jd_text: target job description
```

Implemented by [`app/api/v1/setup.py`](app/api/v1/setup.py).

Processing sequence:

1. Authenticate through `get_current_user_uid`.
2. Validate job-description length and resume extension/MIME type.
3. Reject empty, suspiciously small, oversized, or unreadable files.
4. Extract text using `pypdf`, `python-docx`, or UTF-8 decoding.
5. Load the versioned parser prompt.
6. Call [`app/agents/parser.py`](app/agents/parser.py).
7. Use `generate_with_fallback` with `settings.resolved_models`.
8. Request structured JSON matching the `ParsedProfile` Pydantic schema.
9. Reject documents marked as invalid resumes.
10. Persist the profile to Firestore.

The shared Gemini helper retries transient quota, overload, and server errors across the configured model chain. Non-transient errors are raised immediately.

### 3.2 Assessment generation

Frontend flow:

```text
POST /api/v1/setup/generate-mcq
body: ParsedProfile JSON
```

Implemented by [`app/api/v1/setup.py`](app/api/v1/setup.py) and [`app/agents/assessor.py`](app/agents/assessor.py).

Processing sequence:

1. Receive the validated candidate profile.
2. Load the assessor prompt.
3. Request exactly 20 multiple-choice questions from Gemini.
4. Enforce the `Assessment`/`MCQ` structured response schema.
5. Try every model in `settings.resolved_models` through the shared retry helper.
6. If Gemini fails completely and `GROQ_API_KEY` is configured, call Groq `llama-3.3-70b-versatile`.
7. Validate the Groq JSON response with Pydantic.
8. Save the assessment and create a Firestore session.

The endpoint returns a `session_id` used by the live interview and evaluation flows.

### 3.3 Sample job-description generation

Frontend flow:

```text
GET /api/v1/setup/sample-jd?role=...&experience=...
```

[`app/agents/generator.py`](app/agents/generator.py) uses the configured Gemini model with Google Search grounding and falls back to Grok through the OpenAI-compatible client if Gemini generation fails.

### 3.4 Real-time interview

Frontend flow:

```text
WebSocket /api/v1/interview/stream/{session_id}?token=<firebase-token>
```

Implemented by [`app/api/v1/stream.py`](app/api/v1/stream.py) and [`app/agents/interviewer.py`](app/agents/interviewer.py).

Connection sequence:

1. Accept the WebSocket connection.
2. Verify the optional Firebase token when supplied.
3. Load the session, target role, and candidate profile from Firestore.
4. Initialize `InterviewerAgent` with personalized context.
5. Send the initial greeting and synthesized Azure Speech audio.
6. Accept:
   - `{"type": "ping"}` for connection health.
   - `{"type": "text", "text": "..."}` for typed responses.
   - `{"type": "audio", "audio_base64": "..."}` for recorded responses.
7. Convert audio to text with Azure Speech STT.
8. Generate the next interviewer response with Gemini.
9. Synthesize the response with Azure Speech TTS.
10. Return `ai_response` JSON containing text and optional base64 audio.
11. Append candidate/interviewer turns to the Firestore transcript.

Interviewer fallback sequence:

1. `gemini-4-hydrogen`
2. `gemini-3.5-flash-lite`
3. Groq `llama-3.3-70b-versatile`, if configured

The interviewer preserves a universal history so a provider/model handoff retains the system prompt and prior turns. Gemini quota errors switch immediately to the next configured Gemini model. Temporary `503` errors are retried. After the Gemini chain is exhausted, the agent stays on Groq for the remainder of the interview.

### 3.5 Evaluation and coaching

When the WebSocket disconnects, the stream route marks the session `ready_for_evaluation` and triggers:

```text
POST /api/v1/evaluate/{session_id}
```

Implemented by [`app/api/v1/evaluate.py`](app/api/v1/evaluate.py).

Processing sequence:

1. Read the completed transcript from Firestore.
2. Format transcript turns into text.
3. Run `CoachingAgent.evaluate_interview` in a worker thread.
4. Save score, strengths, weaknesses, and detailed feedback.
5. Mark the session `completed`.
6. Return the generated evaluation ID and report.

The coaching implementation should be checked separately if the deployment requires the same Gemini model-chain guarantees as Parser and Assessor; the inspected evaluation route delegates to `CoachingAgent` rather than directly exposing its model selection.

### 3.6 Coding assessment and Judge0

The backend exposes the coding route under:

```text
/api/v1/coding
```

The Compose stack supplies Judge0 CE server, workers, PostgreSQL, and Redis. This provides isolated execution infrastructure for candidate code submissions, separate from the conversational Gemini path.

## 4. Gemini 4 Hydrogen and Gemini 3.5 Flash-Lite Rationale

The model upgrade is intended to separate quality/context capacity from high-volume latency and cost optimization:

### Gemini 4 Hydrogen

- Used as the primary model for richer reasoning and long-lived agent context.
- Google’s published model information describes a unified 1M-token context window and long decode support.
- That capacity is useful for resume/JD comparison, detailed interview context, long transcripts, and multi-step agent workflows.
- The interviewer still uses a 25-second application timeout, so the operational target is responsive synchronous turns rather than exploiting the model’s maximum output length.
- For real-time interviews, prompt size, output limits, network distance, and Azure Speech latency remain more important than the theoretical maximum context window.

### Gemini 3.5 Flash-Lite

- Used as the Gemini fallback for quota pressure, transient availability issues, and high-volume requests.
- Google describes Flash-Lite as optimized for fast, low-cost workloads and sub-second latency targets.
- This makes it appropriate for maintaining interview availability when the primary model is rate-limited.
- Its lighter profile is also suitable for structured parsing and assessment workloads where throughput is more important than maximum reasoning depth.

These are architectural justifications, not measured application benchmarks. The repository does not currently contain latency telemetry comparing both models. Actual end-to-end latency should be measured across:

```text
browser -> Caddy -> FastAPI -> Gemini -> FastAPI -> Azure TTS -> browser
```

References:

- [Gemini 4 Hydrogen model documentation](https://aistudio.google.com/docs/models/gemini-4-hydrogen)
- [What’s new in Gemini 4 Hydrogen](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen)

## 5. Current Deployment State

### FastAPI backend

[`app/main.py`](app/main.py) currently:

- Creates the FastAPI application.
- Enables CORS for local development and production domains.
- Mounts setup, interview, evaluation, and coding routers.
- Provides `/health`.
- Includes global exception handling.

The backend image is built by [`Dockerfile.backend`](Dockerfile.backend), runs Uvicorn on port `8000`, and is reachable internally through the Compose network.

Remaining backend risks:

- Authentication bypass behavior remains in parts of the WebSocket path.
- Firebase service-account handling is file-based.
- A legacy interview implementation remains alongside the active streaming route.
- Complete deployed smoke testing is not committed.

### Vite frontend

[`frontend/src/App.jsx`](frontend/src/App.jsx) provides protected routes for:

- Login
- Dashboard
- Resume/setup
- Profile
- Quiz
- Live interview
- Coding assessment
- Feedback
- History

The frontend is built by [`Dockerfile.frontend`](Dockerfile.frontend), with Firebase `VITE_*` values injected at build time, then served by Nginx on internal port `80`.

### Caddy reverse proxy

[`Caddyfile`](Caddyfile) serves `candaidate.app` and `www.candaidate.app`:

- `/api/*`, `/health`, `/docs`, and `/openapi.json` -> `backend:8000`
- All other paths -> `frontend:80`
- Ports `80` and `443` are published by [`docker-compose.yml`](docker-compose.yml)
- Caddy certificate and configuration data use persistent named volumes

### Judge0 deployment

[`docker-compose.yml`](docker-compose.yml) also defines:

- `judge0-server`
- `judge0-workers`
- `judge0-db`
- `judge0-redis`

PostgreSQL and Redis data are persisted through named volumes. Judge0 is intended to provide isolated code execution for the coding-assessment feature.

## 6. Current Repository Assessment

- The agent model configuration is now centralized through `settings.resolved_models`.
- The requested primary/fallback defaults are `gemini-4-hydrogen` and `gemini-3.5-flash-lite`.
- Parser and Assessor already use the shared Gemini fallback helper.
- Interviewer now uses the same configured model chain.
- Real-time text/audio interview flow, transcript persistence, and evaluation triggering are implemented.
- FastAPI, Vite/Nginx, Caddy, and Judge0 have a coherent Compose deployment shape.

Production-readiness gaps remain around authentication hardening, secret management, observability, measured latency validation, and an end-to-end deployment smoke test.
