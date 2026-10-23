import type { Page } from '@playwright/test';
import { test, expect, account, registerViaApi, signInViaUi, signOutViaUi, waitForDashboard, API_ORIGIN } from './fixtures';

/**
 * Practice judging against the real API, real MongoDB and the real judge, with EXECUTION_PROVIDER=fake (it echoes
 * stdin and never runs code). The harness loads deterministic problems (server/e2e/practiceFixtures.ts): the five
 * seeded problems, e2e-echo (an echo is accepted), e2e-hidden (an echo fails a hidden test) and e2e-legacy (not
 * judged). Real compilation is covered by the opt-in Judge0 test and by the local reference-solution test.
 */

async function openProblem(page: Page, problemId: string) {
  await page.goto('/practice');
  await page.locator(`[data-problem="${problemId}"]`).getByRole('button', { name: 'Practice Now' }).click();
  await expect(page.locator('#practice-submit-btn')).toBeVisible();
}
const editor = (page: Page) => page.getByPlaceholder('Write your solution here...');
const submitAndWait = async (page: Page, problemId: string) => {
  const response = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/problems/${problemId}/submit`);
  await page.locator('#practice-submit-btn').click();
  return response;
};
const usage = async (page: Page) => (await (await page.request.get(`${API_ORIGIN}/api/run/languages`)).json()).usedToday as number;

test.describe('Real backend — Practice judging', () => {
  test('the problem list and statements come from the server, with no hidden test anywhere in the responses', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const list = await (await page.request.get(`${API_ORIGIN}/api/problems?limit=50`)).json();
    expect(list.problems.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['p1', 'p2', 'p3', 'p4', 'p5', 'e2e-echo', 'e2e-hidden', 'e2e-legacy']));
    const detail = await (await page.request.get(`${API_ORIGIN}/api/problems/e2e-hidden`)).text();
    expect(JSON.stringify(list) + detail).not.toMatch(/E2E_SECRET|E2E_HIDDEN_ECHO/);
    expect(JSON.parse(detail).testCases).toHaveLength(2);

    await openProblem(page, 'p1');
    await expect(page.getByTestId('problem-statement')).toContainText('Input: the first line holds n and target');
    await expect(page.getByTestId('sample-test').first()).toContainText('4 9');
    await expect(editor(page)).toHaveValue(/int main\(\)/);
  });

  test('Accepted: recorded, shown in history, the problem becomes solved, and the server counts it', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await openProblem(page, 'e2e-echo');
    const res = await submitAndWait(page, 'e2e-echo');
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ status: 'ACCEPTED', judged: true, passed: true, testsPassed: 2, testsTotal: 2 });
    await expect(page.getByTestId('submission-verdict')).toHaveText('Accepted');
    await expect(page.getByTestId('history-status').first()).toHaveText('Accepted · 2/2');

    await page.reload();
    await expect(page.locator('[data-problem="e2e-echo"]')).toContainText('Solved');
    const summary = await (await page.request.get(`${API_ORIGIN}/api/progress/summary`)).json();
    expect(summary.solvedCount).toBe(1);
    expect(await usage(page)).toBe(2);
  });

  test('a failure on a hidden test shows only its number; nothing about the test reaches the browser', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await openProblem(page, 'e2e-hidden');
    const res = await submitAndWait(page, 'e2e-hidden');
    const body = await res.json();
    expect(body).toMatchObject({ status: 'WRONG_ANSWER', passed: false, testsPassed: 2, failedTest: { number: 3, hidden: true } });
    expect(JSON.stringify(body)).not.toMatch(/E2E_SECRET/);
    await expect(page.getByTestId('submission-verdict')).toHaveText('Wrong Answer');
    await expect(page.getByTestId('failed-hidden-test')).toHaveText("Hidden test 3 failed. Hidden tests' inputs are not shown.");
    await expect(page.locator('main')).not.toContainText('E2E_SECRET');
    const history = await (await page.request.get(`${API_ORIGIN}/api/problems/e2e-hidden/submissions`)).text();
    expect(history).not.toMatch(/E2E_SECRET/);
  });

  test('a wrong answer on a visible test shows its input, expected and actual output (the seeded problems are judged)', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await openProblem(page, 'p2');
    // the untouched starter, run by the fake provider, echoes the input: wrong on test 1
    const body = await (await submitAndWait(page, 'p2')).json();
    expect(body).toMatchObject({ status: 'WRONG_ANSWER', failedTest: { number: 1, hidden: false, input: '()[]{}\n', expected: 'true' } });
    await expect(page.getByTestId('failed-test')).toContainText('()[]{}');
    await expect(page.getByTestId('failed-test')).toContainText('true');
    // only the run that was used is counted (the other 6 reserved runs were given back)
    expect(await usage(page)).toBe(1);
  });

  test('compile errors and judging errors are recorded as such; a judging error is never a pass and costs nothing', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await openProblem(page, 'p4');
    await editor(page).fill('// FAKE:COMPILE_ERROR');
    expect((await (await submitAndWait(page, 'p4')).json()).status).toBe('COMPILATION_ERROR');
    await expect(page.getByTestId('submission-compile-output')).toContainText('FAKE:COMPILE_ERROR');
    expect(await usage(page)).toBe(1);

    await page.getByRole('button', { name: 'Edit & resubmit' }).click();
    await editor(page).fill('// FAKE:UNAVAILABLE');
    const judging = await (await submitAndWait(page, 'p4')).json();
    expect(judging).toMatchObject({ status: 'JUDGING_ERROR', passed: false, errorCode: 'provider_unavailable' });
    await expect(page.getByTestId('submission-verdict')).toHaveText('Judging Error');
    expect(await usage(page)).toBe(1);
    const history = await (await page.request.get(`${API_ORIGIN}/api/problems/p4/submissions`)).json();
    expect(history.submissions.map((s: { status: string; passed: boolean }) => [s.status, s.passed])).toEqual([['JUDGING_ERROR', false], ['COMPILATION_ERROR', false]]);
    // today's activity: the compile error is practice (1 submission, 5 estimated minutes); the judging error earns nothing
    const today = (await (await page.request.get(`${API_ORIGIN}/api/progress/summary`)).json()).weeklyActivity.at(-1);
    expect(today).toMatchObject({ submissions: 1, minutes: 5 });
  });

  test('a problem that is not set up for judging records the attempt without a verdict', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await openProblem(page, 'e2e-legacy');
    await expect(page.getByTestId('not-auto-judged')).toBeVisible();
    expect(await (await submitAndWait(page, 'e2e-legacy')).json()).toMatchObject({ status: 'SUBMITTED', judged: false, passed: false });
    await expect(page.getByTestId('submission-verdict')).toHaveText('Recorded (not judged)');
    expect(await usage(page)).toBe(0);
  });

  test('not enough runs left: the submission is refused before anything runs, and the page says why', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    // use 7 of the 12 runs in the Playground; Two Sum needs 6
    for (let i = 0; i < 7; i++) {
      expect((await page.request.post(`${API_ORIGIN}/api/run`, { data: { language: 'c', source: 'x', stdin: '' } })).status()).toBe(200);
    }
    await openProblem(page, 'p1');
    const res = await submitAndWait(page, 'p1');
    expect(res.status()).toBe(429);
    await expect(page.getByTestId('submission-error')).toContainText('Not submitted: Judging this problem needs 6 code runs');
    expect(await usage(page)).toBe(7);
    expect((await (await page.request.get(`${API_ORIGIN}/api/problems/p1/submissions`)).json()).submissions).toEqual([]);
  });

  test("drafts survive a reload, stay with their account, and are never sent to the server", async ({ page, browser }, testInfo) => {
    const a = account(testInfo, 'A');
    const b = account(testInfo, 'B');
    await registerViaApi(page.request, a);
    const setup = await browser.newContext();
    await registerViaApi(setup.request, b);
    await setup.close();
    // a draft is never uploaded: only Submit sends code
    const uploads: string[] = [];
    page.on('request', r => { if (r.method() !== 'GET' && r.postData()?.includes('A_PRIVATE_DRAFT')) uploads.push(r.url()); });

    await openProblem(page, 'p3');
    await editor(page).fill('// A_PRIVATE_DRAFT');
    await page.reload();
    await page.locator('[data-problem="p3"]').getByRole('button', { name: 'Practice Now' }).click();
    await expect(editor(page)).toHaveValue('// A_PRIVATE_DRAFT');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await signOutViaUi(page);
    await signInViaUi(page, b);
    await waitForDashboard(page);
    await openProblem(page, 'p3');
    await expect(editor(page)).toHaveValue(/mergeTwoLists/);
    await expect(editor(page)).not.toHaveValue(/A_PRIVATE_DRAFT/);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await signOutViaUi(page);
    await signInViaUi(page, a);
    await waitForDashboard(page);
    await openProblem(page, 'p3');
    await expect(editor(page)).toHaveValue('// A_PRIVATE_DRAFT');
    expect(uploads).toEqual([]);
  });

  test("authentication and ownership: signed out is refused; another user never sees someone's submissions", async ({ page, browser }, testInfo) => {
    expect((await page.request.post(`${API_ORIGIN}/api/problems/e2e-echo/submit`, { data: { language: 'python', code: 'x' } })).status()).toBe(401);
    expect((await page.request.get(`${API_ORIGIN}/api/problems/e2e-echo/submissions`)).status()).toBe(401);

    await registerViaApi(page.request, account(testInfo, 'A'));
    expect((await page.request.post(`${API_ORIGIN}/api/problems/e2e-echo/submit`, { data: { language: 'python', code: 'x' } })).status()).toBe(201);
    // a client cannot claim a verdict
    expect((await page.request.post(`${API_ORIGIN}/api/problems/e2e-echo/submit`, { data: { language: 'python', code: 'x', passed: true, status: 'ACCEPTED' } })).status()).toBe(400);

    const other = await browser.newContext();
    await registerViaApi(other.request, account(testInfo, 'B'));
    expect((await (await other.request.get(`${API_ORIGIN}/api/problems/e2e-echo/submissions`)).json()).submissions).toEqual([]);
    const otherList = await (await other.request.get(`${API_ORIGIN}/api/problems?limit=50`)).json();
    expect(otherList.problems.find((p: { id: string }) => p.id === 'e2e-echo').solved).toBe(false);
    await other.close();
  });
});
