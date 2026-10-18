import { test as base, expect } from '@playwright/test';
import { VisualizerApp } from './support/visualizerApp';

/** mulberry32 — a tiny seeded PRNG, so "Randomize" and "Size" are reproducible. */
const SEED_SCRIPT = `(() => {
  let a = 0x2f6e2b1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

/**
 * Every test gets, automatically:
 *  - a seeded Math.random,
 *  - a guard that ABORTS any request to the real backend (`/api/...`) and fails the test afterwards, so an
 *    E2E run can never depend on (or quietly use) credentials, a database or a running API server,
 *  - no internet: Google Fonts requests get an empty stylesheet, any other external request fails the test,
 *  - a collector that fails the test on any console error or uncaught page error.
 */
export const test = base.extend<{ app: VisualizerApp }>({
  page: async ({ page }, provide) => {
    await page.addInitScript(SEED_SCRIPT);

    const apiRequests: string[] = [];
    // match on the URL PATH: source files live under /src/api/..., which must keep loading
    await page.route(
      url => new URL(url).pathname.startsWith('/api/'),
      route => {
        apiRequests.push(`${route.request().method()} ${route.request().url()}`);
        return route.abort();
      }
    );

    // No dependency on the internet: the app's CSS imports Google Fonts, which made runs fail with
    // ERR_CONNECTION_RESET when the network hiccuped. Serve an empty stylesheet instead (the CSS already falls back
    // to system fonts), and treat any OTHER external request as a test failure.
    const externalRequests: string[] = [];
    await page.route(
      url => !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) && new URL(url).protocol.startsWith('http'),
      route => {
        const host = new URL(route.request().url()).hostname;
        if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
          return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        }
        externalRequests.push(route.request().url());
        return route.abort();
      }
    );

    const problems: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));

    await provide(page);

    expect(apiRequests, 'the E2E suite must run on the mock API only (no request to the real /api backend)').toEqual([]);
    expect(externalRequests, 'no requests to external hosts (tests must not depend on the internet)').toEqual([]);
    expect(problems, 'no console errors or uncaught page errors').toEqual([]);
  },

  app: async ({ page }, provide) => {
    const app = new VisualizerApp(page);
    await app.open();
    await provide(app);
  },
});

export { expect };
