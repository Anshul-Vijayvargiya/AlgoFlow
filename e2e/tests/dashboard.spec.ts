import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps } from '../support/engineTrace';
import { ALGORITHM_NAV } from '../../src/data/algorithmMetadata';

/**
 * Dashboard (UI sprint, phase 1). The E2E build uses the mock API: progress has solved problems and no algorithm
 * tracks, so "Continue learning" shows its empty state; weekly activity counts only what a test does in its browser. Each test takes the `app` fixture so that it
 * opens the app (signed in) first.
 */

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
}

test.describe('Dashboard', () => {
  test('shows real progress data and honest empty states — nothing invented', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    const body = page.locator('main');
    for (const invented of ['7.4 hrs', 'Resume Step', 'Step 4 of 10', 'Array Partitioning']) await expect(body).not.toContainText(invented);
    // the mock account's values
    await expect(page.getByTestId('dashboard-stats')).toContainText('42');
    // a fresh browser has done nothing yet: no activity, an honest empty chart
    await expect(page.getByTestId('weekly-active-days')).toHaveText('Active on 0 of 7 days');
    await expect(page.getByTestId('weekly-empty')).toContainText('No activity in the last 7 days');
    // no tracks in progress: an honest empty state, no resume link
    await expect(page.getByTestId('continue-learning')).toContainText('Nothing in progress yet');
    await expect(page.getByTestId('continue-learning').getByRole('link')).toHaveCount(0);
  });

  test('weekly activity counts what was done today: a visualizer walkthrough and a practice submission, each once', async ({ app, page }) => {
    // stepping through one algorithm, back and forth, is one walkthrough
    await app.next();
    await app.previous();
    await app.next();
    await openDashboard(page);
    const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date());
    await expect(page.getByTestId('weekly-active-days')).toHaveText('Active on 1 of 7 days');
    await expect(page.getByTestId('weekly-totals')).toHaveText('This week: 0 practice submissions · 1 visualizer walkthrough');
    await expect(page.getByRole('figure', { name: 'Weekly activity' })).toHaveAccessibleDescription(
      new RegExp(`${today}: 0 practice submissions, 1 visualizer walkthrough\\.`)
    );

    // one practice submission (a wrong answer is still practice)
    await page.goto('/practice');
    await page.locator('[data-problem="p4"]').getByRole('button', { name: 'Practice Now' }).click();
    await page.locator('#practice-submit-btn').click();
    await expect(page.getByTestId('submission-verdict')).toHaveText('Wrong Answer');
    await openDashboard(page);
    await expect(page.getByTestId('weekly-totals')).toHaveText('This week: 1 practice submission · 1 visualizer walkthrough');
    await expect(page.getByRole('figure', { name: 'Weekly activity' })).toHaveAccessibleDescription(
      new RegExp(`${today}: 1 practice submission, 1 visualizer walkthrough\\.`)
    );
    await expect(page.getByTestId('weekly-active-days')).toHaveText('Active on 1 of 7 days');
  });

  test('difficulty badges: one per level, distinct styles, each labelled in text', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    const badges = page.locator('[data-difficulty]');
    await expect(badges).toHaveText(['Easy24', 'Medium14', 'Hard4']);
    const colours = await badges.evaluateAll(els => els.map(e => getComputedStyle(e).color));
    expect(new Set(colours).size).toBe(3);
  });

  test('every recommendation opens its own algorithm in the visualizer', async ({ app, page }) => {
    void app;
    await openDashboard(page);
    const links = page.getByTestId('recommendations').getByRole('link');
    const ids = await links.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.algorithm!));
    expect(ids).toEqual(ALGORITHM_NAV.filter(a => a.implemented).slice(0, 4).map(a => a.id));
    for (const id of ids) {
      await openDashboard(page);
      await page.locator(`[data-algorithm="${id}"]`).click();
      await expect(page).toHaveURL(/\/visualizer$/);
      const def = definition(id as never);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(def.name);
      // the visualizer really runs that algorithm: its first step is the engine's first step for the default input
      const first = engineSteps(id as never, def.defaultInput, def.inputSpec?.target?.defaultValue ?? null)[0];
      await expect(page.getByTestId('current-action')).toHaveText(first.message);
    }
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe-core WCAG 2.1 A/AA: no violations (${theme})`, async ({ app, page }) => {
      void app;
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openDashboard(page);
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('headings and chart summaries are exposed to assistive technology', async ({ app, page }) => {
    // one walkthrough, so the weekly chart is drawn
    await app.next();
    await openDashboard(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: 'Weekly activity' })).toBeVisible();
    await expect(page.getByRole('figure', { name: 'Weekly activity' })).toHaveAccessibleDescription(
      /^Activity per day \(UTC\): .+ In total: 0 practice submissions and 1 visualizer walkthrough\.$/
    );
    await expect(page.getByRole('figure', { name: 'Solved by difficulty' })).toHaveAccessibleDescription('Solved problems by difficulty: Easy 24, Medium 14, Hard 4 (42 in total).');
  });

  test('reduced motion: the hero button does not zoom on hover', async ({ app, page }) => {
    void app;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDashboard(page);
    const launch = page.getByRole('link', { name: 'Launch Visualizer' });
    await launch.hover();
    expect(await launch.evaluate(e => getComputedStyle(e).scale)).toMatch(/^(none|1)$/);
  });
});
