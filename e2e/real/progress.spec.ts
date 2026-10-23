import type { Page } from '@playwright/test';
import { VisualizerApp } from '../support/visualizerApp';
import { test, expect, account, registerViaApi, signInViaUi, signOutViaUi, tracksOf, waitForDashboard, API_ORIGIN } from './fixtures';

/**
 * Visualizer activity, Learning Paths and Progress against the real API and database (no mock). Persistence is
 * checked by reading it back from the server: after a reload, after signing out and in, and from a fresh browser.
 */

/** steps once in the visualizer (Bubble Sort, the default) and waits for the server to accept the activity */
async function stepBubbleSort(page: Page) {
  const app = new VisualizerApp(page);
  await app.open();
  const recorded = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/progress/visualizer-activity` && r.request().method() === 'POST');
  await app.next();
  const res = await recorded;
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ recorded: true, algorithmId: 'bubble-sort', stepsViewed: 2 });
}

async function openRoadmap(page: Page) {
  await page.goto('/learning');
  await expect(page.getByTestId('roadmap-tracks')).toHaveAttribute('aria-busy', 'false');
}

const milestone = (page: Page, id: string) => page.locator(`[data-milestone="${id}"]`);

test.describe('Real backend — progress', () => {
  test('a new account has no progress anywhere', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    expect(await tracksOf(page)).toEqual([]);
    await openRoadmap(page);
    await expect(page.locator('[data-status="explored"]')).toHaveCount(0);
    await expect(page.locator('[data-status="not-started"]')).toHaveCount(9);
  });

  test('opening the visualizer records nothing; stepping is recorded by the server', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    const app = new VisualizerApp(page);
    await app.open();
    expect(await tracksOf(page)).toEqual([]);

    await stepBubbleSort(page);
    expect(await tracksOf(page)).toEqual([expect.objectContaining({ algorithmId: 'bubble-sort', status: 'in_progress', topic: 'Sorting' })]);
    const summary = await (await page.request.get(`${API_ORIGIN}/api/progress/summary`)).json();
    expect(summary.algorithmTotals).toMatchObject({ practised: 1, completed: 0 });
    expect(summary.weeklyActivity.at(-1).steps).toBe(2);
    // one algorithm stepped through today: one walkthrough, dated today (UTC)
    expect(summary.weeklyActivity.at(-1)).toMatchObject({ date: new Date().toISOString().slice(0, 10), walkthroughs: 1, submissions: 0 });
  });

  test('stepping back and forth and repeating the walkthrough does not inflate the stored activity', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await stepBubbleSort(page);
    const app = new VisualizerApp(page);
    await app.previous();
    await app.next();
    await page.reload();
    await app.expectStep(1);
    await app.next();
    // the reload starts a new walkthrough, so the step is sent again; the server keeps the maximum
    await expect.poll(async () => (await (await page.request.get(`${API_ORIGIN}/api/progress/summary`)).json()).weeklyActivity.at(-1).steps).toBe(2);
    expect(await tracksOf(page)).toHaveLength(1);
    // the same algorithm again, even after a reload, is still one walkthrough today
    expect((await (await page.request.get(`${API_ORIGIN}/api/progress/summary`)).json()).weeklyActivity.at(-1).walkthroughs).toBe(1);
  });

  test('Learning Paths shows the server status, and it persists after a reload, a sign-out/in and in a fresh browser', async ({ page, browser }, testInfo) => {
    const user = account(testInfo, 'A');
    await registerViaApi(page.request, user);
    await stepBubbleSort(page);

    await openRoadmap(page);
    await expect(milestone(page, 'm4')).toHaveAttribute('data-status', 'explored');
    await expect(page.locator('[data-status="explored"]')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('roadmap-tracks')).toHaveAttribute('aria-busy', 'false');
    await expect(milestone(page, 'm4')).toHaveAttribute('data-status', 'explored');

    await signOutViaUi(page);
    await signInViaUi(page, user);
    await waitForDashboard(page);
    await openRoadmap(page);
    await expect(milestone(page, 'm4')).toHaveAttribute('data-status', 'explored');

    // a separate browser context shares nothing with this one: the status can only come from the database
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await signInViaUi(other, user);
    await waitForDashboard(other);
    await openRoadmap(other);
    await expect(milestone(other, 'm4')).toHaveAttribute('data-status', 'explored');
    await fresh.close();
  });

  test('the Progress page and the Dashboard show the same server data', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await stepBubbleSort(page);
    await page.goto('/progress');
    await expect(page.getByTestId('progress-stats')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('stat-explored')).toContainText('1 / 19');
    await expect(page.getByTestId('stat-learned')).toContainText('0 / 19');
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('continue-learning')).toContainText('Bubble Sort');
    await expect(page.getByTestId('dashboard-stats')).toContainText('0Algorithms Learned');
  });

  test("switching accounts in the same tab never shows the previous user's progress", async ({ page }, testInfo) => {
    const a = account(testInfo, 'A');
    const b = account(testInfo, 'B');
    await registerViaApi(page.request, a);
    await stepBubbleSort(page);
    await openRoadmap(page);
    await expect(milestone(page, 'm4')).toHaveAttribute('data-status', 'explored');
    await signOutViaUi(page);

    // B is created on the server from a separate client, then signs in in this same tab
    const setup = await page.context().browser()!.newContext();
    await registerViaApi(setup.request, b);
    await setup.close();
    await signInViaUi(page, b);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('continue-learning')).toContainText('Nothing in progress yet');
    await openRoadmap(page);
    await expect(page.locator('[data-status="explored"]')).toHaveCount(0);
    await page.goto('/progress');
    await expect(page.getByTestId('progress-stats')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('stat-explored')).toContainText('0 / 19');
    expect(await tracksOf(page)).toEqual([]);
  });
});
