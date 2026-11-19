// Browser tests (S-11): the journeys J1 to J6 of plan section 4, run in a real browser against both real servers.
//
//   npm run e2e         all 9 projects: Chromium, Firefox and WebKit, each at 390, 820 and 1280 pixels wide
//   npm run e2e:quick   Chromium only, at the three widths (what CI runs)
//   npx playwright test e2e/j4-what-if.spec.ts --project=webkit-390     one file in one project
//
// One command starts everything: Playwright starts its own back end (Uvicorn, port 8010) and front end (Vite,
// port 5183), waits until both answer, and stops them when the run ends. They are never the servers a person
// runs by hand (8000 and 5173), so a stale server of another checkout is never tested. Settings, all optional:
//   E2E_PYTHON      the Python that has backend/requirements.txt installed (default "python"; on this Mac
//                   ~/miniconda3/envs/cos30049-a3/bin/python)
//   E2E_API_PORT    back end port (default 8010)         E2E_WEB_PORT   front end port (default 5183)
//   E2E_REUSE=1     use servers already listening on those two ports instead of starting new ones
//
// The back end loads its models in the background and answers 503 on /api/health until they are ready; Playwright
// counts only 2xx to 4xx (not 5xx) as "ready", so waiting on that URL waits for the models.
// Every test also checks, by the fixture in e2e/fixtures.ts, that the page never scrolls sideways and that the
// console stays empty. Reports: the terminal list, plus an HTML report in playwright-report/ (git-ignored).
//
// Emulation: Chromium and WebKit at 390 pixels are a phone (isMobile and hasTouch). Firefox has no isMobile, so
// there only the viewport is set (390 x 844); its layout is the same, but it has no touch emulation.

import { defineConfig, devices, type Project } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '8010';
const webPort = process.env.E2E_WEB_PORT ?? '5183';
const python = process.env.E2E_PYTHON ?? 'python';
const reuseExistingServer = process.env.E2E_REUSE === '1';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1280, height: 800 },
] as const;
const BROWSERS = [
  { name: 'chromium', device: devices['Desktop Chrome'], mobile: { isMobile: true, hasTouch: true } },
  { name: 'firefox', device: devices['Desktop Firefox'], mobile: {} },
  { name: 'webkit', device: devices['Desktop Safari'], mobile: { isMobile: true, hasTouch: true } },
] as const;

const projects: Project[] = BROWSERS.flatMap(({ name, device, mobile }) =>
  WIDTHS.map(({ width, height }) => ({
    name: `${name}-${width}`,
    use: { ...device, viewport: { width, height }, ...(width === 390 ? mobile : {}), colorScheme: 'light' as const },
  })),
);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // The first chart on a page fetches Plotly's 1.4 MB chunk, so a wait for a chart gets longer than the default 5 s.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects,
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: '../backend',
      url: `${apiUrl}/api/health`,
      timeout: 180_000,
      reuseExistingServer,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      env: { VITE_PROXY_TARGET: apiUrl },
      url: webUrl,
      timeout: 120_000,
      reuseExistingServer,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
