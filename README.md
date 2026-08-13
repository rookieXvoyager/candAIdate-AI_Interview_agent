# candAIdate — AI Interview Partner

✨ A personalized mock-interview platform: upload your resume + a job description, get a tailored screening quiz, run a live AI interview, and review a coaching scorecard.

- **Backend:** FastAPI (Python) · Google Gemini · Firebase Admin (Firestore + Auth)
- **Frontend:** React + Vite + Tailwind CSS · Firebase Auth

> ⚠️ This repo does **not** include secrets. You must supply your own Firebase project, Gemini API key, and local service account file before the app will run.

## 🌟 New Features Added

- 🔐 Firebase login/signup with protected routes and token-based API access.
- 🧠 Gemini-backed resume parsing with fallback model handling for rate limits.
- 📝 Tailored MCQ pre-screening generated from the parsed candidate profile.
- 🎙️ Live interview experience with WebSocket chat, heartbeat handling, and transcript persistence.
- 🗂️ Firestore-backed session history and scorecard storage.
- 🎧 Browser mic input support in the interview screen, with text fallback.
- 📊 Coaching feedback generation after the interview transcript is collected.

## 🚀 Prerequisites

- **Python 3.10+** and **Node.js 18+**
- A **Google Gemini API key**: https://aistudio.google.com/apikey
- A **Firebase project**: https://console.firebase.google.com

## 1) Clone and install

```bash
git clone <your-repo-url>
cd candAIdate

# Backend dependencies
python -m pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

## 2) Set up Firebase

In the [Firebase console](https://console.firebase.google.com):

1. Create a project.
2. Go to **Authentication** → **Sign-in method** and enable **Email/Password**.
3. Go to **Firestore Database** and create a database for development.
4. Add a **Web app** in Project Settings and copy the `firebaseConfig` values.
5. Generate a **service account key** in Project Settings → **Service accounts** and save it as `serviceAccountKey.json` in the project root.

## 3) Configure environment files

Create a root `.env` file for the backend:

```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite,gemini-2.0-flash
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_KEY=
```

Create `frontend/.env.local` for the frontend Firebase config:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_BASE=http://127.0.0.1:8000
VITE_WS_BASE=ws://127.0.0.1:8000
```

> The same Firebase project should back both the frontend web config and the backend service account so token verification works correctly.

## 4) Run the app

Open two terminals:

```bash
# Terminal 1 — backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

- Backend health check: http://127.0.0.1:8000/health
- Frontend app: http://localhost:5173

## 🔎 What the app does

1. Upload a resume and job description.
2. Extract a structured candidate profile with Gemini.
3. Generate a tailored quiz from that profile.
4. Run the live interview over WebSocket.
5. Save transcript and evaluation data to Firestore.
6. Review past sessions in the history page.

## 📌 Notes

- Gemini free-tier limits can trigger model fallbacks. If all models are throttled, wait a bit and retry.
- Firestore test mode expires, so production should use proper security rules for per-user access.
- Backend base URLs are configurable through `VITE_API_BASE` and `VITE_WS_BASE`.
- The frontend `.gitignore` already excludes `*.local`, so `frontend/.env.local` is the safest place for local web config.

## 🧱 Project Layout

```text
app/            FastAPI backend
  agents/       Gemini agents (parser, assessor, interviewer, coach)
  api/v1/       REST + WebSocket endpoints
  core/         config, firebase, db, security
  services/     Azure speech and search integrations
frontend/       React + Vite + Tailwind app
scripts/        Utility scripts for evals, latency, and vector DB seeding
```
