# candAIdate — Frontend

React + Vite + Tailwind UI for the AI Interview Partner.

## Local Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` to the public domain or same-origin Caddy URL. Firebase web
values must come from the matching Firebase project.

## Six-Step Flow

| Step | Route | Backend/API |
|---|---|---|
| 1 | `/setup` | Upload resume and JD, then parse |
| 2 | `/profile` | Review profile and generate MCQs |
| 3 | `/quiz` | Submit partial or complete MCQ answers |
| 4 | `/coding` | Judge0 CE execute/hidden-test submission |
| 5 | `/interview` | Authenticated WebSocket interview |
| 6 | `/feedback` | Idempotent holistic evaluation |

State is retained with `sessionStorage` and scoped to `session_id`.

## Authentication

The login page supports:

- Email/password
- Google popup
- GitHub popup
- Microsoft popup

OAuth uses popup-first sign-in and recovers cleanly from cancellation.

## Live Voice Controls

- Mute/Unmute and Replay
- Record, Pause, Resume, and Stop
- Transcribed text drafts in the textarea
- Enter sends; Shift+Enter inserts a newline

The WebSocket receives the Firebase JWT in `?token=<firebase-jwt>`.
