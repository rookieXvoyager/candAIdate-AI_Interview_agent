# candAIdate — Frontend

React + Vite + Tailwind CSS (dark navy/slate theme) UI for the AI Interview Partner.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env template and fill in your Firebase web config:
   ```bash
   cp .env.example .env
   ```
   Get the values from Firebase Console → Project Settings → Your apps → SDK setup.
   Enable **Email/Password** sign-in under Authentication → Sign-in method.
3. Start the dev server (runs on port 5173 to match the backend CORS allow-list):
   ```bash
   npm run dev
   ```

The backend is expected at `http://127.0.0.1:8000` (override via `VITE_API_BASE` / `VITE_WS_BASE`).

## Flow

| Step | Route        | Page          | Backend call                                   |
| ---- | ------------ | ------------- | ---------------------------------------------- |
| —    | `/login`     | Login         | Firebase Auth (email/password)                 |
| 1    | `/dashboard` | Upload        | `POST /api/v1/setup/parse` (multipart)         |
| 2    | `/profile`   | Profile       | `POST /api/v1/setup/generate-mcq` (JSON)       |
| 3    | `/quiz`      | Quiz          | — (renders assessment, client-side scoring)    |
| 4    | `/interview` | LiveInterview | `WS /api/v1/interview/stream/{id}?token=` chat |
| 5    | `/feedback`  | Feedback      | `POST /api/v1/evaluate/{session_id}`           |

State flows through `InterviewContext`; auth + JWT retrieval through `AuthContext`.

## Notes

- The WebSocket sends the Firebase JWT as a `?token=` query param (browsers can't set WS headers).
- The chat handles the backend's 15s `{"type":"ping"}` heartbeat by replying with `{"type":"pong"}`.
- Funnel state is in-memory; a hard refresh mid-flow returns you to Step 1.
