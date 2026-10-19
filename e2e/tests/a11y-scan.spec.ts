import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Automated WCAG 2.1 A/AA scans (axe-core) of the visualizer in the states a user can reach.
 *
 * An automated scan finds only a subset of problems (missing names, contrast, ARIA misuse...). It is NOT a
 * substitute for keyboard and screen-reader testing — see accessibility-focus.spec.ts and the sprint report for
 * what was and was not checked manually.
 */
async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.map(v => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
  }));
}

test.describe('axe-core WCAG 2.1 A/AA scan of reachable visualizer states', () => {
  test('default view (Bubble Sort, step 1)', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    expect(await violations(page)).toEqual([]);
  });

  test('mid-trace with compare/pointer highlights and the code line active', async ({ app, page }) => {
    await app.selectAlgorithm('quick-sort');
    await app.advance(6);
    expect(await violations(page)).toEqual([]);
  });

  test('invalid draft with a validation message', async ({ app, page }) => {
    await app.selectAlgorithm('linear-search');
    await app.type('1, x', 3);
    await expect(app.inputError).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('unsorted input for Binary Search (Sort a copy offered) and the input-needs-attention state', async ({ app, page }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([5, 1, 4, 2]);
    await app.selectAlgorithm('binary-search');
    await expect(app.inputIssue).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('sorted-copy notice with Restore', async ({ app, page }) => {
    await app.selectAlgorithm('binary-search');
    await app.type([5, 1, 4, 2], 4);
    await app.sortCopyButton.click();
    await expect(app.inputNotice).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('Merge Sort buffers mid-merge', async ({ app, page }) => {
    await app.selectAlgorithm('merge-sort');
    await app.enterAndVisualize([2, 3, 1, 0]);
    await app.advance(16);
    await expect(page.getByTestId('buffers')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('final result (not found) announced in a status region', async ({ app, page }) => {
    await app.selectAlgorithm('linear-search');
    await app.enterAndVisualize([4, 2], 9);
    await app.goToLastStep();
    await expect(app.outcome).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('unimplemented algorithm card', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Jump Search/ }).click();
    await expect(app.heading).toHaveText('Jump Search');
    expect(await violations(page)).toEqual([]);
  });
});

test.describe('axe-core scan at phone width (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('default view, Live Code tab, and the open algorithm drawer', async ({ app, page }) => {
    await expect(app.heading).toHaveText('Bubble Sort');
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Live Code' }).click();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Open algorithm list' }).click();
    await expect(page.getByRole('dialog', { name: 'Algorithm list' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('validation message and Sort a copy at phone width', async ({ app, page }) => {
    await app.selectAlgorithm('two-pointer');
    await app.type([8, 1, 6], 7);
    await expect(app.sortCopyButton).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
