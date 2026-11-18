# candAIdate Repository Structure

> **Current-state notice:** The active frontend includes Coding, Voice Interview,
> and Feedback/Recharts modules; the backend includes setup, coding, interview,
> and evaluation routers.

This file captures the repository layout from the latest project rescan. It includes source, configuration, local environment files, and generated output directories that are present in the workspace.

## Root

```text
candAIdate/
  .DS_Store
  .dockerignore
  .env
  .github/
    workflows/
      azure-deploy.yml
  .gitignore
  ARCHITECTURE.md
  BACKEND_CONTEXT.md
  DOCKER_DEPLOYMENT_PLAN.txt
  Dockerfile
  Dockerfile.backend
  Dockerfile.frontend
  PROJECT_STATUS_UPDATE.md
  PROJECT_STRUCTURE.md
  README.md
  app/
  debug_api.py
  debug_gemini_models.py
  debug_settings_load.py
  docker-compose.yml
  frontend/
  nginx.conf
  requirements.txt
  scripts/
  serviceAccountKey.json
  temp_candidate_audio.wav
  test_gemini.py
  venv/
```

## Backend Application

```text
app/
  .DS_Store
  Caddyfile
  agents/
    __init__.py
    _gemini.py
    assessor.py
    coach.py
    interviewer.py
    parser.py
  api/
    __init__.py
    v1/
      evaluate.py
      interview.py
      setup.py
      stream.py
  core/
    __init__.py
    config.py
    db.py
    firebase.py
    security.py
  main.py
  prompts/
    assessor_v1.yaml
    coach_v1.yaml
    interviewer_v1.yaml
    parser_v1.yaml
  services/
    __init__.py
    azure_search.py
    azure_speech.py
```

## Frontend Application

```text
frontend/
  .DS_Store
  .env
  .env.example
  .env.local
  .gitignore
  README.md
  dist/
    assets/
      index-CyvACQrV.css
      index-Denrv5k5.js
      vendor-BSsPaR36.js
    index.html
  index.html
  node_modules/
  package-lock.json
  package.json
  postcss.config.js
  src/
    App.jsx
    components/
      AmbientBackground.jsx
      AppShell.jsx
      Logo.jsx
      ProgressBar.jsx
      ProtectedRoute.jsx
      Spinner.jsx
    context/
      AuthContext.jsx
      InterviewContext.jsx
    firebase.js
    index.css
    lib/
      api.js
    main.jsx
    pages/
      Feedback.jsx
      History.jsx
      LiveInterview.jsx
      Login.jsx
      Profile.jsx
      Quiz.jsx
      Upload.jsx
  tailwind.config.js
  venv/
  vite.config.js
```

## Utility Scripts

```text
scripts/
  evals.py
  measure_latency.py
  seed_vector_db.py
```

## Generated, Local, or Environment-Specific Items

- `.git/`
- `frontend/dist/`
- `frontend/node_modules/`
- `venv/`
- `frontend/venv/`
