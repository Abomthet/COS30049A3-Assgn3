import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The app imports backend/config/settings.json (the one settings file, shared with the Python
// service), so the dev server must be allowed to read the repository root.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The browser sees one origin: Vite hands every /api request to Uvicorn (plan D-A3-11), on port 8000 unless
// EXPLORER_API (tools/measure.py) or VITE_PROXY_TARGET (a second back end, e.g. live lookup on 8080) names another.
const proxy = { '/api': process.env.EXPLORER_API ?? process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000' };

export default defineConfig({
  plugins: [react()],
  build: {
    // Plotly is one deliberate chunk of about 1.4 MB, fetched on demand (src/charts/plotlyLoader.ts),
    // so Vite's default 500 kB advice for chunks on the first screen does not fit it. The limit
    // is raised just enough to let that chunk pass; the first-screen script is checked by size
    // in the build report instead (budget in plan section 10).
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, fs: { allow: [repoRoot] }, proxy },
  preview: { port: 4173, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // The tests run the screens on the in-browser mock; no back end is needed.
    env: { VITE_API_MODE: 'mock' },
  },
});
