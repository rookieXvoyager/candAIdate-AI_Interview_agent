# candAIdate Project Status Update

Date: 2026-07-04
Scope: Status of the checked-in project sources under the repository root, excluding the virtual environment.

## Executive Summary

The repo contains a strong prototype for an AI mock-interview product, and the main user journey is present in both frontend and backend code:
- Frontend: React + Vite + Tailwind + Firebase Auth
- Backend: FastAPI + Gemini-based agents + Firebase Admin + Firestore
- Flow coverage: resume upload -> profile extraction -> quiz generation -> live interview -> coaching feedback -> history

The product is not yet production-ready. The biggest blockers are security and code-path consistency: there is a hardcoded Gemini key in the parser, a temporary auth bypass in the setup API, a malformed security helper module, and two competing live interview implementations where only one is mounted.

## What Is Working

### Frontend
- The route funnel is wired end to end: /login -> /dashboard -> /profile -> /quiz -> /interview -> /feedback -> /history.
- Firebase Auth is integrated with sign-in, sign-up, logout, token retrieval, and protected routes.
- The upload screen enforces file type and size checks before calling the backend parse endpoint.
- The profile and quiz screens consume parsed profile data and generated MCQs from in-memory state.
- The live interview screen connects to the WebSocket backend, supports typed input, browser speech recognition, and audio playback when AI audio is returned.
- The history screen reads Firestore sessions and linked evaluations for the logged-in user.

### Backend
- app/main.py boots FastAPI with CORS, a global exception handler, and a health endpoint.
- app/api/v1/setup.py implements resume parsing and MCQ generation, and writes both artifacts to Firestore.
- app/api/v1/stream.py is the active WebSocket interview route mounted by main.py.
- app/api/v1/evaluate.py reads the transcript, runs the coaching agent, stores the evaluation, and updates session state.
- app/agents/_gemini.py provides shared fallback/retry logic for model calls.
- Firestore helpers and Firebase Admin initialization are present in app/core/db.py and app/core/firebase.py.

## What Is Incomplete or Risky

### Security and configuration
- app/agents/parser.py still contains a hardcoded Gemini key, and the test/debug scripts also embed API keys.
- app/api/v1/setup.py uses a temporary uid bypass instead of the verified Firebase user identity.
- app/core/security.py is malformed and does not provide a reliable auth helper surface.
- serviceAccountKey.json is expected locally, so deployment needs a secret-management plan instead of a checked-in file.

### API surface and routing
- app/api/v1/stream.py is the active interview route, but app/api/v1/interview.py is a separate legacy implementation with a different message format and speech path.
- app/main.py only mounts app/api/v1/stream.py, so the Azure speech-enabled route is not the one the app currently serves.
- The Azure speech service exists in app/services/azure_speech.py, but it is only used by the legacy route, not the mounted one.

### Production readiness
- Firestore rules are not documented or enforced here, so user data isolation still needs to be formalized.
- .github/workflows/azure-deploy.yml is only a placeholder comment, so CI/CD is not actually configured.
- The repo has ad hoc debug scripts, but no clear automated test suite or smoke-test path for the full funnel.

## Current Assessment By Area

### Frontend
The UI is the most complete part of the system. Authentication UX, upload flow, quiz flow, live interview UX, and history views are all present and coherent.

### Backend
The backend has the correct feature set, but the implementation is internally inconsistent. The main flow works in concept, yet auth, key management, and duplicate interview routes need cleanup before the code can be trusted.

### Integrations
Firebase, Firestore, and Gemini are integrated. Azure configuration is present in settings and dependencies, but Azure speech is not wired into the active interview route, and Azure Search is only configured, not actually used.

## Recommended Next Steps

1. Remove secret and auth shortcuts.
- Replace the hardcoded Gemini key with environment-based config.
- Remove the temporary uid bypass in the setup routes.
- Fix or replace app/core/security.py so the backend has one reliable auth path.

2. Consolidate the interview pipeline.
- Choose one live interview implementation and archive the other.
- If speech is meant to stay, wire Azure speech into the active route; otherwise remove the unused dependency path.

3. Add production safeguards.
- Define Firestore security rules for per-user access.
- Move service-account handling to secure secrets for deployment.
- Add structured logging for auth failures, WebSocket disconnects, and model errors.

4. Add real validation.
- Create a backend smoke test for parse -> quiz -> interview -> evaluation.
- Add a frontend or integration test for the login and protected-route flow.
- Replace the placeholder deployment workflow with a real CI/CD pipeline.

## Suggested Milestone State

- Milestone A, core auth plus funnel: Mostly implemented, but blocked on cleanup of auth and secret handling.
- Milestone B, live interview experience: Partially implemented; the UI works, but the backend route split needs consolidation.
- Milestone C, production readiness: Not complete; security, deployment, and validation are still pending.
