import type { Page } from '@playwright/test';
import { test, expect, account, registerViaApi, signInViaUi, signOutViaUi, waitForDashboard, API_ORIGIN, api } from './fixtures';

/** The Revision List against the real API and database: the whole flow, persistence, isolation and authorization. */
const URL_OF = (id: string) => `${API_ORIGIN}/api/revisions/${id}`;
const bookmark = (page: Page) => page.getByTestId('revision-bookmark');
const form = (page: Page) => page.getByTestId('revision-form');
const card = (page: Page, id: string) => page.locator(`[data-testid="revision-card"][data-algorithm="${id}"]`);
const badge = (page: Page) => page.getByRole('navigation').getByTestId('revision-badge');
const listed = async (page: Page) => ((await (await api(page).get(`${API_ORIGIN}/api/revisions`)).json()) as { revisions: { algorithmId: string; status: string; reason?: string }[] }).revisions;

test.describe('Real backend — Revision List', () => {
  test('the whole flow through the UI, kept across a refresh and across signing out and in', async ({ page }, testInfo) => {
    // the longest flow here: it nearly fills the default minute in WebKit, without any step hanging
    test.slow();
    const user = account(testInfo, 'A');
    await registerViaApi(page.request, user);

    await page.goto('/visualizer');
    await expect(bookmark(page)).toHaveAccessibleName('Mark for Revision');
    await bookmark(page).click();
    await form(page).getByRole('radio', { name: 'Forgot the logic' }).check();
    await form(page).getByRole('button', { name: 'Save' }).click();
    await expect(bookmark(page)).toHaveAccessibleName('Added to Revision');
    await expect(badge(page)).toHaveText('1');

    await page.getByRole('navigation').getByRole('link', { name: /^Revision/ }).click();
    await expect(page).toHaveURL(/\/revision$/);
    const bubble = card(page, 'bubble-sort');
    await expect(bubble.getByTestId('revision-reason')).toHaveText('Reason: Forgot the logic');
    await expect(bubble.getByTestId('revision-status')).toHaveText('Pending');

    await page.reload();
    await expect(bubble.getByTestId('revision-reason')).toHaveText('Reason: Forgot the logic');
    await expect(badge(page)).toHaveText('1');

    await bubble.getByRole('link', { name: 'Revise Now: Bubble Sort' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bubble Sort');
    await bookmark(page).click();
    await form(page).getByRole('button', { name: 'Mark as Revised' }).click();
    await expect(badge(page)).toHaveCount(0);

    await signOutViaUi(page);
    await signInViaUi(page, user);
    await waitForDashboard(page);
    await page.getByRole('navigation').getByRole('link', { name: /^Revision/ }).click();
    await expect(bubble).toHaveAttribute('data-status', 'revised');
    await expect(bubble.getByTestId('revision-reason')).toHaveText('Reason: Forgot the logic');

    await bubble.getByRole('button', { name: 'Revise Again: Bubble Sort' }).click();
    await expect(bubble).toHaveAttribute('data-status', 'pending');
    await expect(badge(page)).toHaveText('1');
    expect(await listed(page)).toMatchObject([{ algorithmId: 'bubble-sort', status: 'pending', reason: 'forgot-the-logic' }]);

    await bubble.getByRole('button', { name: 'Remove from Revision: Bubble Sort' }).click();
    await expect(page.getByTestId('revision-empty')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('revision-empty')).toBeVisible();
    expect(await listed(page)).toEqual([]);
  });

  test('duplicates: marking again changes the one record', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    expect((await api(page).put(URL_OF('quick-sort'), { data: { reason: 'forgot-the-logic' } })).status()).toBe(201);
    expect((await api(page).put(URL_OF('quick-sort'), { data: { reason: 'concept-not-clear' } })).status()).toBe(200);
    expect(await listed(page)).toMatchObject([{ algorithmId: 'quick-sort', reason: 'concept-not-clear' }]);
    expect(await listed(page)).toHaveLength(1);
  });

  test("users are isolated: another user's list is never listed, changed or removed, in the API or the page", async ({ page, browser }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await api(page).put(URL_OF('quick-sort'), { data: { reason: 'forgot-the-logic' } });

    const other = await browser.newContext();
    await registerViaApi(other.request, account(testInfo, 'B'));
    expect(await (await api(other).get(`${API_ORIGIN}/api/revisions`)).json()).toEqual({ revisions: [] });
    expect((await api(other).patch(URL_OF('quick-sort'), { data: { status: 'revised' } })).status()).toBe(404);
    expect((await api(other).delete(URL_OF('quick-sort'))).status()).toBe(404);
    const otherPage = await other.newPage();
    await otherPage.goto('/revision');
    await expect(otherPage.getByTestId('revision-empty')).toBeVisible();
    await expect(badge(otherPage)).toHaveCount(0);

    // a user id sent by the client is ignored: this creates B's own record, and A's is untouched
    const me = (await (await api(page).get(`${API_ORIGIN}/api/auth/me`)).json()) as { user: { id: string } };
    expect((await api(other).put(URL_OF('heap-sort'), { data: { userId: me.user.id } })).status()).toBe(201);
    await other.close();
    expect(await listed(page)).toMatchObject([{ algorithmId: 'quick-sort', status: 'pending', reason: 'forgot-the-logic' }]);
    expect(await listed(page)).toHaveLength(1);
  });

  test('unauthorized requests are refused, and the page goes to sign-in', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.context().clearCookies();
    expect((await api(page).get(`${API_ORIGIN}/api/revisions`)).status()).toBe(401);
    expect((await api(page).put(URL_OF('quick-sort'), { data: {} })).status()).toBe(401);
    expect((await api(page).patch(URL_OF('quick-sort'), { data: { status: 'revised' } })).status()).toBe(401);
    expect((await api(page).delete(URL_OF('quick-sort'))).status()).toBe(401);
    await page.goto('/revision');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('invalid algorithm ids and bodies are refused, and store nothing', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    expect((await api(page).put(URL_OF('no-such-algorithm'), { data: {} })).status()).toBe(400);
    expect((await api(page).patch(URL_OF('no-such-algorithm'), { data: { status: 'revised' } })).status()).toBe(400);
    expect((await api(page).delete(URL_OF('no-such-algorithm'))).status()).toBe(400);
    expect((await api(page).put(URL_OF('quick-sort'), { data: { reason: 'because' } })).status()).toBe(400);
    expect((await api(page).patch(URL_OF('quick-sort'), { data: { status: 'finished' } })).status()).toBe(400);
    expect((await api(page).patch(URL_OF('quick-sort'), { data: { status: 'revised' } })).status()).toBe(404);
    expect(await listed(page)).toEqual([]);
  });

  test.describe('a failed load', () => {
    // the browser reports the 500 this test injects; any other console error still fails it
    test.use({ expectedConsoleErrors: [/status of 500/] });

    test('[fault injection] a failed load shows the error and Retry, not an empty list', async ({ page }, testInfo) => {
      await registerViaApi(page.request, account(testInfo, 'A'));
      await api(page).put(URL_OF('quick-sort'), { data: {} });
      let fail = true;
      await page.route(`${API_ORIGIN}/api/revisions`, route => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Server error."}' }) : route.continue()));
      await page.goto('/revision');
      const alert = page.getByTestId('revision-error');
      await expect(alert).toBeVisible();
      await expect(page.getByTestId('revision-empty')).toHaveCount(0);
      fail = false;
      await alert.getByRole('button', { name: 'Retry' }).click();
      await expect(card(page, 'quick-sort')).toBeVisible();
      await expect(badge(page)).toHaveText('1');
    });
  });

  test('the list loads once per page load, whichever pages are then visited', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    let requests = 0;
    page.on('request', r => {
      if (r.url() === `${API_ORIGIN}/api/revisions` && r.method() === 'GET') requests++;
    });
    await page.goto('/revision');
    await expect(page.getByTestId('revision-empty')).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Notes', exact: true }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Visualizer', exact: true }).click();
    await expect(bookmark(page)).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: /^Revision/ }).click();
    await expect(page.getByTestId('revision-empty')).toBeVisible();
    expect(requests).toBe(1);
  });
});
