import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { ALGORITHM_NAV } from '../../src/data/algorithmMetadata';
import { IMPLEMENTED_TOPICS } from '../../src/data/algorithmCatalog';

/**
 * Progress accuracy and visualizer activity (UI sprint, phase 2). The E2E build uses the mock API, which applies the
 * server's recording rules and keeps the activity in localStorage, so it survives reloads as server data would. Each
 * test takes the `app` fixture: it opens the visualizer (signed in) first.
 */

const IMPLEMENTED = ALGORITHM_NAV.filter(a => a.implemented).length;
const LISTED = ALGORITHM_NAV.length;

async function openProgress(page: Page) {
  await page.goto('/progress');
  await expect(page.getByTestId('progress-stats')).toHaveAttribute('aria-busy', 'false');
}

/** what the mock API has recorded on this device */
const recorded = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('algoflow_visualizer_activity') ?? '{"days":{},"tracks":{}}') as { days: Record<string, Record<string, number>>; tracks: Record<string, unknown> });

/** the furthest step recorded per algorithm and day (every test runs within one day) */
const todaysSteps = async (page: Page) => Object.values((await recorded(page)).days).flatMap(d => Object.values(d));

test.describe('Progress', () => {
  test('real totals and honest labels: nothing hardcoded, nothing invented', async ({ app, page }) => {
    void app;
    await openProgress(page);
    const main = page.locator('main');
    await expect(main).not.toContainText('/ 26');
    await expect(main).not.toContainText(/cumulative algorithm executions/i);
    // only topics with visualized algorithms are listed (Graphs and DP have none yet); Trees counts every visualized tree
    // algorithm in the catalog (the four traversals, Root to Leaf Paths, the two BST builds, Convert BST to Balanced BST,
    // Print in Range, Validate BST and Mirror a BST), never a number typed here
    for (const gone of ['Graphs', 'DP']) await expect(page.getByTestId('topic-coverage')).not.toContainText(gone);
    const trees = IMPLEMENTED_TOPICS.find(t => t.topic === 'Trees')!.algorithmIds.length;
    expect(trees).toBe(11);
    await expect(page.getByTestId('topic-coverage')).toContainText(`Trees 0 of ${trees}`);
    await expect(page.getByTestId('stat-learned')).toContainText(`0 / ${IMPLEMENTED}`);
    await expect(page.getByTestId('stat-learned')).toContainText(`of the ${IMPLEMENTED} visualized algorithms (${LISTED} listed)`);
    await expect(page.getByTestId('stat-explored')).toContainText(`0 / ${IMPLEMENTED}`);
    await expect(page.getByRole('progressbar', { name: 'Algorithms learned' })).toHaveAttribute('aria-valuemax', String(IMPLEMENTED));
    await expect(page.getByTestId('daily-steps-empty')).toBeVisible();
  });

  test('opening the visualizer is not activity; stepping is, and it persists across reloads', async ({ app, page }) => {
    // the fixture opened the visualizer: nothing is recorded for that
    await app.selectAlgorithm('merge-sort' as never);
    expect(await recorded(page)).toEqual({ days: {}, tracks: {} });

    await app.next();
    await app.expectStep(2);
    await expect.poll(() => todaysSteps(page)).toEqual([2]);

    await openProgress(page);
    await expect(page.getByTestId('stat-explored')).toContainText(`1 / ${IMPLEMENTED}`);
    // exploring is not learning
    await expect(page.getByTestId('stat-learned')).toContainText(`0 / ${IMPLEMENTED}`);
    // the last day is today, named by its real (UTC) weekday
    const weekday = new Date().toUTCString().slice(0, 3);
    await expect(page.getByRole('figure', { name: 'Visualizer steps per day' })).toHaveAccessibleDescription(new RegExp(`${weekday} 2\\.$`));
    await expect(page.getByRole('figure', { name: 'Topic coverage' })).toHaveAccessibleDescription(/Sorting 1 of 6/);

    await page.reload();
    await expect(page.getByTestId('progress-stats')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('stat-explored')).toContainText(`1 / ${IMPLEMENTED}`);
  });

  test('no duplicates: stepping back and forth and reopening the visualizer do not inflate activity', async ({ app, page }) => {
    await app.next();
    await app.previous();
    await app.next();
    await app.previous();
    await app.next();
    await expect.poll(() => todaysSteps(page)).toEqual([2]);
    // remount: leave and come back (a fresh page load)
    await page.goto('/dashboard');
    await app.open();
    await app.next();
    await expect.poll(() => todaysSteps(page)).toEqual([2]);
    // reaching the end records the furthest step, once
    await app.goToLastStep();
    const total = await app.totalSteps();
    await expect.poll(() => todaysSteps(page)).toEqual([total]);
    expect(Object.keys((await recorded(page)).tracks)).toEqual(['bubble-sort']);
  });

  test('the Dashboard and the Progress page agree', async ({ app, page }) => {
    await app.next();
    await expect.poll(() => todaysSteps(page)).toEqual([2]);

    await openProgress(page);
    const streak = (await page.getByTestId('stat-streak').textContent())!.match(/(\d+) Days?/)![1];

    // the Dashboard shows the same streak, and the algorithms explored from the same totals (1 stepped through)
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-stats')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-stat="Current Streak"]')).toContainText(`${streak} Day`);
    await expect(page.locator('[data-stat="Algorithms Explored"]')).toContainText(/^1 \/ \d+Algorithms Explored/);
    // the algorithm stepped through is the one to continue
    await expect(page.getByTestId('continue-learning')).toContainText('Bubble Sort');
  });

  test('a recording failure is reported and never interrupts the visualizer (retry: unit tests)', async ({ app, page }) => {
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { __restoreStorage: () => void }).__restoreStorage = () => (Storage.prototype.setItem = original);
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'algoflow_visualizer_activity') throw new Error('quota exceeded');
        return original.call(this, key, value);
      };
    });
    await app.next();
    await app.next();
    await app.expectStep(3);
    expect(await recorded(page)).toEqual({ days: {}, tracks: {} });

    // the notice is shown on the Progress page (client-side navigation keeps the session)
    await page.getByRole('link', { name: /Progress/ }).first().click();
    await expect(page.getByTestId('progress-recording-error')).toContainText('could not be saved');
    await expect(page.getByTestId('stat-explored')).toContainText(`0 / ${IMPLEMENTED}`);
  });

  test('a failed load shows an error with Retry, and Retry recovers', async ({ app, page }) => {
    void app;
    await page.evaluate(() => {
      const original = Storage.prototype.getItem;
      let failures = 1;
      Storage.prototype.getItem = function (key: string) {
        if (key === 'algoflow_visualizer_activity' && failures-- > 0) throw new Error('Unable to connect to the server.');
        return original.call(this, key);
      };
    });
    await page.getByRole('link', { name: /Progress/ }).first().click();
    const alert = page.getByTestId('progress-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Your progress could not be loaded');
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('stat-explored')).toContainText(`0 / ${IMPLEMENTED}`);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA with recorded activity: no violations (${theme})`, async ({ app, page }) => {
      await app.next();
      await expect.poll(() => todaysSteps(page)).toEqual([2]);
      await page.getByRole('banner').getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await openProgress(page);
      await expect(page.getByRole('figure', { name: 'Visualizer steps per day' })).toBeVisible();
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  // the names drawn on two lines: "Heap & Priority Queue" only; on a 320px phone also "Bit Manipulation"
  for (const [width, wrapped] of [
    [390, ['Heap &Priority Queue']],
    [360, ['Heap &Priority Queue']],
    [320, ['Heap &Priority Queue', 'BitManipulation']],
  ] as const) {
    test(`mobile (${width}px): the topic radar has no crowded scale labels, long names wrap inside it, and nothing scrolls sideways`, async ({ app, page }) => {
      void app;
      await page.setViewportSize({ width, height: 800 });
      await openProgress(page);
      const radar = page.getByTestId('topic-coverage').locator('.recharts-polar-radius-axis');
      const ticks = page.getByTestId('topic-coverage').locator('.recharts-polar-angle-axis-tick');
      await expect(ticks).toHaveCount(IMPLEMENTED_TOPICS.length);
      // every topic name is drawn whole, inside the chart (a long name beside a side vertex was cut off at the edge)
      const chart = (await page.getByTestId('topic-coverage').locator('svg.recharts-surface').boundingBox())!;
      // recharts draws the axis through a portal and can redraw it (once the chart is measured), so the names may be off
      // the page for a moment: wait until every name is drawn, and the long ones on two lines, then read them all at once.
      // An empty read would pass the checks below without checking anything, so it is never accepted.
      const labels = ticks.locator('text');
      await expect(labels).toHaveCount(IMPLEMENTED_TOPICS.length);
      await expect(ticks.locator('text[data-lines="2"]')).toHaveCount(wrapped.length);
      let boxes: { text: string; lines: number; left: number; right: number; top: number; bottom: number }[] = [];
      await expect
        .poll(async () => {
          boxes = await labels.evaluateAll(els =>
            els.map(e => ({ text: e.textContent ?? '', lines: e.querySelectorAll('tspan').length, ...JSON.parse(JSON.stringify(e.getBoundingClientRect())) }))
          );
          return boxes.length;
        })
        .toBe(IMPLEMENTED_TOPICS.length);
      for (const box of boxes) {
        expect(box.left, box.text).toBeGreaterThanOrEqual(chart.x - 0.5);
        expect(box.right, box.text).toBeLessThanOrEqual(chart.x + chart.width + 0.5);
        expect(box.top, box.text).toBeGreaterThanOrEqual(chart.y - 0.5);
        expect(box.bottom, box.text).toBeLessThanOrEqual(chart.y + chart.height + 0.5);
      }
      // only the names too long for the chart's width wrap; every other name keeps its one line
      expect(boxes.filter(b => b.lines === 2).map(b => b.text)).toEqual([...wrapped]);
      expect(boxes.filter(b => b.lines === 1)).toHaveLength(IMPLEMENTED_TOPICS.length - wrapped.length);
      await expect(radar.locator('.recharts-polar-radius-axis-tick')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByTestId('topic-coverage-list')).toContainText('Linked List');
      await expect(page.getByTestId('topic-coverage-list')).toContainText('Fundamentals');
      await expect(page.getByTestId('topic-coverage-list')).toContainText('Heap & Priority Queue');
    });
  }
});
