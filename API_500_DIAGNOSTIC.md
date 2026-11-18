# `/api/v1/setup/sample-jd` 500 Error Diagnostic

> **Current production status:** This file preserves historical troubleshooting
> details. The current workflow is
> `pending_assessment -> pending_coding -> pending_interview -> completed`,
> `/quiz` advances to `/coding`, Groq is the configured fallback, and
> `/api/v1/evaluate/{session_id}` produces holistic MCQ/Coding/Interview scores.

## Scope

This report covers the frontend, backend, Docker, and Caddy configuration
related to:

- `VITE_API_URL`
- localhost or port `8000` API URLs
- `/api/v1/setup/sample-jd`
- Gemini/Groq model selection and fallback behavior
- Docker service-to-service routing

The fixes listed in the **Applied fixes** section have now been applied. Provider
credentials were checked for presence without exposing their values; their
validity was not tested by sending them to external providers.

## Applied fixes

The following changes were applied:

- `Dockerfile.frontend` now exports the `VITE_API_URL` build argument before
  running the Vite build.
- `docker-compose.yml` now allows `VITE_API_URL` to be supplied by the
  deployment environment and defaults to `http://localhost` for local Docker.
- `frontend/src/lib/api.js` now falls back to `window.location.origin` when the
  build variable is empty, and WebSockets derive from the same resolved base.
- `app/core/config.py` now exposes configurable `GROQ_API_BASE` and
  `GROQ_MODEL` settings.
- `app/agents/generator.py` now uses the Groq OpenAI-compatible endpoint and
  `GROQ_API_KEY` instead of xAI/Grok configuration.

## Executive summary

The frontend request path is correct:

```text
/api/v1/setup/sample-jd
```

The backend route is also mounted correctly under the same prefix. The likely
causes of the observed 500 are:

1. The Docker Compose build sets `VITE_API_URL` to `http://localhost`, which
   makes the browser call the user's own machine instead of the Caddy public
   origin.
2. `Dockerfile.frontend` declares `ARG VITE_API_URL` but never exports it as an
   environment variable before `npm run build`. Vite may therefore receive an
   empty value during the production build.
3. The sample-JD generator makes a Gemini request with Google Search grounding,
   then conditionally falls back to Grok. Invalid model access, invalid Gemini
   credentials, unsupported grounding, or invalid Grok credentials/model names
   can all surface as a 500 from the endpoint.
4. The Grok fallback uses a hardcoded xAI endpoint instead of the configured
   `settings.GROK_API_BASE`.

## Findings and suggested fixes

### 1. Docker Compose hardcodes the frontend API origin to localhost

**File:** `docker-compose.yml`  
**Line:** 35

Current configuration:

```yaml
VITE_API_URL: "http://localhost"
```

This value is compiled into the browser bundle. When a user accesses the
deployed frontend, `localhost` means the user's own computer, not the Caddy
container.

Suggested fix for the production deployment:

```yaml
VITE_API_URL: "https://candaidate.app"
```

If the frontend and API are always served from the same Caddy origin, a
same-origin value may also be used:

```yaml
VITE_API_URL: ""
```

The request code must then avoid producing an invalid URL such as
`undefined/api/v1/...`. A safer implementation is:

```js
export const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;
```

The API request remains:

```js
fetch(`${API_BASE}/api/v1/setup/sample-jd?role=${encodeURIComponent(jobTitle)}&experience=${encodeURIComponent(experience)}`, options);
```

### 2. Dockerfile does not expose `VITE_API_URL` to the Vite build

**File:** `Dockerfile.frontend`  
**Line:** 11

Current declaration:

```dockerfile
ARG VITE_API_URL
```

The other Vite build arguments are copied into `ENV` variables, but
`VITE_API_URL` is not. Declaring an `ARG` alone does not guarantee that the
variable is available to the `npm run build` process.

Suggested fix:

```dockerfile
ARG VITE_API_URL

ENV VITE_API_URL=${VITE_API_URL}
```

Place the `ENV` line before:

```dockerfile
RUN npm run build
```

After changing this, rebuild the frontend image so the value is compiled into
the static bundle:

```bash
docker compose build --no-cache frontend
docker compose up -d
```

### 3. Frontend API calls are correctly routed through `API_BASE`

**File:** `frontend/src/lib/api.js`  
**Lines:** 7–10

Current code:

```js
export const API_BASE = import.meta.env.VITE_API_URL;
export const WS_BASE = import.meta.env.VITE_API_URL.replace(/^http/, "ws");
```

The API calls found under `frontend/src/` import `API_BASE`; they do not
hardcode a backend port. The sample-JD call is correctly formed:

**File:** `frontend/src/pages/Upload.jsx`  
**Lines:** 84–86

```js
const res = await fetch(
  `${API_BASE}/api/v1/setup/sample-jd?role=${encodeURIComponent(jobTitle)}&experience=${encodeURIComponent(experience)}`, 
  { headers: { Authorization: `Bearer ${token}` } }
);
```

Recommended defensive version:

```js
const apiBase = import.meta.env.VITE_API_URL || window.location.origin;

const res = await fetch(
  `${apiBase}/api/v1/setup/sample-jd?role=${encodeURIComponent(jobTitle)}&experience=${encodeURIComponent(experience)}`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

Alternatively, keep the shared constant and make it defensive:

```js
export const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;
export const WS_BASE = API_BASE.replace(/^http/, "ws");
```

### 4. The `/sample-jd` route and frontend path match

**File:** `app/api/v1/setup.py`  
**Lines:** 127–139

Route declaration:

```python
@router.get("/sample-jd")
async def get_sample_jd(
    role: str = Query(..., description="Target job title"),
    experience: str = Query("Mid-Level", description="Experience level (Entry, Mid, Senior, etc)"),
    uid: str = Depends(get_current_user_uid)
):
    ...
    jd_text = await generate_sample_jd(role, experience)
```

**File:** `app/main.py`  
**Line:** 34

Router mounting:

```python
app.include_router(setup_router, prefix="/api/v1/setup", tags=["Setup & Pre-screening"])
```

The final backend route is therefore:

```text
GET /api/v1/setup/sample-jd?role=...&experience=...
```

No path correction is required.

### 5. Sample-JD generation uses a separate Gemini implementation

**File:** `app/agents/generator.py`  

#### Gemini request

**Lines:** 31–39

```python
response = client.models.generate_content(
    model=settings.GEMINI_MODEL, 
    contents=prompt,
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    )
)
```

Potential failure sources include:

- `GEMINI_MODEL` is unavailable to the configured API key.
- The Gemini API key is invalid, missing, or restricted.
- Google Search grounding is unavailable for the selected model/account.
- The model returns an error that is not classified as a retryable error.
- The synchronous SDK call blocks the async FastAPI worker while the external
  request is running.

Suggested diagnostic-safe change:

```python
response = client.models.generate_content(
    model=settings.GEMINI_MODEL,
    contents=prompt,
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    ),
)
```

For production reliability, validate the configured model and API key during
deployment, and consider removing Search grounding from this endpoint unless
the selected Gemini model and account are confirmed to support it:

```python
response = client.models.generate_content(
    model=settings.GEMINI_MODEL,
    contents=prompt,
)
```

#### Gemini-to-Grok fallback

**Lines:** 43–48

```python
if "429" in err_str or "quota" in err_str or "exhausted" in err_str or "503" in err_str or "overloaded" in err_str:
    print(f"⚠️ Gemini is rate-limited or busy. Falling back to Grok for JD Generation...")
    return await _fallback_to_grok(prompt)

raise e
```

This fallback is only used for rate-limit or overload-like errors. A 400 or 403
from Gemini is re-raised and becomes a 500 from the route. That behavior can
make model configuration errors appear as generic server errors.

Suggested approach:

```python
except Exception as exc:
    err_str = str(exc).lower()
    transient = (
        "429" in err_str
        or "quota" in err_str
        or "exhausted" in err_str
        or "503" in err_str
        or "overloaded" in err_str
    )
    if transient and settings.GROK_API_KEY:
        return await _fallback_to_grok(prompt)
    raise
```

Do not silently fall back for authentication, permission, invalid-model, or
invalid-request errors. Those should be fixed in deployment configuration or
reported as a clear upstream configuration error.

#### Hardcoded Grok base URL

**File:** `app/agents/generator.py`  
**Line:** 61

Current code:

```python
base_url="https://api.x.ai/v1",
```

The backend configuration already defines:

**File:** `app/core/config.py`  
**Line:** 22

```python
GROK_API_BASE: str = "https://api.x.ai/v1"
```

Suggested fix:

```python
base_url=settings.GROK_API_BASE,
```

This allows the endpoint to be changed through `.env` without modifying code.
It also prevents a mismatch between configured and actual fallback endpoints.

#### Grok fallback can independently produce 403/400/500 errors

**File:** `app/agents/generator.py`  
**Lines:** 53–75

```python
grok_key = os.getenv("GROK_API_KEY")
...
response = await openai_client.chat.completions.create(
    model="grok-4.6",
    messages=[
        {"role": "system", "content": "You are an expert HR recruiter with access to real-time tech trends."},
        {"role": "user", "content": prompt},
    ],
)
```

Potential failure sources include:

- `GROK_API_KEY` is absent, invalid, expired, or not authorized for the model.
- `grok-4.6` is unavailable for the configured xAI account.
- The xAI endpoint rejects the OpenAI-compatible request.
- The fallback is invoked even though the primary Gemini error has not been
  confirmed to be recoverable.

Suggested configuration-driven version:

```python
grok_key = settings.GROK_API_KEY
if not grok_key:
    raise RuntimeError("GROK_API_KEY is not configured")

openai_client = AsyncOpenAI(
    api_key=grok_key,
    base_url=settings.GROK_API_BASE,
)

response = await openai_client.chat.completions.create(
    model=settings.GROK_MODEL,
    messages=[
        {
            "role": "system",
            "content": "You are an expert HR recruiter with access to real-time tech trends.",
        },
        {"role": "user", "content": prompt},
    ],
)
```

The corresponding settings should be explicit:

```python
GROK_API_KEY: Optional[str] = None
GROK_API_BASE: str = "https://api.x.ai/v1"
GROK_MODEL: str = "grok-4.7"
```

Use a model name confirmed as available for the account. Do not expose API key
values in frontend variables or commit them to source control.

### 6. Backend route currently converts upstream failures into generic 500

**File:** `app/api/v1/setup.py`  
**Lines:** 138–143

Current code:

```python
try:
    jd_text = await generate_sample_jd(role, experience)
    return {"jd_text": jd_text}
except Exception as e:
    print(f"🚨 JD Generation Error: {str(e)}")
    raise HTTPException(status_code=500, detail="Failed to generate sample job description")
```

This hides whether the failure came from Gemini, Grok, authentication, an
invalid model, or a network timeout. It also makes the frontend unable to show
the actual upstream category.

Suggested production-safe handling:

```python
except HTTPException:
    raise
except Exception:
    logger.exception("JD generation failed")
    raise HTTPException(
        status_code=502,
        detail="The AI provider could not generate a job description.",
    )
```

Use structured server logging for the original exception, but do not return
provider credentials, request headers, or full upstream responses to the
browser.

### 7. Caddy is configured for the `localhost` site address

**File:** `Caddyfile`  
**Line:** 1

Current code:

```caddyfile
http://localhost {
```

For a deployed domain, use the actual host:

```caddyfile
candaidate.app, www.candaidate.app {
```

The proxy targets should remain Docker service hostnames:

```caddyfile
handle /api/* {
    reverse_proxy backend:8000
}
```

Do not replace `backend:8000` with `import.meta.env.VITE_API_URL`; that is an
internal Docker network address used only by Caddy.

### 8. Backend internal service routing is correct in the current worktree

**File:** `app/api/v1/stream.py`  
**Line:** 161

```python
await client.post(f"http://backend:8000/api/v1/evaluate/{session_id}")
```

`backend:8000` is appropriate for backend-to-backend Docker traffic. It should
not be used in browser JavaScript, and browser JavaScript should not use
`127.0.0.1:8000`.

## Frontend URL audit

The following frontend calls use the shared `API_BASE` or `WS_BASE` and have
correct `/api/v1/...` paths:

| File | Endpoint |
|---|---|
| `frontend/src/pages/CodingAssessment.jsx` | `/api/v1/coding/questions` |
| `frontend/src/pages/CodingAssessment.jsx` | `/api/v1/coding/execute` |
| `frontend/src/pages/CodingAssessment.jsx` | `/api/v1/coding/submit` |
| `frontend/src/pages/Feedback.jsx` | `/api/v1/evaluate/{sessionId}` |
| `frontend/src/pages/LiveInterview.jsx` | `/api/v1/interview/stream/{sessionId}` |
| `frontend/src/pages/Profile.jsx` | `/api/v1/setup/generate-mcq` |
| `frontend/src/pages/Upload.jsx` | `/api/v1/setup/sample-jd` |
| `frontend/src/pages/Upload.jsx` | `/api/v1/setup/parse` |

No direct `localhost:8000` or `127.0.0.1:8000` browser fetch was found under
`frontend/src/`.

## Additional stale configuration references

These are not the runtime source of the current `/sample-jd` 500, but they can
cause configuration drift:

### `frontend/.env.example`, lines 11–12

```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_WS_BASE=ws://127.0.0.1:8000
```

Suggested replacement:

```env
VITE_API_URL=https://candaidate.app
```

### `README.md`, lines 74–75 and 109

The documentation still refers to `VITE_API_BASE` and `VITE_WS_BASE`. Update it
to document `VITE_API_URL` so new deployments do not use obsolete variable names.

## Recommended verification sequence

1. Set the production `VITE_API_URL` in `docker-compose.yml` or the deployment
   environment.
2. Export `VITE_API_URL` in `Dockerfile.frontend` before `npm run build`.
3. Use the actual production hostname in `Caddyfile`.
4. Rebuild the frontend image; Vite variables are build-time values.
5. Confirm the backend environment contains a valid `GEMINI_API_KEY`.
6. Confirm `GEMINI_MODEL` is available to that key.
7. Temporarily disable Search grounding if the selected model/account does not
   support it.
8. Configure `GROK_API_KEY`, `GROK_API_BASE`, and a confirmed available
   `GROK_MODEL` before enabling Grok fallback.
9. Inspect backend logs for the original provider exception after making a
   request with an authenticated token.

The endpoint should ultimately be called as:

```text
GET https://candaidate.app/api/v1/setup/sample-jd?role=Software%20Engineer&experience=Mid-Level
```

## Validation results

- `docker compose config --quiet` passed.
- Provider variables `GEMINI_API_KEY`, `GROK_API_KEY`, `GEMINI_MODEL`,
  `GEMINI_FALLBACK_MODELS`, and `VITE_API_URL` are present in `.env`; secret
  values were not printed or transmitted for this check.
- `python3 -m compileall -q app` passed.
- `cd frontend && npm run build` passed.
- A targeted scan found no remaining `127.0.0.1:8000`, `localhost:8000`,
  hardcoded xAI base URL, or hardcoded Grok model in the runtime application
  files.
- Provider key validity and model entitlement still require an authenticated
  provider request; this report deliberately did not transmit the secrets to
  third-party APIs.

## Latest log diagnosis

The supplied logs show this sequence:

```text
Gemini is rate-limited or busy
Grok fallback failed: Error code: 400
GET /api/v1/setup/sample-jd ... 500
```

This proves that the browser-to-Caddy route is working and the backend route is
being reached. The failure is in the external provider fallback, not in the
frontend URL or `/api/v1/setup/sample-jd` path.

The workspace configuration contains a Grok key with a Groq-style credential
prefix. xAI and Groq use different providers and credentials; a Groq key cannot
authenticate against `https://api.x.ai/v1`. Replace the value of
`GROK_API_KEY` with a real xAI API key. Because the credential was pasted into
the conversation, revoke and rotate that exposed key and any other exposed
provider keys before continuing. Secret values are intentionally not reproduced
in this report.

The fallback model default is now `grok-4.7`, which is listed in xAI's current
model documentation. It remains configurable through:

```env
GROK_MODEL=grok-4.7
GROK_API_BASE=https://api.x.ai/v1
```

The fallback now reports the upstream status in backend logs, rejects empty
responses, and returns HTTP 502 to the frontend instead of misrepresenting an
external provider failure as an internal application error.

## Selected provider: xAI

The selected fallback provider is xAI. Keep the backend configuration pointed
at xAI:

```env
GROK_API_KEY=<new-xai-api-key>
GROK_API_BASE=https://api.x.ai/v1
GROK_MODEL=grok-4.7
```

The current value in `.env` must be replaced manually with a newly generated
xAI key. The existing Groq credential is intentionally not copied into
`GROK_API_KEY`, and no secret value is written to this report. After replacing
the key, rebuild the backend image because Docker loads `.env` when the
container is recreated:

```bash
docker compose build --no-cache backend
docker compose up -d backend
```

## MCQ partial and unanswered submission support

The MCQ quiz now sends a fixed-length answer array on manual or timer-based
submission. Unanswered indexes are represented by `null` instead of `undefined`.

The frontend submit button remains enabled whenever the assessment is loaded
and only disables while a submission request is in progress. Manual submission
prompts for confirmation when one or more questions are unanswered.

The backend endpoint:

```text
POST /api/v1/setup/submit-mcq/{session_id}
```

accepts:

```json
{"answers":["A",null,"C"]}
```

Missing answers default to `null`. Questions after the submitted array length
are also treated as unanswered. The grading result includes:

- `correct`
- `total`
- `unanswered`
- `percentage`
- a per-question `breakdown`

Unanswered questions receive zero points and are labeled `"unanswered"`.
Incorrect questions are labeled `"incorrect"`, and correct questions are labeled
`"correct"`. The session is updated to `pending_interview` and persists
`mcq_answers` and `mcq_result`.

Until the xAI key is replaced, the explicit 502 response is expected and
prevents sending a Groq credential to the xAI endpoint.

## Fallback provider changed to Groq

The fallback has now been migrated from xAI/Grok to Groq's OpenAI-compatible
API. The active runtime configuration is:

```env
GROQ_API_KEY=<your-groq-api-key>
GROQ_API_BASE=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
```

The existing `GROK_*` settings are no longer used by the sample-JD generator.
Add the Groq key obtained from GroqCloud to `GROQ_API_KEY`; do not copy it into
any `GROK_*` variable.

The interviewer, assessor, and coaching agents now also use
`settings.GROQ_MODEL` for their Groq fallback calls, so one configured model
setting is shared across all Groq fallbacks.

The selected default model is `openai/gpt-oss-120b`, which is currently listed
by Groq. Groq model availability and rate limits can change, so the model
remains configurable through `GROQ_MODEL`. The active model list can be checked
with Groq's `/openai/v1/models` endpoint using the key locally, without
committing the key.

The workspace currently contained duplicate Groq keys, and both returned HTTP
403 from Groq's models endpoint. The duplicate credentials were removed from
`.env`, leaving one empty `GROQ_API_KEY` entry. Add a newly generated Groq
developer/free-tier key before testing model access. The model endpoint must
return the configured model ID for that key; free-tier quotas and access are
account-specific and cannot be guaranteed from source code alone.

## Gemini model inventory and free-tier setup

### Current Gemini models

The current `.env` configuration is:

```env
GEMINI_MODEL=gemini-4-hydrogen
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite
```

`gemini-4-hydrogen` is the primary Gemini model. It is used by the parser,
assessor, interviewer, coaching agent, and sample-JD generator.

`gemini-3.5-flash-lite` is the secondary Gemini model. It is used by the
parser, assessor, interviewer, and coaching agent through
`settings.resolved_models`. The sample-JD generator currently uses only the
primary Gemini model and falls back to Groq when Gemini returns a transient
failure.

The shared Gemini fallback implementation is in `app/agents/_gemini.py`.
Primary and secondary model settings are centralized in
`app/core/config.py`.

### Recommended free-tier configuration

For a cost-efficient configuration, use the following after confirming that
both model IDs are available to the Google API key:

```env
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite
```

Google's current model documentation recommends `gemini-3.5-flash-lite` for
new, high-throughput projects. Model availability and quotas are project
specific, so `gemini-3.1-flash-lite` should only be retained if it appears in
the model-list response for the configured key.

### Creating a Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/).
2. Sign in with a Google account.
3. Select **Get API key**.
4. Create or select a Google Cloud project.
5. Create the API key.
6. Keep the key only in `.env`; do not commit or paste it into source files.

Configure it as:

```env
GEMINI_API_KEY=<your-gemini-api-key>
```

### Verify Gemini model access

From the project directory, list models without printing the key:

```bash
export GEMINI_API_KEY="$(grep '^GEMINI_API_KEY=' .env | cut -d= -f2-)"

curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```

Confirm that the response contains every model configured in
`GEMINI_MODEL` and `GEMINI_FALLBACK_MODELS`.

Test the recommended primary model directly:

```bash
curl \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Write one sentence about software engineering."
          }
        ]
      }
    ]
  }'
```

A successful response confirms that the key, model, and API access work.
`429 RESOURCE_EXHAUSTED` means the model is reachable but the project's
free-tier quota has been exceeded.

After confirming access, rebuild the backend:

```bash
docker compose build --no-cache backend
docker compose up -d backend
```

Free-tier quotas are enforced per Google Cloud project. The Groq fallback
should remain configured because Gemini free-tier limits can still trigger
transient `429` or overload errors.

## Applied Gemini model update

The backend is now configured to use the requested Gemini model chain:

```env
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite
```

The Python defaults in `app/core/config.py` match those values, while
`app/agents/_gemini.py` remains model-agnostic: it receives the ordered model
list from `settings.resolved_models` and does not hardcode a Gemini model ID.
The Groq fallback configuration and calls remain unchanged as the ultimate
fallback when the Gemini chain exhausts retryable errors.

## Sample-JD generator update

`app/agents/generator.py` now uses the requested three-stage flow:

1. Gemini with `settings.GEMINI_MODEL`.
2. Groq with `AsyncGroq`, `GROQ_API_KEY`, and `GROQ_MODEL`.
3. A deterministic hardcoded job-description stub if both providers fail.

The stub ensures `/api/v1/setup/sample-jd` still returns usable text instead of
propagating an upstream provider error to the UI.

## Cloudflare Tunnel deployment configuration

This section exposes the Docker Compose stack at `https://candaidate.app` using
Cloudflare Tunnel while retaining Caddy as the internal router.

Cloudflare terminates public HTTPS. Cloudflared connects to Caddy over the
Docker network at `http://caddy:80`. Caddy then routes API requests to
`backend:8000` and all other requests to `frontend:80`.

### Updated `docker-compose.yml`

Add the `cloudflared` service below the existing `caddy` service. Keep the
Judge0, PostgreSQL, and Redis services unchanged:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: candaidate-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN:?TUNNEL_TOKEN must be set in .env}
    depends_on:
      - caddy
    networks:
      - candaidate-net
```

The Caddy service should expose only internal HTTP for the tunnel:

```yaml
  caddy:
    image: caddy:latest
    container_name: candaidate-caddy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend
      - frontend
    networks:
      - candaidate-net
```

The complete Compose file must retain the existing `candaidate-net` network:

```yaml
networks:
  candaidate-net:
    driver: bridge
```

### Updated `Caddyfile`

Replace the Caddyfile with:

```caddyfile
:80 {
    @api path /api/*
    handle @api {
        reverse_proxy backend:8000 {
            header_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
            header_up X-Forwarded-Host {http.request.header.X-Forwarded-Host}
        }
    }

    handle /health {
        reverse_proxy backend:8000
    }

    handle /docs {
        reverse_proxy backend:8000
    }

    handle /openapi.json {
        reverse_proxy backend:8000
    }

    handle {
        reverse_proxy frontend:80 {
            header_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
            header_up X-Forwarded-Host {http.request.header.X-Forwarded-Host}
        }
    }

    encode zstd gzip
}
```

The `:80` site address prevents Caddy from attempting its own public
Let's Encrypt certificate. Cloudflare handles HTTPS at the edge and sends
traffic to the tunnel over the configured tunnel service.

### `.env` updates

Preserve all existing API keys and add or update only:

```env
VITE_API_URL=https://candaidate.app
TUNNEL_TOKEN=<your-cloudflare-tunnel-token>
```

`VITE_API_URL` is a Vite build-time value. Rebuild the frontend after changing
it:

```bash
docker compose build --no-cache frontend
```

Never commit `.env` or expose `TUNNEL_TOKEN`.

### Cloudflare Tunnel hostname and service

In the Cloudflare dashboard:

1. Create or select a Cloudflare Tunnel.
2. Obtain its tunnel token.
3. Add the token to `.env` as `TUNNEL_TOKEN`.
4. Configure the public hostname:

```text
Hostname: candaidate.app
Service:  http://caddy:80
```

If `www.candaidate.app` is also required, add it as a second public hostname
and route it to the same `http://caddy:80` service.

The Cloudflare Tunnel container must use the same Docker network as Caddy so
that the hostname `caddy` resolves internally.

### Start and verify the deployment

Validate the Compose file:

```bash
docker compose config --quiet
```

Start the stack:

```bash
docker compose up -d
```

Inspect tunnel logs:

```bash
docker compose logs -f cloudflared
```

Verify the public routes:

```bash
curl -I https://candaidate.app/
curl https://candaidate.app/health
curl -I https://candaidate.app/docs
```

The expected routing is:

| Public path | Internal destination |
|---|---|
| `/api/*` | `http://backend:8000` |
| `/health` | `http://backend:8000` |
| `/docs` | `http://backend:8000` |
| `/openapi.json` | `http://backend:8000` |
| All other paths | `http://frontend:80` |

### Registrar and DNS provider arrangement

The domain may remain registered and renewed through name.com. Cloudflare
Tunnel does not require transferring the domain registration.

For the recommended setup:

1. Add `candaidate.app` to Cloudflare.
2. Copy the two Cloudflare-assigned nameservers.
3. In name.com, replace the current authoritative nameservers with the
   Cloudflare nameservers.
4. Configure the Cloudflare Tunnel public hostname as:

```text
Hostname: candaidate.app
Service:  http://caddy:80
```

5. Optionally add `www.candaidate.app` as another public hostname targeting
   `http://caddy:80`.

The registration remains at name.com; Cloudflare only becomes the authoritative
DNS provider and HTTPS/Tunnel edge. Do not create an A record pointing to
`localhost`, and do not expose backend port `8000` to the public internet.

Set the frontend API origin to the public hostname:

```env
VITE_API_URL=https://candaidate.app
```

Because `VITE_API_URL` is compiled into the static frontend bundle, rebuild
after changing it:

```bash
docker compose build --no-cache frontend
docker compose up -d
```

If the domain currently has working name.com HTTP/HTTPS records, preserve them
until the Cloudflare nameserver delegation and tunnel are ready. After DNS
propagation, remove conflicting records from the active Cloudflare zone so
traffic is sent exclusively through the tunnel.

### Cost verification

This architecture can use Cloudflare's Free plan for the basic public web
deployment:

| Component | Expected cost |
|---|---|
| Cloudflare Tunnel / `cloudflared` public HTTP routing | No separate Tunnel subscription required for this use case |
| Cloudflare DNS | Free plan available |
| Cloudflare edge HTTPS / Universal SSL | Included on the Free plan |
| Caddy | Open source; no license fee |
| Domain registration and renewal at name.com | Paid according to name.com's current renewal price |
| Docker host, VM, electricity, or cloud server | Depends on where this stack runs |
| Gemini API | Free-tier quota may be available, subject to Google's project limits |
| Groq API | Free/developer quota may be available, subject to Groq account limits |

Therefore, Cloudflare Tunnel itself does not require adding a paid Cloudflare
plan for this deployment, but the complete system is not guaranteed to be
zero-cost. Domain renewal and the machine hosting Docker remain separate
costs, and Gemini/Groq free-tier access is limited by account quotas and
provider policy.

Cloudflare may impose product-specific restrictions on high-volume traffic,
large files, video, or other nonstandard workloads. This application uses
ordinary HTTP API and frontend traffic, but current Cloudflare terms should be
checked before production-scale usage.

### Cost verification checklist

Before going live, verify:

1. The Cloudflare account is on the Free plan unless paid features are
   intentionally enabled.
2. The domain renewal price and renewal date are known in name.com.
3. The Docker host has no unexpected compute, bandwidth, or storage charges.
4. Gemini and Groq quotas are visible in their respective dashboards.
5. No Cloudflare Access, seat-based Zero Trust, or other paid add-on is
   enabled accidentally.

## Firebase OAuth audit

The login implementation now uses `signInWithPopup` for Google, GitHub, and
Microsoft. No OAuth flow should call `signInWithRedirect`.

Provider configuration:

- Google: `email` and `profile` scopes, plus `prompt: "select_account"`
- GitHub: `read:user` and `user:email` scopes
- Microsoft: `email`, `profile`, and `openid` scopes, plus
  `prompt: "select_account"`

`AuthContext` updates `currentUser` from both the popup credential and
`onAuthStateChanged`, and the login page navigates to `/dashboard` after a
successful popup.

Firebase `auth/unauthorized-domain` is a Firebase Console configuration issue,
not a React or Caddy routing issue. Add both domains before testing:

```text
candaidate.app
localhost
```

In Firebase Console:

1. Open Authentication.
2. Open Settings.
3. Open Authorized domains.
4. Add `candaidate.app`.
5. Enable Google, GitHub, and Microsoft sign-in providers.

GitHub and Microsoft providers require the matching OAuth application credentials
in Firebase Authentication provider settings. The redirect/callback URL shown
by Firebase must be copied into the provider application's OAuth configuration.

Popup flows avoid the custom-domain `__/auth/handler` redirect loop. The
`getRedirectResult` fallback remains handled in `AuthContext` for a previously
initiated redirect flow, but no redirect is started by the login UI.

Rebuild the backend after adding the key:

```bash
docker compose build --no-cache backend
docker compose up -d backend
```

## Latest xAI response: HTTP 403

The latest log shows that the request now reaches xAI and is rejected with
HTTP 403:

```text
Grok Fallback failed: status=403
```

This is no longer a Docker, Caddy, frontend URL, or route-path problem. A 403
from xAI indicates that the supplied xAI credential is not authorized for the
requested operation. Check the following in the xAI console:

1. The key was created in the correct xAI organization/workspace.
2. The key is active and has API access enabled.
3. The organization has billing or available API credits.
4. The organization is entitled to the configured `grok-4.7` model.
5. The key was not copied with whitespace, quotes, or a revoked value.

The backend now logs the provider's structured error body when the SDK exposes
one, while still avoiding API keys and authorization headers. Rebuild the
backend after the logging change:

```bash
docker compose build --no-cache backend
docker compose up -d backend
```
