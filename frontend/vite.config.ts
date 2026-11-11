import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The app imports backend/config/settings.json (the one settings file, shared with the Python
// service), so the dev server must be allowed to read the repository root.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The browser sees one origin: Vite hands every /api request to Uvicorn (plan D-A3-11).
const proxy = { '/api': 'http://127.0.0.1:8000' };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, fs: { allow: [repoRoot] }, proxy },
  preview: { port: 4173, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // The tests run the screens on the in-browser mock; no back end is needed.
    env: { VITE_API_MODE: 'mock' },
  },
});
