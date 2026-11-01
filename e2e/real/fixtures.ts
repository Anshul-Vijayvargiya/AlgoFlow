import { test as base, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { E2E_EMAIL_DOMAIN } from '../../server/e2e/testDatabase';

/**
 * Fixtures for the real-backend suite (playwright.real.config.ts). Unlike e2e/fixtures.ts, requests to /api are NOT
 * intercepted: they reach the real API and database. Every test still gets:
 *  - a check (once per worker) that the served front end is a real build (no mock API) and the API is up,
 *  - no internet: only the front end and the API on 127.0.0.1 may be reached (Google Fonts get an empty stylesheet),
 *  - a failure on any uncaught page error, and on any console error other than the browser's own report of an HTTP
 *    error status (the app makes requests the server rightly refuses, e.g. /auth/me while signed out).
 */
export const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 5299}`;

export interface TestAccount {
  name: string;
  email: string;
  password: string;
}

/** a deterministic account for this test (unique per test, project and repetition); the e-mail marks it as the suite's */
export function account(testInfo: TestInfo, label: string): TestAccount {
  const slug = `${testInfo.titlePath.slice(1).join('-')}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-+$/, '');
  return {
    name: `E2E ${label}`,
    // the project too: the same test runs once per browser against the same database
    email: `${slug}-${label.toLowerCase()}-${testInfo.project.name}-r${testInfo.repeatEachIndex}@${E2E_EMAIL_DOMAIN}`,
    password: `E2e-${label}-Passw0rd!`,
  };
}

/** creates the account through the real API; the browser context (and so the page) is then signed in as it */
export async function registerViaApi(request: APIRequestContext, user: TestAccount) {
  const res = await request.post(`${API_ORIGIN}/api/auth/register`, { data: user });
  expect(res.status(), await res.text()).toBe(201);
}

export async function signInViaUi(page: Page, user: TestAccount) {
  await page.goto('/auth');
  await page.getByLabel('Email Address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.locator('#auth-submit-btn').click();
}

/**
 * Waits until the Dashboard's progress has loaded. Use it before leaving the Dashboard right after signing in:
 * navigating away cuts its requests off, and WebKit reports those as "access control" page errors, which the page
 * fixture (rightly) treats as failures.
 */
export async function waitForDashboard(page: Page) {
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
}

export async function signOutViaUi(page: Page) {
  await page.locator('#header-profile-btn').click();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/auth/);
}

/** the front end's origin, which the API requires on POST /api/auth/refresh (server/e2e/startE2eApi.ts sets CLIENT_URL) */
const FRONT_END_ORIGIN = process.env.E2E_CLIENT_URL ?? 'http://127.0.0.1:5198';

type FetchOptions = NonNullable<Parameters<APIRequestContext['fetch']>[1]>;

/**
 * Direct API calls as a fresh tab of this browser would make them: first an access token from POST /api/auth/refresh
 * with the context's refresh cookie (rotating it, as the app does), then the request with that token as a Bearer
 * header. A context that has no session (never signed in, signed out, cookies cleared) gets no token, so the request
 * goes out unauthenticated and the API answers 401, which is what those tests check.
 */
export function api(target: { request: APIRequestContext }) {
  const request = target.request;
  async function accessToken(): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await request.post(`${API_ORIGIN}/api/auth/refresh`, { headers: { Origin: FRONT_END_ORIGIN } });
      if (res.status() === 200) return ((await res.json()) as { accessToken: string }).accessToken;
      // another request of this browser rotated the cookie a moment ago: its new cookie is in the jar now
      if (res.status() === 409) {
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }
      return null;
    }
    return null;
  }
  const send = async (method: string, url: string, options: FetchOptions = {}) => {
    const token = await accessToken();
    const headers = { ...(options.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return request.fetch(url, { ...options, method, headers });
  };
  return {
    get: (url: string, options?: FetchOptions) => send('GET', url, options),
    post: (url: string, options?: FetchOptions) => send('POST', url, options),
    put: (url: string, options?: FetchOptions) => send('PUT', url, options),
    patch: (url: string, options?: FetchOptions) => send('PATCH', url, options),
    delete: (url: string, options?: FetchOptions) => send('DELETE', url, options),
  };
}

/** the signed-in user's progress records, read from the real API with the browser's own session */
export async function tracksOf(page: Page) {
  const res = await api(page).get(`${API_ORIGIN}/api/progress/algorithms`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { tracks: { algorithmId: string; status: string }[] }).tracks;
}

const ALLOWED_CONSOLE_ERROR = /^Failed to load resource: the server responded with a status of 4\d\d/;

export const test = base.extend<{ page: Page; expectedConsoleErrors: RegExp[] }, { realStack: void }>({
  /** console errors a test causes on purpose (e.g. the browser's report of a request it aborts) */
  expectedConsoleErrors: [[], { option: true }],

  realStack: [
    async ({ playwright }, provide, workerInfo) => {
      const ctx = await playwright.request.newContext();
      const info = await (await ctx.get(`${workerInfo.project.use.baseURL}/build-info.json`)).json();
      expect(info, 'the served front end must be a real build, not the mock API').toMatchObject({ app: 'algoflow', mockApi: false });
      expect((await ctx.get(`${API_ORIGIN}/healthz`)).status(), 'the real API must be up').toBe(200);
      await ctx.dispose();
      await provide();
    },
    { scope: 'worker', auto: true },
  ],

  page: async ({ page, expectedConsoleErrors }, provide) => {
    const allowedHosts = new Set([new URL(test.info().project.use.baseURL!).host, new URL(API_ORIGIN).host]);
    const external: string[] = [];
    await page.route(
      url => url.protocol.startsWith('http') && !allowedHosts.has(url.host),
      route => {
        const host = new URL(route.request().url()).hostname;
        if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        external.push(route.request().url());
        return route.abort();
      }
    );

    const problems: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_ERROR.test(text) && !expectedConsoleErrors.some(r => r.test(text))) {
        problems.push(`console.error: ${text}`);
      }
    });
    page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));

    await provide(page);

    expect(external, 'no requests to external hosts').toEqual([]);
    expect(problems, 'no console errors or uncaught page errors').toEqual([]);
  },
});

export { expect };
