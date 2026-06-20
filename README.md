# candAIdate — AI Interview Partner

A personalized mock-interview platform: upload your resume + a job description, get a
tailored screening quiz, a live AI interview, and a coaching scorecard.

- **Backend:** FastAPI (Python) · Google Gemini · Firebase Admin (Firestore + Auth)
- **Frontend:** React + Vite + Tailwind CSS · Firebase Auth

> ⚠️ This repo intentionally does **not** include secrets (`.env`,
> `serviceAccountKey.json`). After cloning you must supply your **own** Firebase
> project and Gemini API key — see setup below. It will not run until you do.

---

## Prerequisites

- **Python 3.10+** and **Node.js 18+**
- A free **Google Gemini API key** — https://aistudio.google.com/apikey
- A free **Firebase project** — https://console.firebase.google.com

## 1. Clone & install

```bash
git clone <your-repo-url>
cd candAIdate-AI_Interview_agent

# Backend deps
python -m pip install -r requirements.txt

# Frontend deps
cd frontend
npm install
cd ..
```

## 2. Set up Firebase (one-time)

In the [Firebase console](https://console.firebase.google.com):

1. **Create a project.**
2. **Authentication** → Get started → **Sign-in method** → enable **Email/Password**.
3. **Firestore Database** → Create database → **start in test mode** (for development).
4. **Web app config** (frontend): Project Settings → *Your apps* → add a **Web** app →
   copy the `firebaseConfig` values.
5. **Service account** (backend): Project Settings → **Service accounts** →
   *Generate new private key* → save the JSON as **`serviceAccountKey.json`** in the
   **project root**. (Gitignored — never commit it.)

## 3. Configure environment files

```bash
# Backend (project root)
cp .env.example .env          # then paste your GEMINI_API_KEY

# Frontend
cp frontend/.env.example frontend/.env   # then paste your Firebase web config
```

Fill `frontend/.env` with the values from step 2.4:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

> The same Firebase project must back **both** the frontend (web config) and the
> backend (service account), so login tokens verify correctly.

## 4. Run (two terminals)

```bash
# Terminal 1 — backend (project root)
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

- Backend health check: http://127.0.0.1:8000/health
- App: http://localhost:5173

---

## Notes

- **Gemini free-tier limits:** the free tier is rate-limited per model. The agents
  automatically fall back across several models (`GEMINI_FALLBACK_MODELS`) on 429s.
  If everything is throttled at once, wait ~60s and retry.
- **Firestore test mode expires (~30 days).** Before then, add proper security rules
  so each user can only read their own `sessions`/`evaluations`.
- Backend base URLs are configurable in `frontend/.env`
  (`VITE_API_BASE`, `VITE_WS_BASE`) — default `127.0.0.1:8000`.

## Project layout

```
app/            FastAPI backend
  agents/       Gemini agents (parser, assessor, interviewer, coach)
  api/v1/       REST + WebSocket endpoints
  core/         config, firebase, db, security
frontend/       React + Vite + Tailwind app
requirements.txt
```
