import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '../fixtures';

/**
 * Resources (/resources): downloadable study notes, apart from the learner's own Notes (/notes). The navbar's
 * Resources item (between Notes and Progress) opens it from every page and is shown active there; back / forward and a
 * reload work; the SQL Notes card previews and downloads the supplied PDF itself; the Notes page keeps only the
 * learner's notes; and the page stays usable at every width.
 */
const SQL_NOTES_FILE = join(process.cwd(), 'public', 'downloads', 'sql-notes.pdf');
const PDF_URL = '/downloads/sql-notes.pdf';
const nav = (page: Page) => page.getByRole('banner').getByRole('navigation');
const navLink = (page: Page, name: string) => nav(page).getByRole('link', { name, exact: true });
const card = (page: Page) => page.locator('[data-resource="sql-notes"]');

async function openResources(page: Page) {
  await page.goto('/resources');
  await expect(card(page)).toHaveAttribute('data-state', 'ready');
}

async function expectActive(page: Page, name: string) {
  await expect(navLink(page, name)).toHaveAttribute('aria-current', 'page');
  await expect(navLink(page, name)).toHaveClass(/text-cyan-300/);
  await expect(nav(page).locator('a[aria-current="page"]')).toHaveCount(1);
}

test.describe('Resources page', () => {
  test('the navbar: Resources sits between Notes and Progress; one of each; no Roadmap or Practice', async ({ app, page }) => {
    void app;
    await page.goto('/dashboard');
    const labels = (await nav(page).getByRole('link').allTextContents()).map(t => t.trim());
    expect(labels).toEqual(['Dashboard', 'Visualizer', 'Playground', 'Patterns', 'Notes', 'Resources', 'Progress']);
  });

  for (const from of ['/dashboard', '/visualizer', '/playground', '/patterns', '/notes']) {
    test(`Resources opens /resources from ${from}, shown active there`, async ({ app, page }) => {
      void app;
      await page.goto(from);
      await navLink(page, 'Resources').click();
      await expect(page).toHaveURL(/\/resources$/);
      await expectActive(page, 'Resources');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Study resources/i);
      await expect(page.getByRole('heading', { level: 2, name: 'Downloadable notes' })).toBeVisible();
      await expect(card(page).getByRole('heading', { level: 3, name: 'SQL Notes' })).toBeVisible();
    });
  }

  test('back and forward move between Notes and Resources with the right page and active item; a reload keeps /resources', async ({ app, page }) => {
    void app;
    await page.goto('/notes');
    await navLink(page, 'Resources').click();
    await expect(page).toHaveURL(/\/resources$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/notes$/);
    await expectActive(page, 'Notes');
    await expect(page.locator('#notes-create-btn')).toBeVisible();
    await expect(page.getByTestId('downloadable-notes')).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/\/resources$/);
    await expectActive(page, 'Resources');
    await expect(card(page)).toBeVisible();
    // a deep link / reload of the page itself (not a folder of files at the same path)
    await page.reload();
    await expect(page).toHaveURL(/\/resources$/);
    await expect(card(page)).toHaveAttribute('data-state', 'ready');
  });

  test('Notes stays the personal notes page: its own notes and Create Note, and no downloadable notes', async ({ app, page }) => {
    void app;
    await page.goto('/dashboard');
    await navLink(page, 'Notes').click();
    await expect(page).toHaveURL(/\/notes$/);
    await expectActive(page, 'Notes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/DSA NOTES & REVISION/);
    await expect(page.locator('#notes-create-btn')).toBeVisible();
    await expect(page.locator('#notes-search-input')).toBeVisible();
    await expect(page.getByTestId('downloadable-notes')).toHaveCount(0);
    await expect(page.locator('[data-resource]')).toHaveCount(0);
  });

  test('the SQL Notes card: what it covers, and the format, pages and size of the actual file', async ({ app, page }) => {
    void app;
    await openResources(page);
    await expect(card(page)).toContainText('MySQL basics, CRUD, datatypes, keys, constraints, filtering, aggregates, joins, UNION, subqueries, and views.');
    await expect(card(page).getByTestId('resource-meta')).toHaveText('PDF · 6 pages · 171 KB');
    expect(readFileSync(SQL_NOTES_FILE).length).toBe(175_152);
  });

  test('Preview Notes opens the real PDF in a new tab', async ({ app, page }) => {
    void app;
    await openResources(page);
    // (headless Chromium has no PDF viewer and hands the tab's PDF to its downloader, so the tab's own URL stays
    // empty: what is checked is that a new tab asked for the notes, and got the PDF itself)
    const context = page.context();
    const [popup, request] = await Promise.all([
      context.waitForEvent('page'),
      // the new tab's navigation (the card's availability check is a HEAD request, never a navigation)
      context.waitForEvent('request', r => r.url().endsWith(PDF_URL) && r.isNavigationRequest()),
      card(page).getByRole('link', { name: 'Preview Notes: SQL Notes (PDF, opens in a new tab)' }).click(),
    ]);
    expect(popup).not.toBe(page);
    expect(request.method()).toBe('GET');
    const response = await request.response();
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toMatch(/^application\/pdf/);
    await popup.close();
  });

  test('Download PDF saves the supplied PDF as AlgoFlow-SQL-Notes.pdf, byte for byte', async ({ app, page }) => {
    void app;
    await openResources(page);
    const [download] = await Promise.all([page.waitForEvent('download'), card(page).getByRole('link', { name: 'Download PDF: SQL Notes (171 KB)' }).click()]);
    expect(download.suggestedFilename()).toBe('AlgoFlow-SQL-Notes.pdf');
    expect(readFileSync((await download.path())!).equals(readFileSync(SQL_NOTES_FILE))).toBe(true);
  });

  test('the PDF URL serves the file itself with a PDF content type (not the app page)', async ({ app, page }) => {
    void app;
    const res = await page.request.get(PDF_URL);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^application\/pdf/);
    expect((await res.body()).equals(readFileSync(SQL_NOTES_FILE))).toBe(true);
  });

  test('a missing file: the card says so and offers no broken links', async ({ app, page }) => {
    void app;
    // how a missing static file looks on a single-page-app host (the app's own page in its place); a 404 or no network
    // is covered by the unit tests (a 404 here would also log a console error, which this suite forbids)
    await page.route(`**${PDF_URL}`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>AlgoFlow</title>' }));
    await page.goto('/resources');
    await expect(card(page)).toHaveAttribute('data-state', 'missing');
    await expect(card(page).getByTestId('resource-missing')).toHaveText(/These notes are unavailable right now/);
    await expect(card(page).getByRole('link')).toHaveCount(0);
  });

  for (const width of [390, 768, 1440]) {
    test(`${width}px: no horizontal scroll; the card and both actions fully inside the page, not overlapping`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 900 });
      await openResources(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const box = (await card(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const preview = (await card(page).getByTestId('resource-preview').boundingBox())!;
      const download = (await card(page).getByTestId('resource-download').boundingBox())!;
      for (const b of [preview, download]) {
        expect(b.x).toBeGreaterThanOrEqual(box.x);
        expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
        expect(b.height).toBeGreaterThanOrEqual(32);
      }
      expect(preview.x + preview.width <= download.x || download.y >= preview.y + preview.height, 'Preview and Download do not overlap').toBe(true);
    });
  }

  test('no accessibility violations on the Resources page (dark theme)', async ({ app, page }) => {
    void app;
    await openResources(page);
    await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
