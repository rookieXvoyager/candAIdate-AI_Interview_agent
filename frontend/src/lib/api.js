// 🌐 Dynamic Backend URL Routing
// Powered by Vite environment variables injected via Docker Compose

// Vite variables are injected during the frontend image build. Empty values
// intentionally fall back to the current Caddy origin for same-origin deploys.
export const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

// For WebSockets, we dynamically swap http/https for ws/wss based on the API_BASE
export const WS_BASE = API_BASE.replace(/^http/, "ws");