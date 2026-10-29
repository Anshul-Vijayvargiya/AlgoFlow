import { test, expect, account, registerViaApi, API_ORIGIN } from './fixtures';

/**
 * The Playground running Python for real on this machine: the real API with EXECUTION_PROVIDER=local (development
 * only), real sign-in and the real quota store. Opt-in — the API must be started with the local provider:
 *   E2E_EXECUTION_PROVIDER=local npx playwright test --config playwright.real.config.ts --project=chromium-real e2e/real/local-python.spec.ts
 * Skipped otherwise (the default harness uses the fake provider, which runs nothing).
 */
test.skip(process.env.E2E_EXECUTION_PROVIDER !== 'local', 'needs E2E_EXECUTION_PROVIDER=local');

const PROGRAM = 'x = 2\ny = 3\nresult = x + y\nprint(result)\n';

test.describe('Real backend — local Python execution', () => {
  test('Run Code runs the program with Python on this machine', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.goto('/playground');
    await page.getByRole('combobox', { name: 'Language to run' }).selectOption('python');
    await expect(page.getByRole('combobox', { name: 'Language to run' }).locator('option:checked')).toHaveText(/Python 3\.\d+\.\d+ \(local\)/);
    await expect(page.getByTestId('playground-fake-provider')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Source code' }).fill('n = int(input())\nprint(n * n)\n');
    await page.getByLabel('STANDARD INPUT (STDIN)').fill('12');
    const response = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/run` && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Run Code' }).click();
    expect(await (await response).json()).toMatchObject({ status: 'success', stdout: '144\n', provider: 'local', usedToday: 1 });
    await expect(page.getByTestId('run-stdout')).toHaveText('144');
  });

  test('Visualize traces a real run: lines 1-4, x, y and result, output 5, the end, runtime provenance', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.goto('/playground');
    await page.getByRole('combobox', { name: 'Language to run' }).selectOption('python');
    await page.getByRole('textbox', { name: 'Source code' }).fill(PROGRAM);
    const response = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/run/trace` && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Visualize' }).click();
    const body = await (await response).json();
    expect(body).toMatchObject({ status: 'traced', provider: 'local', trace: { provenance: 'runtime', status: 'completed', stdout: '5\n' } });

    const view = page.getByTestId('trace-view');
    await expect(view).toBeVisible();
    await expect(page.getByTestId('trace-recorded')).toHaveCount(0); // a real run, not a recorded example
    await expect(page.getByTestId('trace-status')).toHaveText('Finished with exit code 0 · 4 steps');
    const variable = (name: string) => page.locator(`[data-frame="<module>"] [data-variable="${name}"] dd`);
    const next = page.getByRole('button', { name: 'Next step' });

    await expect(page.getByTestId('trace-position')).toContainText('Step 1 of 4 · line 1');
    await expect(variable('x')).toHaveCount(0);
    await next.click();
    await expect(page.getByTestId('trace-position')).toContainText('Step 2 of 4 · line 2');
    await expect(variable('x')).toHaveAttribute('data-value-text', '2');
    await next.click();
    await expect(page.getByTestId('trace-position')).toContainText('Step 3 of 4 · line 3');
    await expect(variable('y')).toHaveAttribute('data-value-text', '3');
    await next.click();
    await expect(page.getByTestId('trace-position')).toContainText('Step 4 of 4 · line 4');
    await expect(variable('result')).toHaveAttribute('data-value-text', '5');
    await expect(page.getByTestId('trace-stdout')).toHaveText('(no output yet)');
    await next.click();
    await expect(page.getByTestId('trace-position')).toHaveText('The program has ended');
    await expect(page.getByTestId('trace-stdout')).toHaveText('5\n');
    await expect(next).toBeDisabled();
  });

  test('C++ is not offered, and a request for it is refused without being charged', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const refused = await page.request.post(`${API_ORIGIN}/api/run`, { data: { language: 'cpp', source: 'int main(){}', stdin: '' } });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).code).toBe('language_unavailable');
    const languages = await (await page.request.get(`${API_ORIGIN}/api/run/languages`)).json();
    expect(languages).toMatchObject({ provider: 'local', usedToday: 0, tracing: { mode: 'runtime' } });
    expect(languages.languages.map((l: { id: string }) => l.id)).toEqual(['python']);
  });
});
