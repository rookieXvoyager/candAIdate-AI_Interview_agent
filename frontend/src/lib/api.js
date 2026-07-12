// 🌐 Dynamic Backend URL Routing
// This automatically adapts depending on whether you are running locally or in production via Docker/Caddy.

const isProduction = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

// If in production, route to the same domain (Caddy will forward /api to the backend)
// If local, point to the FastAPI dev server on port 8000
export const API_BASE = isProduction 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

// For WebSockets, we dynamically swap http/https for ws/wss
export const WS_BASE = isProduction 
  ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host
  : "ws://127.0.0.1:8000";