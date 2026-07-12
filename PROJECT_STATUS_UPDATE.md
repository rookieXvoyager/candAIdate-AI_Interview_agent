# candAIdate Project Status Update

Date: 2026-07-12
Scope: Repository sources and deployment assets at the project root, excluding generated dependency folders such as `node_modules/`, `venv/`, and build outputs.

## Executive Summary

The repo contains a functional AI mock-interview prototype with a clear product flow:
resume upload -> profile extraction -> quiz generation -> live interview -> coaching feedback -> history.

The current codebase is not ready for an Azure VM Docker deployment without cleanup. The main gaps are:
- security shortcuts in the backend auth path,
- stale container orchestration wiring,
- secret handling that still assumes local files,
- and placeholder CI/CD files that do not deploy anything yet.

The intended deployment target is a single Azure VM behind the domain `candaidate.app`, with Docker Compose or equivalent container orchestration and a reverse proxy handling HTTPS plus WebSocket traffic.

The good news is that the major runtime pieces already exist in source form:
- a FastAPI backend,
- a React/Vite frontend,
- root backend and frontend Dockerfiles,
- a reverse-proxy config,
- and an application structure that is easy to containerize once the wiring is corrected.

One important caveat: the checked-in root `Dockerfile` is only a placeholder note, so the deployable container definitions are actually in `Dockerfile.backend` and `Dockerfile.frontend`.

## What Is Working

### Frontend
- The route funnel is wired end to end: `/login` -> `/dashboard` -> `/profile` -> `/quiz` -> `/interview` -> `/feedback` -> `/history`.
- Firebase Auth is integrated with sign-in, sign-up, logout, token retrieval, and protected routes.
- The upload screen validates resume type and file size before calling the backend parse endpoint.
- The profile and quiz screens consume parsed profile data and generated MCQs from client state.
- The live interview screen uses the WebSocket backend and supports typed input, browser speech recognition, and audio playback.
- The history screen reads Firestore sessions and linked evaluations for the logged-in user.

### Backend
- `app/main.py` boots FastAPI with CORS, a global exception handler, and a health endpoint.
- `app/api/v1/setup.py` handles resume parsing and MCQ generation and writes both artifacts to Firestore.
- `app/api/v1/stream.py` is the active WebSocket interview route mounted by `main.py`.
- `app/api/v1/evaluate.py` reads the transcript, runs the coaching agent, stores the evaluation, and updates session state.
- `app/agents/_gemini.py` provides shared fallback and retry logic for model calls.
- Firebase Admin initialization and Firestore helpers exist in `app/core/firebase.py` and `app/core/db.py`.

### Deployment Assets Present
- `Dockerfile.backend` exists and builds a Python backend container.
- `Dockerfile.frontend` exists and builds a static frontend image.
- `nginx.conf` exists and provides SPA routing rules for the frontend.
- `serviceAccountKey.json` is present locally for development.
- `frontend/.env.example` documents the browser-side variables needed by the Vite app.
- `frontend/dist/` is checked in, including the current generated assets such as `vendor-BSsPaR36.js`.

## What Is Incomplete or Risky

### Security and configuration
- `app/api/v1/setup.py` still uses a temporary UID bypass instead of the verified Firebase user identity.
- `app/core/security.py` is malformed and does not provide a reliable auth helper surface.
- `app/agents/parser.py` still contains a hardcoded Gemini key, and the debug scripts also embed API keys.
- `serviceAccountKey.json` is required locally, so deployment needs a real secret-management plan instead of a checked-in file.

### Containerization and runtime wiring
- The root `Dockerfile` is not a usable build recipe yet; it is a placeholder comment block.
- `docker-compose.yml` now matches the current backend, frontend, and reverse-proxy layout.
- The frontend Docker build now uses the checked-in root `nginx.conf` file.
- The compose file also assumes a multi-container setup, but there is no validated VM bootstrap guide or production compose workflow yet.
- The CI/CD workflow under `.github/workflows/azure-deploy.yml` is only a placeholder comment.

### Domain and hosting setup
- `candaidate.app` is not yet documented as the production origin in a VM deployment runbook.
- Firebase Auth authorized domains still need to include the production hostnames before sign-in can be trusted in production.
- HTTPS termination and WebSocket proxy routing still need a final deployment choice.

### API surface and routing
- `app/api/v1/stream.py` is the active interview route, but `app/api/v1/interview.py` is a separate legacy implementation with a different message format and speech path.
- `app/main.py` only mounts the active stream route, so any Azure speech-enabled path that lives elsewhere is not the one the app currently serves.
- Azure speech and Azure Search settings exist, but they are not fully operational in the main user path.

### Production readiness
- Firestore security rules are not documented here, so user data isolation still needs to be formalized.
- There is no committed smoke-test path that proves parse -> quiz -> interview -> evaluation after deployment.
- The repo includes local debug and temp files that should not be treated as production inputs.
- Checked-in build artifacts and local environment files are present, so the deployment story still needs a clean source-of-truth boundary.

## Azure VM Docker Deployment Requirements

### Requirements already implied by the repo
- Docker Engine and the Docker Compose plugin on the VM.
- A public IP or domain name for the VM.
- Inbound access for port 80, and optionally 443 if TLS termination is added.
- Environment variables for Gemini and Firebase web config.
- A mounted or provisioned Firebase service account file at runtime.
- Persisted storage for any runtime certificates or app state that should survive container restarts.

### Missing or not yet implemented in the repo
- A corrected production compose file that references the real Dockerfiles and config paths.
- A startup story for secrets on the VM, such as mounted files or secure VM-side secret injection.
- A documented TLS strategy for the VM, either Nginx, Caddy, or another reverse proxy.
- Firestore rules and an auth-hardening pass before exposing the app publicly.
- A non-placeholder deployment workflow for building and pushing images or provisioning the VM.
- A smoke-test or health-check workflow that validates the deployed stack end to end.

## Current Assessment By Area

### Frontend
The UI is the most complete part of the system. Authentication UX, upload flow, quiz flow, live interview UX, and history views are coherent and close to production shape.

### Backend
The backend has the right feature set, but the implementation is still internally inconsistent. The main flow works in concept, yet auth, key management, and duplicate interview routes need cleanup before the code can be trusted in production.

### Integrations
Firebase, Firestore, and Gemini are integrated. Azure configuration is present in settings and dependencies, but Azure speech is not wired into the active interview route, and Azure Search is only configured, not fully integrated.

### Docker and Azure VM readiness
The repo is close to containerizable, but not yet deployment-safe. The deployable Dockerfiles exist, the compose file has been realigned, but the root `Dockerfile` is still a placeholder and the VM bootstrap steps still need to be documented and rehearsed.

The production host should be treated as `https://candaidate.app`, with `www.candaidate.app` redirected or aliased as needed.

## Recommended Next Steps

1. Remove secret and auth shortcuts.
- Replace the hardcoded Gemini key with environment-based config.
- Remove the temporary UID bypass in the setup routes.
- Fix or replace `app/core/security.py` so the backend has one reliable auth path.

2. Align the container setup.
- Update `docker-compose.yml` to match the real Dockerfiles and config paths.
- Verify the frontend static-server config path used by the Docker build.
- Decide whether the VM will run one reverse proxy or a two-container backend/frontend split.

3. Add Azure VM deployment prerequisites.
- Define how the Firebase service account is injected on the VM.
- Document the required VM ports, DNS, and TLS termination approach.
- Add a deployment smoke test and a health-check verification step.

4. Add production safeguards.
- Define Firestore security rules for per-user access.
- Move service-account handling to secure secrets for deployment.
- Add structured logging for auth failures, WebSocket disconnects, and model errors.

5. Add real validation.
- Create a backend smoke test for parse -> quiz -> interview -> evaluation.
- Add a frontend or integration test for the login and protected-route flow.
- Replace the placeholder deployment workflow with a real CI/CD pipeline.

## Suggested Milestone State

- Milestone A, core auth plus funnel: Mostly implemented, but blocked on cleanup of auth and secret handling.
- Milestone B, live interview experience: Partially implemented; the UI works, but the backend route split needs consolidation.
- Milestone C, production readiness: Not complete; security, deployment, and validation are still pending.
