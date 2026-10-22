import type { Page } from '@playwright/test';
import { test, expect, account, registerViaApi, API_ORIGIN } from './fixtures';

/**
 * The Playground against the real API, real authentication and the real MongoDB quota store. The API runs with
 * EXECUTION_PROVIDER=fake and EXECUTION_DAILY_LIMIT_PER_USER=12 (server/e2e/startE2eApi.ts): no code is compiled or
 * run here; the opt-in server/tests/judge0.live.test.ts covers real execution.
 */

/** the harness's per-user daily limit (server/e2e/startE2eApi.ts) */
const LIMIT = 12;
const runApi = (page: Page, data: object) => page.request.post(`${API_ORIGIN}/api/run`, { data });
const usage = async (page: Page) => (await (await page.request.get(`${API_ORIGIN}/api/run/languages`)).json()).usedToday as number;

test.describe('Real backend — Playground', () => {
  test('a run goes through the real API, which counts it in the database', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.goto('/playground');
    await expect(page.getByTestId('playground-fake-provider')).toBeVisible();
    await page.getByLabel('STANDARD INPUT (STDIN)').fill('7 8 9');
    const response = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/run` && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Run Code' }).click();
    const res = await response;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'success', stdout: '7 8 9', provider: 'fake', usedToday: 1, dailyLimit: LIMIT });
    await expect(page.getByTestId('run-stdout')).toHaveText('7 8 9');
    await expect(page.getByTestId('playground-usage')).toHaveText(`1 / ${LIMIT} runs today`);

    // the count is stored on the server: it survives a reload
    await page.reload();
    await expect(page.getByTestId('playground-usage')).toHaveText(`1 / ${LIMIT} runs today`);
  });

  test("the daily quota is enforced per user; the next run is refused and nothing is shown as output", async ({ page, browser }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    for (let i = 1; i <= LIMIT; i++) {
      const res = await runApi(page, { language: 'python', source: 'print(1)', stdin: '' });
      expect(res.status(), `run ${i}`).toBe(200);
    }
    const refused = await runApi(page, { language: 'python', source: 'print(1)', stdin: '' });
    expect(refused.status()).toBe(429);
    expect((await refused.json()).code).toBe('daily_quota_exceeded');

    await page.goto('/playground');
    await expect(page.getByTestId('playground-usage')).toHaveText(`${LIMIT} / ${LIMIT} runs today`);
    await page.getByRole('button', { name: 'Run Code' }).click();
    await expect(page.getByTestId('run-failed')).toContainText(`You have used today's ${LIMIT} code runs`);
    await expect(page.getByTestId('run-stdout')).toHaveCount(0);

    // another user's allowance is untouched
    const other = await browser.newContext();
    await registerViaApi(other.request, account(testInfo, 'B'));
    expect((await other.request.post(`${API_ORIGIN}/api/run`, { data: { language: 'c', source: 'int main(){}', stdin: '' } })).status()).toBe(200);
    await other.close();
  });

  test('when the provider is unavailable: 503, no result, and the run is not counted', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    expect(await usage(page)).toBe(0);
    const res = await runApi(page, { language: 'java', source: '// FAKE:UNAVAILABLE', stdin: '' });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('provider_unavailable');
    expect(body).not.toHaveProperty('stdout');
    expect(await usage(page)).toBe(0);
  });

  test('compile errors, runtime errors and timeouts come back from the server as such', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    for (const [directive, status] of [['FAKE:COMPILE_ERROR', 'compile_error'], ['FAKE:RUNTIME_ERROR', 'runtime_error'], ['FAKE:TIMEOUT', 'timeout']]) {
      const res = await runApi(page, { language: 'cpp', source: `// ${directive}`, stdin: '' });
      expect(res.status()).toBe(200);
      expect((await res.json()).status).toBe(status);
    }
  });

  test('signed out: refused; invalid requests: refused before any quota is used', async ({ page }, testInfo) => {
    expect((await runApi(page, { language: 'cpp', source: 'int main(){}', stdin: '' })).status()).toBe(401);
    expect((await page.request.get(`${API_ORIGIN}/api/run/languages`)).status()).toBe(401);

    await registerViaApi(page.request, account(testInfo, 'A'));
    for (const data of [
      { language: 'ruby', source: 'puts 1', stdin: '' },
      { language: 'cpp', source: '', stdin: '' },
      { language: 'cpp', source: 'x'.repeat(50_001), stdin: '' },
      { language: 'cpp', source: 'int main(){}', stdin: 'x'.repeat(10_001) },
      { language: 'cpp', source: 'int main(){}', stdin: '', memoryLimit: 1_000_000 },
    ]) {
      expect((await runApi(page, data)).status()).toBe(400);
    }
    expect(await usage(page)).toBe(0);
  });
});
