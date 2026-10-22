import type { Page } from '@playwright/test';
import { test, expect, account, registerViaApi, signInViaUi, signOutViaUi, API_ORIGIN } from './fixtures';

/**
 * Settings against the real API and database: the preferred language and the daily goal are saved on the account,
 * survive a reload, change what the app does, and never leak to another account.
 */

async function openSettings(page: Page) {
  await page.locator('#header-profile-btn').click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
}
const languageButton = (page: Page, label: string) => page.getByRole('group', { name: 'Default Programming Language' }).getByRole('button', { name: label, exact: true });

test.describe('Real backend — Settings', () => {
  test('preferred language and daily goal: saved, kept after a reload, and applied', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await page.goto('/dashboard');
    await expect(page.getByTestId('daily-goal-text')).toHaveText('0 of 30 min today');

    await openSettings(page);
    await languageButton(page, 'PYTHON').click();
    await expect(languageButton(page, 'PYTHON')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel(/Daily Learning Goal/).fill('45');
    const saved = page.waitForResponse(r => r.url() === `${API_ORIGIN}/api/users/profile` && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: /Save/ }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByTestId('daily-goal-text')).toHaveText('0 of 45 min today');

    await page.reload();
    await expect(page.getByTestId('daily-goal-text')).toHaveText('0 of 45 min today');
    // the code panel, Playground and Practice start in the preferred language
    await expect(page.getByRole('banner').getByRole('combobox', { name: 'Programming language' })).toHaveValue('python');
    await page.goto('/playground');
    await expect(page.getByTestId('source-file-name')).toHaveText('main.py');
    await page.goto('/practice');
    await page.locator('[data-problem="p1"]').getByRole('button', { name: 'Practice Now' }).click();
    await expect(page.getByPlaceholder('Write your solution here...')).toHaveValue(/def two_sum/);

    // the form shows the saved values
    await page.getByRole('button', { name: 'Cancel' }).click();
    await openSettings(page);
    await expect(languageButton(page, 'PYTHON')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Daily Learning Goal/)).toHaveValue('45');
    const me = await (await page.request.get(`${API_ORIGIN}/api/auth/me`)).json();
    expect(me.user.preferences).toMatchObject({ preferredLanguage: 'python', dailyGoalMinutes: 45 });
  });

  test("switching accounts: the next account gets its own settings, never the previous one's", async ({ page, browser }, testInfo) => {
    const a = account(testInfo, 'A');
    const b = account(testInfo, 'B');
    await registerViaApi(page.request, a);
    expect((await page.request.patch(`${API_ORIGIN}/api/users/profile`, { data: { preferences: { preferredLanguage: 'java', dailyGoalMinutes: 90 } } })).status()).toBe(200);
    const setup = await browser.newContext();
    await registerViaApi(setup.request, b);
    await setup.close();

    await page.goto('/dashboard');
    await expect(page.getByTestId('daily-goal-text')).toHaveText('0 of 90 min today');
    await openSettings(page);
    await expect(languageButton(page, 'JAVA')).toHaveAttribute('aria-pressed', 'true');
    // a fresh page load closes the dialog
    await page.goto('/dashboard');
    await signOutViaUi(page);

    await signInViaUi(page, b);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('daily-goal-text')).toHaveText('0 of 30 min today');
    await expect(page.getByRole('banner').getByRole('combobox', { name: 'Programming language' })).toHaveValue('cpp');
    await openSettings(page);
    await expect(languageButton(page, 'CPP')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Daily Learning Goal/)).toHaveValue('30');
  });

  test('invalid values are refused by the server and change nothing', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    for (const preferences of [{ dailyGoalMinutes: 30.5 }, { dailyGoalMinutes: 4 }, { dailyGoalMinutes: 999 }, { preferredLanguage: 'rust' }]) {
      expect((await page.request.patch(`${API_ORIGIN}/api/users/profile`, { data: { preferences } })).status(), JSON.stringify(preferences)).toBe(400);
    }
    const me = await (await page.request.get(`${API_ORIGIN}/api/auth/me`)).json();
    expect(me.user.preferences).toMatchObject({ preferredLanguage: 'cpp', dailyGoalMinutes: 30 });
    await page.context().clearCookies();
    expect((await page.request.patch(`${API_ORIGIN}/api/users/profile`, { data: { preferences: { dailyGoalMinutes: 60 } } })).status()).toBe(401);
  });
});
