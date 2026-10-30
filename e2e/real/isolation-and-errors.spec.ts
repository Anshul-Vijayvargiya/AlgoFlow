import { test, expect, account, registerViaApi, signInViaUi, tracksOf, API_ORIGIN } from './fixtures';
import { isImplementedAlgorithm } from '../../src/data/algorithmCatalog';
import { LEARNING_TRACKS } from '../../src/pages/learning/learningPaths';

/** roadmap milestones whose algorithm can be visualized: shown as not started on a new account (the rest: coming soon) */
const VISUALIZABLE_MILESTONES = LEARNING_TRACKS.flatMap(t => t.milestones).filter(m => isImplementedAlgorithm(m.algorithmId)).length;

/**
 * Ownership and error handling against the real API and database. One test injects a network failure (clearly
 * marked): the success that follows it is still the real server's.
 */

test.describe('Real backend — ownership', () => {
  test("user B cannot read, change or delete user A's note, and does not see A's progress", async ({ browser }, testInfo) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = account(testInfo, 'A');
    await registerViaApi(ctxA.request, a);
    await registerViaApi(ctxB.request, account(testInfo, 'B'));

    // A writes a note through the UI and steps through an algorithm
    const pageA = await ctxA.newPage();
    await pageA.goto('/notes');
    await pageA.locator('#notes-create-btn').click();
    await pageA.locator('#note-modal-title').fill('Private note of A');
    await pageA.locator('#note-modal-content').fill('Only A may read this.');
    const created = pageA.waitForResponse(r => r.url() === `${API_ORIGIN}/api/notes` && r.request().method() === 'POST');
    await pageA.getByRole('button', { name: /^Save/ }).click();
    const note = await (await created).json();
    expect(note.id ?? note._id).toBeTruthy();
    const noteId = String(note.id ?? note._id);
    await pageA.goto('/visualizer');
    await pageA.getByRole('button', { name: /Next/ }).click();
    await expect.poll(async () => (await tracksOf(pageA)).length).toBe(1);

    // B, through the API with B's own session
    const list = await (await ctxB.request.get(`${API_ORIGIN}/api/notes`)).json();
    expect(list.notes).toEqual([]);
    expect((await ctxB.request.get(`${API_ORIGIN}/api/notes/${noteId}`)).status()).toBe(404);
    expect((await ctxB.request.put(`${API_ORIGIN}/api/notes/${noteId}`, { data: { title: 'hijacked', content: 'x' } })).status()).toBe(404);
    expect((await ctxB.request.delete(`${API_ORIGIN}/api/notes/${noteId}`)).status()).toBe(404);
    expect((await (await ctxB.request.get(`${API_ORIGIN}/api/progress/algorithms`)).json()).tracks).toEqual([]);
    expect((await (await ctxB.request.get(`${API_ORIGIN}/api/progress/summary`)).json()).algorithmTotals.practised).toBe(0);

    // and through B's UI
    const pageB = await ctxB.newPage();
    await pageB.goto('/notes');
    await expect(pageB.locator('main')).not.toContainText('Private note of A');

    // A's note is untouched
    const own = await (await ctxA.request.get(`${API_ORIGIN}/api/notes/${noteId}`)).json();
    expect(own).toMatchObject({ title: 'Private note of A', content: 'Only A may read this.' });
    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('Real backend — errors', () => {
  test('wrong password and duplicate sign-up show the server error; nothing is signed in', async ({ page }, testInfo) => {
    const user = account(testInfo, 'A');
    const setup = await page.context().browser()!.newContext();
    await registerViaApi(setup.request, user);
    await setup.close();

    await signInViaUi(page, { ...user, password: 'Wrong-Passw0rd!' });
    await expect(page.locator('form').locator('..').getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
    expect((await page.request.get(`${API_ORIGIN}/api/auth/me`)).status()).toBe(401);

    await page.goto('/auth?mode=register');
    await page.getByLabel('Full Name').fill(user.name);
    await page.getByLabel('Email Address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    const res = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/auth/register`);
    await page.locator('#auth-submit-btn').click();
    expect((await res).status()).toBe(409);
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('the server rejects invalid and forged progress requests', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const post = (path: string, data: object) => page.request.post(`${API_ORIGIN}/api/progress${path}`, { data });
    expect((await post('/visualizer-activity', { algorithmId: 'no-such-algo', stepIndex: 1 })).status()).toBe(400);
    expect((await post('/visualizer-activity', { algorithmId: 'bfs', stepIndex: 1 })).status()).toBe(400);
    expect((await post('/visualizer-activity', { algorithmId: 'bubble-sort', stepIndex: 0 })).status()).toBe(400);
    expect((await post('/activity', { algorithmId: 'bubble-sort', steps: 5, activityType: 'algorithm_completed' })).status()).toBe(400);
    expect((await page.request.put(`${API_ORIGIN}/api/progress/algorithms/bubble-sort`, { data: { status: 'completed' } })).status()).toBe(400);
    expect((await page.request.put(`${API_ORIGIN}/api/progress/algorithms/bubble-sort`, { data: { status: 'not_started' } })).status()).toBe(404);
    expect(await tracksOf(page)).toEqual([]);
  });

  test('a browser cross-origin request is refused by the origin check', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const res = await page.request.post(`${API_ORIGIN}/api/progress/visualizer-activity`, {
      data: { algorithmId: 'bubble-sort', stepIndex: 1 },
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status()).toBe(403);
    expect(await tracksOf(page)).toEqual([]);
  });

  test.describe('fault injection', () => {
  // the browser reports the aborted request as a console error, worded per engine (Chromium; Firefox, for the
  // aborted endpoint only)
  // (one pattern: Playwright reads a two-element array in test.use as [value, options])
  test.use({
    expectedConsoleErrors: [/net::ERR_CONNECTION_REFUSED|Cross-Origin Request Blocked: .*\/api\/progress\/algorithms\. \(Reason: CORS request did not succeed\)/],
  });

  test('[fault injection] a failed progress request shows the error and Retry, which then loads from the real server', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    // Notes loads no progress, so the roadmap's request is the first one
    await page.goto('/notes');
    // the ONLY non-real response in this suite: the first tracks request is aborted (a network failure)
    let failures = 1;
    await page.route(`${API_ORIGIN}/api/progress/algorithms`, route => (failures-- > 0 ? route.abort('connectionrefused') : route.continue()));
    await page.getByRole('link', { name: /Roadmap/ }).first().click();
    const alert = page.getByTestId('roadmap-error');
    await expect(alert).toBeVisible();
    await expect(page.locator('[data-status="not-started"], [data-status="explored"]')).toHaveCount(0);
    const real = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/progress/algorithms` && r.status() === 200);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await real;
    await expect(alert).toHaveCount(0);
    await expect(page.locator('[data-status="not-started"]')).toHaveCount(VISUALIZABLE_MILESTONES);
  });
  });

  test('when the session is revoked elsewhere, the next request signs the tab out', async ({ page, browser }, testInfo) => {
    const user = account(testInfo, 'A');
    await registerViaApi(page.request, user);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
    // sign out from another browser with the same account: the server revokes every session of the user
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signInViaUi(otherPage, user);
    await expect(otherPage).toHaveURL(/\/dashboard$/);
    await otherPage.locator('#header-profile-btn').click();
    await otherPage.getByRole('button', { name: 'Sign Out' }).click();
    await expect(otherPage).toHaveURL(/\/auth/);
    await other.close();

    await page.getByRole('link', { name: /Progress/ }).first().click();
    await expect(page).toHaveURL(/\/auth/);
  });
});
