import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the REAL application in a browser. They never need credentials or a database:
 * the app is BUILT with VITE_USE_MOCK_API=true (the app's built-in mock API client; the flag is compile-time) in
 * `--mode e2e` (the only build mode that permits the mock API, see src/config/deployment.ts) into a separate `dist-e2e` folder and served with `vite preview` (fast and reproducible — no on-demand compiling
 * under parallel workers). The
 * test fixtures abort — and fail the test on — any request to the real `/api/` backend.
 *
 * Run: `npm run e2e` (see e2e/README.md).
 */
const PORT = Number(process.env.E2E_PORT ?? 5199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  // No automatic retries: a flaky test must fail visibly instead of being hidden by a retry.
  retries: 0,
  // 2 browsers: measured on the dev machine, 4+ parallel headless browsers oversubscribe CPU/RAM and made
  // walks 10-20x slower (timeouts); 2 workers ran the full suite in ~2.3 min with no failures. Override: E2E_WORKERS.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1500, height: 1000 },
    // diagnostics only when something fails
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  /**
   * - chromium: the whole suite (the default `npm run e2e`).
   * - firefox / webkit: the same suite in the other engines (`npm run e2e:cross`).
   * - mobile-*: device emulation (viewport, touch, mobile UA) for tests tagged @mobile only.
   * Tests tagged @mobile need a touch device, so the desktop projects skip them.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 1000 } }, grepInvert: /@mobile/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1500, height: 1000 } }, grepInvert: /@mobile/ },
    // WebKit on Windows measured 2-2.5x slower than Chromium for the same tests in isolation (e.g. 6.0s vs 2.3-3.4s)
    // and exceeded 30s twice under full cross-browser load — always timeouts, never assertion failures. Scoped to
    // this project only; Chromium and Firefox keep the 30s default.
    { name: 'webkit', timeout: 60_000, use: { ...devices['Desktop Safari'], viewport: { width: 1500, height: 1000 } }, grepInvert: /@mobile/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${BASE_URL}/visualizer`,
    // Never reuse a server we did not start: it might not be in mock-API mode.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_USE_MOCK_API: 'true' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
