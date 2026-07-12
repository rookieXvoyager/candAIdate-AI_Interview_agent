import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Increase the chunk size limit to reduce warnings
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Automatically split large vendor libraries into a separate chunk
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});