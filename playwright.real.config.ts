import { defineConfig, devices } from '@playwright/test';

/**
 * Real-backend end-to-end tests: the real front end (a production build, NOT the mock API) against the real Express
 * API and a real, disposable MongoDB. Nothing is mocked; see e2e/real/README.md.
 *
 *  - API: server/e2e/startE2eApi.ts on 127.0.0.1:5299. It starts its own mongod on 127.0.0.1:27999 with an empty
 *    temporary data folder (or uses E2E_MONGODB_URI, which must be a local *_e2e / *_test database), and never reads
 *    the server's .env database or secrets.
 *  - Front end: `vite build` (deployable mode, mock API off) into dist-real-e2e, served by `vite preview` on
 *    127.0.0.1:5198, calling the API at http://127.0.0.1:5299/api (same-site, so the auth cookie works as deployed).
 *
 * Run: `npm run e2e:real`. The mock-API suite (`npm run e2e`, playwright.config.ts) is unaffected.
 */
const WEB_PORT = Number(process.env.E2E_REAL_WEB_PORT ?? 5198);
const API_PORT = Number(process.env.E2E_API_PORT ?? 5299);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e/real',
  outputDir: './test-results/real',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/real' }]],
  globalTeardown: './e2e/real/globalTeardown.ts',
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1500, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // `npm run e2e:real` (and CI) runs chromium-real; `npm run e2e:real:cross` runs Firefox and WebKit too
  projects: [
    { name: 'chromium-real', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 1000 } } },
    // Firefox against the real API ran up to 35 s per test here (a sign-up/sign-in test failed 3 of 3 at 30 s)
    { name: 'firefox-real', timeout: 60_000, use: { ...devices['Desktop Firefox'], viewport: { width: 1500, height: 1000 } } },
    // as in playwright.config.ts: WebKit on Windows runs 2-2.5x slower than Chromium
    { name: 'webkit-real', timeout: 60_000, use: { ...devices['Desktop Safari'], viewport: { width: 1500, height: 1000 } } },
  ],
  webServer: [
    {
      command: 'npx tsx server/e2e/startE2eApi.ts',
      url: `${API_ORIGIN}/healthz`,
      // never reuse a server this run did not start: it might be a development server on a real database
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_API_PORT: String(API_PORT), E2E_CLIENT_URL: BASE_URL },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx vite build --outDir dist-real-e2e && npx vite preview --outDir dist-real-e2e --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `${BASE_URL}/auth`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_BASE_URL: `${API_ORIGIN}/api`, VITE_USE_MOCK_API: 'false' },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
