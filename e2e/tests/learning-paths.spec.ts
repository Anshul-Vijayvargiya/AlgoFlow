import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps } from '../support/engineTrace';

/**
 * Learning Paths (launch phase 1). The E2E build uses the mock API: its progress records come from the visualizer
 * activity it keeps in localStorage (the server's rules, on the device). This verifies the page against the mock API
 * only, not against the real server and database. Each test takes the `app` fixture: it opens the visualizer
 * (signed in) first.
 */

async function openRoadmap(page: Page) {
  await page.goto('/learning');
  await expect(page.getByTestId('roadmap-tracks')).toHaveAttribute('aria-busy', 'false');
}

const status = (page: Page, milestone: string) => page.locator(`[data-milestone="${milestone}"]`);

test.describe('Learning Paths', () => {
  test('a new account: nothing explored or completed, implemented milestones not started, others coming soon', async ({ app, page }) => {
    void app;
    await openRoadmap(page);
    await expect(page.locator('[data-status="explored"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/completed/i);
    await expect(page.locator('[data-status="not-started"]')).toHaveCount(9);
    await expect(page.getByTestId('track-summary')).toHaveText(['0 of 3 explored', '0 of 5 explored', '0 of 1 explored']);
    for (const m of ['m10', 'm11']) {
      await expect(status(page, m)).toHaveAttribute('data-status', 'coming-soon');
      await expect(status(page, m)).toContainText('Coming soon');
      await expect(status(page, m).getByRole('link')).toHaveCount(0);
    }
  });

  test('stepping through an algorithm marks its milestone explored, and it persists after a reload', async ({ app, page }) => {
    await app.next();
    await app.expectStep(2);
    await openRoadmap(page);
    await expect(status(page, 'm4')).toHaveAttribute('data-status', 'explored');
    await expect(status(page, 'm4').getByTestId('milestone-status')).toHaveText('Explored');
    await expect(page.locator('[data-status="explored"]')).toHaveCount(1);
    await expect(page.locator('[data-track="t2"]').getByTestId('track-summary')).toHaveText('1 of 5 explored');

    await page.reload();
    await expect(page.getByTestId('roadmap-tracks')).toHaveAttribute('aria-busy', 'false');
    await expect(status(page, 'm4')).toHaveAttribute('data-status', 'explored');
  });

  test('only opening an algorithm from the roadmap is not progress', async ({ app, page }) => {
    void app;
    await openRoadmap(page);
    await status(page, 'm7').getByRole('link', { name: 'Visualize Merge Sort' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(definition('merge-sort').name);
    await openRoadmap(page);
    await expect(status(page, 'm7')).toHaveAttribute('data-status', 'not-started');
  });

  test('every Visualize link opens its own algorithm', async ({ app, page }) => {
    void app;
    await openRoadmap(page);
    const ids = await page.locator('a[data-algorithm]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.algorithm!));
    expect(ids).toEqual(['linear-search', 'binary-search', 'two-pointer', 'bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'reverse-linked-list']);
    for (const id of ids) {
      await openRoadmap(page);
      await page.locator(`a[data-algorithm="${id}"]`).click();
      await expect(page).toHaveURL(/\/visualizer$/);
      const def = definition(id as never);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(def.name);
      // the visualizer really runs that algorithm: its first step is the engine's first step for the default input
      const first = engineSteps(id as never, def.defaultInput, def.inputSpec?.target?.defaultValue ?? def.inputSpec?.value?.defaultValue ?? null)[0];
      await expect(page.getByTestId('current-action')).toHaveText(first.message);
    }
  });

  test('a failed load shows an error with Retry and no statuses; Retry recovers', async ({ app, page }) => {
    void app;
    await page.evaluate(() => {
      const original = Storage.prototype.getItem;
      let failures = 1;
      Storage.prototype.getItem = function (key: string) {
        if (key === 'algoflow_visualizer_activity' && failures-- > 0) throw new Error('Unable to connect to the server.');
        return original.call(this, key);
      };
    });
    // client-side navigation keeps the patched storage
    await page.getByRole('link', { name: /Roadmap/ }).first().click();
    const alert = page.getByTestId('roadmap-error');
    await expect(alert).toContainText('Your progress could not be loaded');
    await expect(page.locator('[data-status="not-started"], [data-status="explored"]')).toHaveCount(0);
    // the roadmap itself stays usable
    await expect(page.locator('a[data-algorithm="bubble-sort"]')).toBeVisible();
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.locator('[data-status="not-started"]')).toHaveCount(9);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe-core WCAG 2.1 A/AA with explored, not-started and coming-soon milestones: no violations (${theme})`, async ({ app, page }) => {
      await app.next();
      await app.expectStep(2);
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openRoadmap(page);
      await expect(status(page, 'm4')).toHaveAttribute('data-status', 'explored');
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});
