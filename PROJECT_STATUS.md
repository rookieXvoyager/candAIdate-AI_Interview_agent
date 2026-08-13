# candAIdate Project Status Update

Date: 2026-07-22
Scope: Repository sources and deployment assets at the project root, excluding generated dependency folders such as `node_modules/`, `venv/`, and build outputs.

## Executive Summary

The repo contains a functional AI mock-interview prototype with a clear product flow:
resume upload -> profile extraction -> quiz generation -> live interview -> coaching feedback -> history.

The audio processing path is now completed in the active interview flow. The WebSocket interview route accepts both typed and audio messages, runs Azure Speech STT on uploaded audio, generates interviewer audio with Azure TTS, and stores the resulting transcript for evaluation.

The current codebase is containerized and close to deployment-ready, but it is not fully production-hardened yet. The main remaining gaps are:
- security shortcuts in the backend auth path,
- local secret handling that still assumes mounted files,
- and deployment hardening that still needs a final production runbook.

The current deployment shape is a Dockerized multi-service stack behind `candaidate.app`, with Caddy routing requests to the FastAPI backend and the Nginx-served frontend. The actual deployable container definitions live in `Dockerfile.backend` and `Dockerfile.frontend`; the root `Dockerfile` is still only a placeholder.

The good news is that the major runtime pieces already exist in source form:
- a FastAPI backend,
- a React/Vite frontend,
- backend and frontend Dockerfiles,
- a reverse-proxy config for Caddy,
- and an application structure that is now wired for audio-enabled interviews.

## What Is Working

### Frontend
- The route funnel is wired end to end: `/login` -> `/dashboard` -> `/profile` -> `/quiz` -> `/interview` -> `/feedback` -> `/history`.
- Firebase Auth is integrated with sign-in, sign-up, logout, token retrieval, and protected routes.
- The upload screen validates resume type and file size before calling the backend parse endpoint.
- The profile and quiz screens consume parsed profile data and generated MCQs from client state.
- The live interview screen now supports typed input, browser speech recognition, and playback of interviewer audio.
- The history screen reads Firestore sessions and linked evaluations for the logged-in user.

### Backend
- `app/main.py` boots FastAPI with CORS, a global exception handler, and a health endpoint.
- `app/api/v1/setup.py` handles resume parsing and MCQ generation and writes both artifacts to Firestore.
- `app/api/v1/stream.py` is the active WebSocket interview route mounted by `main.py`.
- `app/api/v1/stream.py` now accepts both `text` and `audio` messages, calls Azure STT/TTS helpers, and persists transcript turns.
- `app/services/azure_speech.py` provides the STT and TTS helpers used by the live interview route.
- `app/agents/interviewer.py` now supports model fallback during the interview session and maintains conversation history across retries.
- `app/api/v1/evaluate.py` reads the transcript, runs the coaching agent, stores the evaluation, and updates session state.
- Firebase Admin initialization and Firestore helpers exist in `app/core/firebase.py` and `app/core/db.py`.

### Deployment Assets Present
- `Dockerfile.backend` exists and builds a Python backend container with the Azure Speech runtime libraries installed.
- `Dockerfile.frontend` exists and builds the frontend into an Nginx-served static image.
- `docker-compose.yml` wires the backend, frontend, and Caddy reverse proxy together.
- `Caddyfile` routes `candaidate.app` and `www.candaidate.app` to the backend API and frontend app.
- `nginx.conf` exists and provides SPA routing rules for the frontend.
- `serviceAccountKey.json` is present locally for development.
- `frontend/.env.example` documents the browser-side variables needed by the Vite app.
- `frontend/dist/` is checked in, including the current generated assets.

## What Is Incomplete or Risky

### Security and configuration
- `app/api/v1/setup.py` still uses a temporary UID bypass instead of the verified Firebase user identity.
- `app/core/security.py` is malformed and does not provide a reliable auth helper surface.
- `app/agents/parser.py` still contains a hardcoded Gemini key, and the debug scripts also embed API keys.
- `serviceAccountKey.json` is required locally, so deployment still needs a real secret-management plan instead of a checked-in file.
- `app/core/config.py` now centralizes Gemini primary and fallback model names, but `app/agents/interviewer.py` still carries its own hardcoded model list, so the model chain is not fully single-sourced yet.

### Containerization and runtime wiring
- The root `Dockerfile` is not a usable build recipe yet; it is a placeholder comment block.
- `docker-compose.yml` now matches the current backend, frontend, and reverse-proxy layout.
- The frontend Docker build now uses the checked-in root `nginx.conf` file.
- The compose file assumes a multi-container deployment, but there is no finalized VM bootstrap guide or production compose workflow checked in yet.
- The CI/CD workflow under `.github/workflows/azure-deploy.yml` is still only a placeholder comment.

### Domain and hosting setup
- `candaidate.app` is documented in the reverse proxy config, but the production VM runbook still needs to be finalized.
- Firebase Auth authorized domains still need to include the production hostnames before sign-in can be trusted in production.
- HTTPS termination and WebSocket proxy routing are configured through Caddy, but the deployment process still needs a final end-to-end validation pass.

### API surface and routing
- `app/api/v1/stream.py` is the active interview route, but `app/api/v1/interview.py` is a separate legacy implementation with a different message format and speech path.
- `app/main.py` only mounts the active stream route, so any Azure speech-enabled path that lives elsewhere is not the one the app currently serves.
- Azure speech and Azure Search settings exist, but Azure Search is not fully integrated into the main user path.

### Production readiness
- Firestore security rules are not documented here, so user data isolation still needs to be formalized.
- There is no committed smoke-test path that proves parse -> quiz -> interview -> evaluation after deployment.
- The repo includes local debug and temp files that should not be treated as production inputs.
- Checked-in build artifacts and local environment files are present, so the deployment story still needs a clean source-of-truth boundary.

## Azure VM Docker Deployment Requirements

### Requirements already implied by the repo
- Docker Engine and the Docker Compose plugin on the VM.
- A public IP or domain name for the VM.
- Inbound access for port 80, and optionally 443 for TLS termination.
- Environment variables for Gemini, Firebase web config, and Azure Speech.
- A mounted or provisioned Firebase service account file at runtime.
- Persisted storage for any runtime certificates or app state that should survive container restarts.

### Missing or not yet implemented in the repo
- A finalized production compose workflow that is explicitly documented and validated on the target VM.
- A startup story for secrets on the VM, such as mounted files or secure VM-side secret injection.
- A deployment smoke test or health-check workflow that validates the deployed stack end to end.
- Firestore rules and an auth-hardening pass before exposing the app publicly.
- A non-placeholder deployment workflow for building and pushing images or provisioning the VM.

## Current Assessment By Area

### Frontend
The UI is the most complete part of the system. Authentication UX, upload flow, quiz flow, live interview UX, and history views are coherent and close to production shape.

### Backend
The backend has the right feature set, and the live interview path is now functionally complete for both text and audio. The main flow works in concept, but auth, key management, and the duplicate interview route still need cleanup before the code can be trusted in production.

### Integrations
Firebase, Firestore, Gemini, and Azure Speech are integrated. Azure Search configuration is present, but it is not yet fully wired into the active user path.

### Docker and Azure VM readiness
The repo is now containerized in a coherent way: backend and frontend images are defined, and Caddy fronts the app for `candaidate.app` and `www.candaidate.app`. The root `Dockerfile` is still a placeholder, so the deployable path is the compose stack built from `Dockerfile.backend` and `Dockerfile.frontend`.

The production host should be treated as `https://candaidate.app`, with `www.candaidate.app` redirected or aliased as needed.

## Recommended Next Steps

1. Remove secret and auth shortcuts.
- Replace the hardcoded Gemini key with environment-based config.
- Remove the temporary UID bypass in the setup routes.
- Fix or replace `app/core/security.py` so the backend has one reliable auth path.

2. Align the container setup.
- Keep `docker-compose.yml` as the source of truth for the multi-container deployment.
- Verify the frontend static-server config path used by the Docker build.
- Document the exact VM startup sequence for backend, frontend, and Caddy.

3. Add Azure VM deployment prerequisites.
- Define how the Firebase service account is injected on the VM.
- Document the required VM ports, DNS, and TLS termination approach.
- Add a deployment smoke test and a health-check verification step.

4. Add production safeguards.
- Define Firestore security rules for per-user access.
- Move service-account handling to secure secrets for deployment.
- Add structured logging for auth failures, WebSocket disconnects, model errors, and audio processing failures.

5. Add real validation.
- Create a backend smoke test for parse -> quiz -> interview -> evaluation.
- Add a frontend or integration test for the login and protected-route flow.
- Replace the placeholder deployment workflow with a real CI/CD pipeline.

## Suggested Milestone State

- Milestone A, core auth plus funnel: Mostly implemented, but blocked on cleanup of auth and secret handling.
- Milestone B, live interview experience: Implemented for the active route, including STT/TTS and transcript persistence.
- Milestone C, production readiness: Not complete; security, deployment, and validation are still pending.