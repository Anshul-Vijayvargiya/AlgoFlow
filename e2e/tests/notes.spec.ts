import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Notes on the mock API, which pages and filters like the server (GET /api/notes). The real server is covered by
 * e2e/real/notes.spec.ts. Each test stores 25 notes on the device (plus the 2 demo notes), newest first: note 25 is
 * the newest, so notes 1–7 are on page 2.
 */

async function seedNotes(page: Page) {
  await page.evaluate(() => {
    const notes = Array.from({ length: 25 }, (_, i) => ({
      id: `seed-${i + 1}`,
      title: `Seeded note ${i + 1}`,
      content: i === 2 ? 'The rare word zephyr appears only here.' : `Body of note ${i + 1}`,
      tags: i === 0 ? ['OnlyOnPageTwo'] : ['Seeded'],
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    }));
    localStorage.setItem('algoflow_notes', JSON.stringify(notes));
  });
}

async function openNotes(page: Page) {
  await page.goto('/notes');
  await expect(page.getByTestId('notes-range')).toBeVisible();
}
const cards = (page: Page) => page.getByTestId('notes-list').getByRole('heading', { level: 3 });

test.describe('Notes — all notes are reachable', () => {
  test('pages through every note, newest first', async ({ app, page }) => {
    void app;
    await seedNotes(page);
    await openNotes(page);
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–20 of 25 notes');
    await expect(page.getByTestId('notes-page')).toHaveText('Page 1 of 2');
    await expect(cards(page).first()).toHaveText('Seeded note 25');
    await expect(cards(page)).toHaveCount(20);

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 21–25 of 25 notes');
    await expect(cards(page)).toHaveText(['Seeded note 5', 'Seeded note 4', 'Seeded note 3', 'Seeded note 2', 'Seeded note 1']);
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByTestId('notes-page')).toHaveText('Page 1 of 2');
  });

  test('search runs across all notes and starts from the first page of results', async ({ app, page }) => {
    void app;
    await seedNotes(page);
    await openNotes(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Search notes').fill('zephyr');
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–1 of 1 matching notes');
    await expect(cards(page)).toHaveText(['Seeded note 3']);
    await expect(page.getByTestId('notes-pagination').getByRole('button')).toHaveCount(0);
  });

  test('the tag filter lists tags of every note, including ones only on a later page, and filters across all notes', async ({ app, page }) => {
    void app;
    await seedNotes(page);
    await openNotes(page);
    const onlyLater = page.getByRole('button', { name: 'OnlyOnPageTwo' });
    await expect(onlyLater).toBeVisible();
    await onlyLater.click();
    await expect(onlyLater).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveText(['Seeded note 1']);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–20 of 25 notes');
  });

  test('no match: an honest empty state, distinct from having no notes', async ({ app, page }) => {
    void app;
    await seedNotes(page);
    await openNotes(page);
    await page.getByLabel('Search notes').fill('no note says this');
    await expect(page.locator('main')).toContainText('No notes match your current search query or tag filter.');
  });

  test('creating a note shows it first; deleting the only note on the last page goes back a page', async ({ app, page }) => {
    void app;
    await page.evaluate(() => {
      const notes = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: `Note ${i}`, content: 'x', tags: ['T'], createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), updatedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }));
      localStorage.setItem('algoflow_notes', JSON.stringify(notes));
    });
    await openNotes(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(cards(page)).toHaveText(['Note 0']);
    page.once('dialog', d => d.accept());
    await page.getByTestId('notes-list').getByTitle('Delete Note').click();
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–20 of 20 notes');

    await page.locator('#notes-create-btn').click();
    await page.locator('#note-modal-title').fill('Brand new note');
    await page.locator('#note-modal-content').fill('fresh');
    await page.getByRole('button', { name: 'Save Note' }).click();
    await expect(cards(page).first()).toHaveText('Brand new note');
    await expect(page.getByTestId('notes-range')).toHaveText('Showing 1–20 of 21 notes');
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on the paged list: no violations in the new controls (${theme})`, async ({ app, page }) => {
      void app;
      await seedNotes(page);
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openNotes(page);
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).include('[data-testid="notes-pagination"]').include('#notes-search-input').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});
