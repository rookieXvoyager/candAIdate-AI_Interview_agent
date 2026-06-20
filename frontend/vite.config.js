import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on 5173 to match the FastAPI CORS allow-list.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
