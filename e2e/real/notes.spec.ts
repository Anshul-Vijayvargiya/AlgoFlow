import type { Page } from '@playwright/test';
import { test, expect, account, registerViaApi, API_ORIGIN } from './fixtures';

/** Notes against the real API and database: every note reachable through pages, search and tags; ownership. */

/** creates n notes through the real API, oldest first (note n is the newest) */
async function createNotes(page: Page, n: number) {
  for (let i = 1; i <= n; i++) {
    const res = await page.request.post(`${API_ORIGIN}/api/notes`, {
      data: { title: `Real note ${i}`, content: i === 2 ? 'Mentions quokka once.' : `Body ${i}`, tags: i === 1 ? ['FirstOnly'] : ['Bulk'] },
    });
    expect(res.status()).toBe(201);
  }
}
const cards = (page: Page) => page.getByTestId('notes-list').getByRole('heading', { level: 3 });

test.describe('Real backend — Notes', () => {
  test('25 notes: pages through all of them, newest first, from the server', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await createNotes(page, 25);
    await page.goto('/notes');
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–20 of 25 notes');
    await expect(cards(page).first()).toHaveText('Real note 25');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(cards(page)).toHaveText(['Real note 5', 'Real note 4', 'Real note 3', 'Real note 2', 'Real note 1']);

    // the same through the API
    const p2 = await (await page.request.get(`${API_ORIGIN}/api/notes?page=2&limit=20`)).json();
    expect(p2).toMatchObject({ total: 25, page: 2, totalPages: 2 });
    expect(p2.notes).toHaveLength(5);
  });

  test('search and tags cover every note, not only the first page', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await createNotes(page, 25);
    await page.goto('/notes');
    await page.getByLabel('Search notes').fill('quokka');
    await expect(cards(page)).toHaveText(['Real note 2']);
    await page.getByLabel('Search notes').fill('');
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–20 of 25 notes');
    await page.getByRole('button', { name: 'FirstOnly' }).click();
    await expect(cards(page)).toHaveText(['Real note 1']);
    expect((await (await page.request.get(`${API_ORIGIN}/api/notes/tags`)).json()).tags).toEqual(['Bulk', 'FirstOnly']);
  });

  test('invalid page parameters are refused; a page past the end is empty', async ({ page }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    for (const qs of ['page=0', 'page=abc', 'limit=500', 'page=1.5']) {
      expect((await page.request.get(`${API_ORIGIN}/api/notes?${qs}`)).status(), qs).toBe(400);
    }
    const beyond = await (await page.request.get(`${API_ORIGIN}/api/notes?page=7`)).json();
    expect(beyond).toMatchObject({ notes: [], total: 0, page: 7 });
  });

  test("another user's notes and tags are never listed, searched or counted", async ({ page, browser }, testInfo) => {
    await registerViaApi(page.request, account(testInfo, 'A'));
    await createNotes(page, 3);
    const other = await browser.newContext();
    await registerViaApi(other.request, account(testInfo, 'B'));
    expect(await (await other.request.get(`${API_ORIGIN}/api/notes?search=quokka`)).json()).toMatchObject({ notes: [], total: 0 });
    expect((await (await other.request.get(`${API_ORIGIN}/api/notes/tags`)).json()).tags).toEqual([]);
    const otherPage = await other.newPage();
    await otherPage.goto('/notes');
    await expect(otherPage.locator('main')).toContainText('You have not created any algorithm notes yet');
    await other.close();

    expect((await page.request.get(`${API_ORIGIN}/api/notes`)).status()).toBe(200);
    await page.context().clearCookies();
    expect((await page.request.get(`${API_ORIGIN}/api/notes?page=2`)).status()).toBe(401);
    expect((await page.request.get(`${API_ORIGIN}/api/notes/tags`)).status()).toBe(401);
  });
});
