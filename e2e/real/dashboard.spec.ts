import type { Page } from '@playwright/test';
import { VisualizerApp } from '../support/visualizerApp';
import { test, expect, account, registerViaApi, API_ORIGIN } from './fixtures';

/**
 * The Dashboard against the real API and database (no mock): the daily checklist, the streak and recent activity,
 * read back from the server after a reload and from a second account.
 */

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('checklist-count')).toBeVisible();
}

async function stepBubbleSort(page: Page) {
  const app = new VisualizerApp(page);
  await app.open();
  const recorded = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/progress/visualizer-activity` && r.request().method() === 'POST');
  await app.next();
  expect((await recorded).status()).toBe(200);
}

test.describe('Real backend — dashboard', () => {
  test('a new account: no streak, nothing solved, no recent activity, 0 of 4 goals, no demo label', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await openDashboard(page);
    await expect(page.locator('[data-stat="Problems Solved"]')).toContainText('0Problems Solved');
    await expect(page.locator('[data-stat="Current Streak"]')).toContainText('0 Days');
    await expect(page.getByTestId('recent-empty')).toBeVisible();
    await expect(page.getByTestId('checklist-count')).toHaveText('0 of 4 goals complete');
    await expect(page.getByTestId('demo-badge')).toHaveCount(0);
  });

  test('a walkthrough: verified goal, a 1-day streak and a recent event; the manual tick is saved on the account', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await stepBubbleSort(page);
    await openDashboard(page);
    await expect(page.locator('[data-goal="visualize"]')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('[data-stat="Current Streak"]')).toContainText('1 Day');
    await expect(page.locator('tr[data-event-kind="walkthrough"]')).toContainText('Bubble Sort');

    const saved = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/progress/today/goals/review` && r.request().method() === 'PUT');
    await page.getByRole('checkbox', { name: /Review an algorithm you found hard/ }).check();
    expect((await saved).status()).toBe(200);
    await expect(page.getByTestId('checklist-count')).toHaveText('2 of 4 goals complete');

    // read back from the server, and after a reload
    const today = await (await page.request.get(`${API_ORIGIN}/api/progress/today`)).json();
    expect(today).toMatchObject({ date: new Date().toISOString().slice(0, 10), manualCompleted: ['review'], verified: { walkthroughs: 1 } });
    await page.reload();
    await expect(page.getByTestId('checklist-count')).toHaveText('2 of 4 goals complete');

    // ticking again is idempotent; a verified goal cannot be ticked
    const again = await page.request.put(`${API_ORIGIN}/api/progress/today/goals/review`, { data: { done: true } });
    expect((await again.json()).manualCompleted).toEqual(['review']);
    expect((await page.request.put(`${API_ORIGIN}/api/progress/today/goals/submit`, { data: { done: true } })).status()).toBe(400);
  });

  test("one account's ticks and activity are not another's", async ({ browser }, testInfo) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pa = await a.newPage();
    const pb = await b.newPage();
    await registerViaApi(pa.request, account(testInfo, 'A'));
    await registerViaApi(pb.request, account(testInfo, 'B'));
    expect((await pa.request.put(`${API_ORIGIN}/api/progress/today/goals/review`, { data: { done: true } })).status()).toBe(200);
    const other = await (await pb.request.get(`${API_ORIGIN}/api/progress/today`)).json();
    expect(other.manualCompleted).toEqual([]);
    expect(await (await pb.request.get(`${API_ORIGIN}/api/progress/recent`)).json()).toEqual({ events: [] });
    await a.close();
    await b.close();
  });
});
