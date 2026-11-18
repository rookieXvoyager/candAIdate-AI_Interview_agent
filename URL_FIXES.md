# API URL Hardcoding Issues and Suggested Fixes

> **Resolved/current-state notice:** Browser API requests now use
> `VITE_API_URL`, with Caddy routing `/api/*` to `backend:8000`. Internal
> Docker addresses remain valid only for Caddy/backend service communication.

## Summary

The frontend currently falls back to direct localhost URLs when it is not running on
the production hostname. In a Docker deployment behind Caddy, the browser should
send requests to the public frontend/API origin instead of trying to connect to
`127.0.0.1:8000`.

The frontend should use the Vite environment variable
`import.meta.env.VITE_API_URL` as its API origin and continue appending API paths
under `/api/v1/...`.

## Issue 1: Hardcoded frontend API base URL

**File:** `frontend/src/lib/api.js`  
**Line:** 10

### Current code

```js
export const API_BASE = isProduction 
  ? window.location.origin 
  : "http://127.0.0.1:8000";
```

### Problem

The browser attempts to connect directly to `127.0.0.1:8000`. Inside a deployed
browser session, `127.0.0.1` refers to the user's computer, not the Docker
backend container or the Caddy reverse proxy.

### Suggested fix

```js
export const API_BASE = import.meta.env.VITE_API_URL;
```

The value of `VITE_API_URL` should be the API origin exposed through Caddy. Do not
include an API endpoint path in the variable if callers append `/api/v1/...`.

## Issue 2: Hardcoded frontend WebSocket base URL

**File:** `frontend/src/lib/api.js`  
**Line:** 15

### Current code

```js
export const WS_BASE = isProduction 
  ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host
  : "ws://127.0.0.1:8000";
```

### Problem

The local fallback hardcodes port `8000`, which can cause WebSocket connection
refusals for the same reason as the HTTP API URL.

### Suggested fix

```js
export const WS_BASE = import.meta.env.VITE_API_URL.replace(/^http/, "ws");
```

This converts `http://...` to `ws://...` and `https://...` to `wss://...`.
WebSocket callers should append their appropriate `/api/v1/...` WebSocket path.

## Issue 3: Legacy frontend environment variables

**File:** `frontend/.env.example`  
**Lines:** 11–12

### Current code

```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_WS_BASE=ws://127.0.0.1:8000
```

### Problem

These variables preserve the direct localhost dependency and do not match the
requested `VITE_API_URL` configuration used by the frontend.

### Suggested fix

```env
VITE_API_URL=
```

Set the value to the origin routed through Caddy, for example:

```env
VITE_API_URL=https://your-domain.example
```

Do not include `/api/v1` in this value when the request code appends paths such
as `/api/v1/evaluate/...`.

## Issue 4: Backend automatic evaluation request uses localhost

**File:** `app/api/v1/stream.py`  
**Line:** 160

### Current code

```python
await client.post(f"http://127.0.0.1:8000/api/v1/evaluate/{session_id}")
```

### Problem

This is a backend-to-backend request. In a Docker container,
`127.0.0.1:8000` points back to the current container, not necessarily to the
service that should receive the request.

`import.meta.env.VITE_API_URL` cannot be used directly in Python because it is a
Vite frontend build-time variable.

### Suggested fix

Add a backend-configured API origin and use it in the request:

```python
await client.post(
    f"{settings.API_URL}/api/v1/evaluate/{session_id}"
)
```

Configure the backend service with an internal Docker-reachable value:

```env
API_URL=http://backend:8000
```

If the evaluation endpoint is available within the same application process,
an internal function/service call would be preferable to making an HTTP request.

## Issue 5: Documentation contains obsolete frontend URL configuration

**File:** `frontend/README.md`  
**Line:** 22

### Current reference

```text
The backend is expected at http://127.0.0.1:8000
(override via VITE_API_BASE / VITE_WS_BASE).
```

### Suggested fix

Update the documentation to describe the Vite variable:

```text
The frontend uses VITE_API_URL for the API origin and routes requests through
the Caddy reverse proxy. API requests use /api/v1/... paths.
```

## Issue 6: Root documentation contains obsolete environment variables

**File:** `README.md`  
**Lines:** 74–75

### Current reference

```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_WS_BASE=ws://127.0.0.1:8000
```

### Suggested fix

Replace the documented configuration with:

```env
VITE_API_URL=
```

For a Caddy-backed deployment, set this to the public API origin rather than a
localhost address.

## Issue 7: Root documentation contains a direct localhost health-check URL

**File:** `README.md`  
**Line:** 93

### Current reference

```text
http://127.0.0.1:8000/health
```

### Suggested fix

For a deployed environment, document the Caddy-routed health-check URL instead:

```text
/health
```

or:

```text
https://your-domain.example/health
```

This is documentation only and does not directly cause the frontend connection
error.

## Infrastructure references that should remain unchanged

The following references use port `8000`, but they are internal Docker routing
configuration rather than browser-side API URLs:

| File | Lines | Reference | Recommendation |
|---|---:|---|---|
| `Caddyfile` | 3, 7, 11, 15 | `reverse_proxy backend:8000` | Keep unchanged |
| `DEPLOYMENT_STATUS_REPORT.md` | 254 | Documentation describing `backend:8000` | Keep if describing Docker internals |

`backend:8000` is the Docker service address used by Caddy and should not be
replaced with `import.meta.env.VITE_API_URL`.

## Recommended final frontend configuration

```js
// frontend/src/lib/api.js
export const API_BASE = import.meta.env.VITE_API_URL;
export const WS_BASE = import.meta.env.VITE_API_URL.replace(/^http/, "ws");
```

```env
# frontend/.env
VITE_API_URL=https://your-domain.example
```

API requests should retain the `/api/v1/...` prefix:

```js
fetch(`${API_BASE}/api/v1/evaluate/${sessionId}`);
```
