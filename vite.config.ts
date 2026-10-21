import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
  },
});
