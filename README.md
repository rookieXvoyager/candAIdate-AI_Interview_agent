# candAIdate - AI Interview Partner

candAIdate is a Dockerized mock-interview platform for candidates. It generates
a tailored profile and assessment, runs a Judge0 coding round, conducts a live
voice interview, and produces a weighted coaching scorecard.

Production domain: `https://candaidate.app`

## Six-Step Interview Pipeline

1. **Upload Resume & Job Description** - `/setup`
2. **Profile Review** - `/profile`
3. **Pre-Screen MCQs** - `/quiz`
4. **Coding Assessment** - `/coding` through Judge0 CE
5. **Live AI Interview** - `/interview` through WebSocket
6. **Holistic Evaluation Dashboard** - `/feedback`

Session states progress deterministically:

```text
pending_assessment -> pending_coding -> pending_interview -> completed
```

## Key Features

### Authentication

- Firebase Email/Password authentication.
- Google, GitHub, and Microsoft popup-first OAuth.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- Popup cancellation, focus recovery, and unauthorized-domain guidance.
- Firebase JWT is sent to FastAPI REST endpoints and WebSocket connections.

### Resumable Sessions

- Dashboard and History cards support:
  - `Resume Assessment`
  - `Continue Coding`
  - `Continue Interview`
  - `Finalize & View Result`
  - `End Session`
- Active IDs and tagged results use `sessionStorage`.
- Results are rejected when their `session_id` differs from the active session.
- A root React `ErrorBoundary` provides a retry and dashboard fallback.

### MCQ Assessment

- Partially answered or entirely unanswered quizzes can be submitted.
- Unanswered answers are stored as `null` and score `0`.
- Unanswered questions are labeled `"unanswered"` in the breakdown.
- Submitting advances the session to `pending_coding`.

### Coding Assessment

- Judge0 CE executes code for configured languages.
- Hidden test cases produce pass/fail/verdict artifacts.
- Submitted code, problem metadata, and verdicts persist in Firestore.
- The coding page supports refresh recovery and an explicit skip action.

### Live Voice Interview

- Browser TTS reads each interviewer message using `window.speechSynthesis`.
- Mute/Unmute, Replay, speaking state, and first-user-gesture voice unlock are
  supported.
- STT uses the Web Speech API with `idle`, `recording`, and `paused` states.
- Transcriptions populate an editable textarea; they are never auto-sent.
- Chrome recognition auto-stop is recovered automatically.
- `Enter` sends; `Shift+Enter` adds a newline.
- The interviewer appends `[INTERVIEW_COMPLETE]` and a server-side 7-answer
  safeguard closes the session and redirects to feedback.

### Holistic Evaluation

Deterministic section weights:

| Section | Weight |
|---|---:|
| MCQs | 25% |
| Coding | 35% |
| Live Interview | 40% |

For legacy sessions with no coding round:

| Section | Weight |
|---|---:|
| MCQs | 40% |
| Live Interview | 60% |

The Feedback dashboard uses Recharts to show:

- Total 100-point score contribution disc
- MCQ, Coding, and Live Interview contributions
- Section-wise strengths and improvements
- Final verdict, executive summary, priority improvements, and next steps

Empty transcripts, LLM failures, completed-session repeats, and legacy reports
remain fallback-safe.

## Architecture

### Frontend

- React
- Vite
- Tailwind CSS
- React Router
- Recharts
- Firebase Web SDK

### Backend

- Python 3.10+
- FastAPI
- Google Gemini
- Groq/OpenAI-compatible fallback
- Firebase Admin SDK
- Firestore

### Agents

- Parser
- Assessor
- Interviewer
- Coach
- Sample Job Description generator

### Infrastructure

- Docker Compose
- Caddy reverse proxy
- Cloudflare Tunnel with `cloudflared`
- Judge0 CE
- PostgreSQL
- Redis
- Nginx static frontend serving

## API Reference

### Setup

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/setup/parse` | Parse a resume and job description |
| `POST` | `/api/v1/setup/generate-mcq` | Generate MCQs and create a session |
| `POST` | `/api/v1/setup/submit-mcq/{session_id}` | Grade MCQs and advance to coding |
| `GET` | `/api/v1/setup/sample-jd` | Generate a sample job description |

### Coding

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/coding/questions` | Fetch coding problems |
| `GET` | `/api/v1/coding/session/{session_id}` | Restore coding session state |
| `POST` | `/api/v1/coding/execute` | Run code with custom input |
| `POST` | `/api/v1/coding/submit` | Evaluate hidden test cases and persist coding result |
| `POST` | `/api/v1/coding/skip` | Skip coding and advance to the interview |

### Live Interview

| Protocol | Path | Purpose |
|---|---|---|
| WebSocket | `/api/v1/interview/stream/{session_id}?token=<firebase-jwt>` | Live interviewer Q&A and transcript persistence |

Send candidate text:

```json
{"type":"text","text":"My answer"}
```

Receive interviewer completion:

```json
{
  "type": "ai_message",
  "content": "Closing message",
  "text": "Closing message",
  "interview_complete": true
}
```

### Evaluation

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/evaluate/{session_id}` | Create or return an idempotent holistic evaluation |

The response contains `overall_score`, `score_breakdown`,
`section_feedback`, `overall_feedback`, and legacy top-level
`strengths`, `weaknesses`, and `detailed_feedback`.

## Local Development

### Required files

- `.env`
- `serviceAccountKey.json`
- `judge0.conf`
- `frontend/.env` or build arguments supplied through Compose

Never commit secrets or real API keys.

### Root `.env` placeholders

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite
GROQ_API_KEY=
GROQ_API_BASE=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
VITE_API_URL=http://localhost
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
TUNNEL_TOKEN=
JUDGE0_URL=http://judge0-server:2358
JUDGE0_API_URL=http://judge0-server:2358
COMPILER_URL=http://judge0-server:2358
```

### Firebase Console checklist

1. Enable Email/Password, Google, GitHub, and Microsoft providers.
2. Add `candaidate.app` to Authentication > Authorized domains.
3. Configure provider OAuth callback URLs using:

```text
https://<firebase-project-id>.firebaseapp.com/__/auth/handler
```

4. Create or download a backend service account as `serviceAccountKey.json`.
5. Configure a Firestore database and appropriate security rules.

## Docker Deployment

Full build and start:

```bash
docker compose --env-file .env up -d --build
```

Targeted rebuilds:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend

docker compose build --no-cache backend
docker compose up -d backend

docker compose build --no-cache cloudflared
docker compose up -d cloudflared
```

Cloudflare Tunnel should publish `candaidate.app` to:

```text
http://caddy:80
```

### macOS / Cloudflare Tunnel

`cloudflared` is pinned to `--protocol http2` in `docker-compose.yml` to avoid
QUIC/UDP connectivity or idle-dropout behavior on macOS networks. During local
hosting, keep the Mac awake:

```bash
caffeinate -s
```

## Security

Never commit:

- `.env`
- `frontend/.env`
- `serviceAccountKey.json`
- Judge0 credentials or password-bearing `judge0.conf`
- Cloudflare tunnel tokens
- Gemini, Groq, Firebase, Azure, or other provider secrets

## Detailed Setup Guide

### 1. Create the external accounts

Create or verify accounts for:

- Google AI Studio / Gemini
- GroqCloud
- Firebase
- Cloudflare
- name.com for the registered `candaidate.app` domain

Judge0 runs locally inside Docker; no hosted Judge0 account is required. The
Judge0 database and Redis credentials remain in `judge0.conf`.

### 2. Prepare repository configuration

Copy the safe templates:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Fill only local secret values. Never put provider secrets in
`VITE_*` variables because Vite exposes those values to browser JavaScript.
Keep private credentials only in root `.env` or the backend container environment.

Required private/local files:

```text
.env
serviceAccountKey.json
judge0.conf
```

Do not commit them. If `judge0.conf` already contains real passwords or tokens,
rotate those values and regenerate the container configuration before sharing
the repository.

### 3. Configure Firebase

In Firebase Console:

1. Create a Web app and copy its public configuration values into
   `VITE_FIREBASE_*`.
2. Enable Email/Password authentication.
3. Enable Google, GitHub, and Microsoft providers.
4. Add these authorized domains:
   - `localhost`
   - `candaidate.app`
5. Configure provider callback URLs with:

```text
https://<firebase-project-id>.firebaseapp.com/__/auth/handler
```

Create a service account:

1. Open Project Settings > Service accounts.
2. Generate a private key.
3. Save it as `serviceAccountKey.json` at the repository root.
4. Ensure the backend container mounts it read-only.

Create Firestore and use security rules that allow only authenticated users to
read/write their own session and profile documents. The backend Admin SDK uses
the service account and should not rely on permissive development rules.

### 4. Configure Google Gemini

Set the primary and secondary model chain:

```env
GEMINI_API_KEY=<new-gemini-api-key>
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite
```

Verify model access using Google AI Studio or the Gemini models API. Free-tier
availability and quotas are account/project-specific and are not guaranteed.

The shared fallback helper tries the configured Gemini chain for transient
429/503/500-style errors. Groq remains available as the ultimate provider
fallback for compatible agent paths.

### 5. Configure Groq

Set a valid free-tier or developer key:

```env
GROQ_API_KEY=<groq-api-key>
GROQ_API_BASE=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
```

The key must be active for `openai/gpt-oss-120b`. Verify availability with:

```bash
export GROQ_API_KEY="$(grep '^GROQ_API_KEY=' .env | cut -d= -f2-)"

curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY"
```

Do not copy a Groq key into `GROK_API_KEY`; there is no xAI Grok fallback in the
current runtime.

### 6. Configure Judge0

Keep `judge0.conf` next to `docker-compose.yml`. Confirm it contains working
PostgreSQL and Redis credentials and that `AUTHN_TOKEN` matches the backend
Judge0 token logic.

Judge0 is reachable only through Docker DNS:

```text
http://judge0-server:2358
```

Do not use `localhost:2358` or `127.0.0.1:2358` in backend containers.

### 7. Run locally

From the repository root:

```bash
docker compose --env-file .env up -d --build
docker compose ps
docker compose logs -f backend frontend caddy
```

Default local values:

```env
VITE_API_URL=http://localhost
```

Local URLs:

```text
Frontend/API via Caddy: http://localhost
Backend health: http://localhost/health
FastAPI docs: http://localhost/docs
```

For a Vite-only development server:

```bash
cd frontend
npm install
npm run dev
```

The backend is also available internally in Docker on port `8000` and should be
exposed through Caddy rather than directly to end users.

### 8. Deploy with Cloudflare Tunnel

1. Register or renew `candaidate.app` through name.com.
2. Add `candaidate.app` to Cloudflare.
3. Replace the name.com nameservers with the Cloudflare nameservers.
4. Create a Cloudflare Tunnel.
5. Add `TUNNEL_TOKEN` to `.env`.
6. Configure the tunnel public hostname:

```text
candaidate.app -> http://caddy:80
```

Set the production build variable:

```env
VITE_API_URL=https://candaidate.app
```

Because Vite variables are compiled at frontend build time, rebuild after changes:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

Cloudflare provides public HTTPS. Caddy is retained internally as the HTTP
reverse proxy and does not need to provision public Let's Encrypt certificates.

### 9. Verify deployment

```bash
docker compose ps
docker compose logs -f cloudflared
docker compose logs -f caddy backend frontend

curl -I https://candaidate.app/
curl https://candaidate.app/health
curl https://candaidate.app/openapi.json
```

If the domain is not resolving, confirm Cloudflare DNS nameservers, tunnel
status, tunnel hostname routing, and that `TUNNEL_TOKEN` is valid.

## macOS Hosting Notes

Cloudflared is intentionally run with `--protocol http2` because QUIC/UDP
connections may idle-drop or remain unstable on some macOS networks. HTTP/2
provides a more reliable persistent outbound tunnel.

Keep the Mac awake while local hosting:

```bash
caffeinate -s
```

Stop it with `Ctrl+C`.

## Troubleshooting

- `auth/unauthorized-domain`: add the exact production domain to Firebase
  Authorized domains.
- OAuth callback invalid: verify provider callback URL and enabled provider.
- `ERR_CONNECTION_REFUSED`: rebuild frontend after `VITE_API_URL` changes.
- `429 RESOURCE_EXHAUSTED`: wait for Gemini quota reset or use Groq fallback.
- `pending_coding` stuck: submit or skip `/coding`.
- `ready_for_evaluation` stuck: call
  `POST /api/v1/evaluate/{session_id}` from Dashboard or History.
- Judge0 unreachable: check `judge0-server`, `judge0-workers`,
  `judge0-db`, and `judge0-redis` logs.

## Project Verification

```bash
cd frontend
npm run build

cd ..
python3 -m compileall -q app
docker compose config --quiet
```
