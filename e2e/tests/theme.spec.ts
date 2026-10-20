import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Theme controls (Phase 2): the header and sign-in page picker, Settings, persistence on the device and the account,
 * and first paint. Light Mode is not visually complete yet (component restyling is a later phase): these tests check
 * the theme state, not the look of every component.
 *
 * The E2E build uses the mock API: the user is signed in by default, and the "account" is the mock user record in
 * localStorage (algoflow_user). Each test takes the `app` fixture only so that it opens /visualizer first.
 */

const themeOf = (page: Page) =>
  page.evaluate(() => ({ theme: document.documentElement.dataset.theme, scheme: document.documentElement.style.colorScheme }));
const storedPreference = (page: Page) => page.evaluate(() => localStorage.getItem('algoflow-theme'));
const accountTheme = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('algoflow_user') ?? '{}')?.preferences?.theme ?? null);

const headerTheme = (page: Page) => page.getByRole('banner').getByRole('combobox', { name: 'Theme' });

async function openSettings(page: Page) {
  await page.locator('#header-profile-btn').click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const group = page.getByRole('group', { name: 'Interface Theme' });
  await expect(group).toBeVisible();
  return group;
}

test.describe('theme control', () => {
  test('is in the header, shows the current choice, and offers Dark, Light and System', async ({ app, page }) => {
    void app;
    const select = headerTheme(page);
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('dark');
    expect(await select.locator('option').allTextContents()).toEqual(['Dark', 'Light', 'System']);
    expect(await themeOf(page)).toEqual({ theme: 'dark', scheme: 'dark' });
  });

  test('Dark → Light → Dark applies at once, is stored on the device, and is saved to the account', async ({ app, page }) => {
    void app;
    const select = headerTheme(page);
    await select.selectOption('light');
    expect(await themeOf(page)).toEqual({ theme: 'light', scheme: 'light' });
    expect(await storedPreference(page)).toBe('light');
    await expect.poll(() => accountTheme(page)).toBe('light');

    await select.selectOption('dark');
    expect(await themeOf(page)).toEqual({ theme: 'dark', scheme: 'dark' });
    expect(await storedPreference(page)).toBe('dark');
    await expect.poll(() => accountTheme(page)).toBe('dark');
  });

  test('System follows the operating system and is shown as "System"', async ({ app, page }) => {
    void app;
    await page.emulateMedia({ colorScheme: 'light' });
    const select = headerTheme(page);
    await select.selectOption('system');
    await expect(select).toHaveValue('system');
    await expect(select.locator('option:checked')).toHaveText('System');
    expect((await themeOf(page)).theme).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(async () => (await themeOf(page)).theme).toBe('dark');
    await expect(select).toHaveValue('system'); // the preference stays System
    expect(await storedPreference(page)).toBe('system');
  });

  test('is keyboard operable', async ({ app, page }) => {
    void app;
    const select = headerTheme(page);
    await select.focus();
    await page.keyboard.press('ArrowDown'); // native select: Dark → Light
    await expect(select).toHaveValue('light');
    await expect.poll(async () => (await themeOf(page)).theme).toBe('light');
  });

  test('the choice survives a reload and is applied before the app renders', async ({ app, page }) => {
    void app;
    await headerTheme(page).selectOption('light');
    // hold the app's JavaScript back: the theme must already be applied by the head script
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    await page.route(u => u.pathname.startsWith('/assets/') && u.pathname.endsWith('.js'), async route => {
      await gate;
      await route.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    expect(await page.evaluate(() => document.querySelector('#root')?.children.length ?? 0)).toBe(0);
    release();
    await expect(headerTheme(page)).toHaveValue('light');
    expect(await themeOf(page)).toEqual({ theme: 'light', scheme: 'light' });
  });
});

test.describe('Settings and the header stay in sync', () => {
  test('Settings shows the header choice; picking in Settings applies at once and updates the header', async ({ app, page }) => {
    void app;
    await headerTheme(page).selectOption('system');
    const group = await openSettings(page);
    await expect(group.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');

    await group.getByRole('button', { name: 'Light' }).click();
    expect(await themeOf(page)).toEqual({ theme: 'light', scheme: 'light' }); // before Save
    await expect(group.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    await expect(headerTheme(page)).toHaveValue('light');
    await expect.poll(() => accountTheme(page)).toBe('light');

    // closing without Save does not undo it: the theme is not part of the Save form
    await page.locator('button:has(svg.lucide-x)').first().click();
    await expect(headerTheme(page)).toHaveValue('light');
    await headerTheme(page).selectOption('dark');
    const again = await openSettings(page);
    await expect(again.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Save keeps the chosen theme and the other settings still save', async ({ app, page }) => {
    void app;
    const group = await openSettings(page);
    await group.getByRole('button', { name: 'Light' }).click();
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Settings updated successfully!')).toBeVisible();
    expect((await themeOf(page)).theme).toBe('light');
    await expect(headerTheme(page)).toHaveValue('light');
    expect(await accountTheme(page)).toBe('light');
  });

  test('a failed account save keeps the device choice and says so; nothing crashes', async ({ app, page }) => {
    void app;
    // the mock API saves the account by writing algoflow_user: make that write fail
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'algoflow_user') throw new Error('account unavailable');
        return original.call(this, key, value);
      };
    });
    await headerTheme(page).selectOption('light');
    expect(await themeOf(page)).toEqual({ theme: 'light', scheme: 'light' });
    expect(await storedPreference(page)).toBe('light');
    const group = await openSettings(page);
    await expect(group.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('theme-sync-error')).toHaveText(
      'Saved on this device, but it could not be saved to your account. Press Save to try again.'
    );
    // the app keeps working (the fixture also fails the test on any console or page error)
    await page.locator('button:has(svg.lucide-x)').first().click();
    await headerTheme(page).selectOption('dark');
    expect((await themeOf(page)).theme).toBe('dark');
  });
});

test.describe('signed out', () => {
  test('the sign-in page has the theme control; the choice applies and is kept after signing out', async ({ app, page }) => {
    void app;
    await headerTheme(page).selectOption('light');
    await page.locator('#header-profile-btn').click();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/auth/);
    const select = page.getByRole('combobox', { name: 'Theme' });
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('light'); // signing out does not reset the theme
    expect((await themeOf(page)).theme).toBe('light');
    await select.selectOption('dark');
    expect(await themeOf(page)).toEqual({ theme: 'dark', scheme: 'dark' });
    expect(await storedPreference(page)).toBe('dark');
    await select.selectOption('system');
    await expect(select).toHaveValue('system');
  });
});

test.describe('theme control on phones @mobile', () => {
  test('fits the header, is labelled and works', async ({ app, page }) => {
    void app;
    const select = headerTheme(page);
    await expect(select).toBeVisible();
    const box = (await select.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await select.selectOption('light');
    expect((await themeOf(page)).theme).toBe('light');
  });
});
