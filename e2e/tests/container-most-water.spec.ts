import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import type { UiState, VisualizerApp } from '../support/visualizerApp';

/**
 * Container With Most Water through the real UI. What each step shows is checked against the engine's own trace for
 * the same input (UI-to-engine consistency); the answers are checked against brute force in the unit tests, and the
 * four listings were compiled and run against the generator.
 */
const ID = 'container-most-water' as const;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];
const EXAMPLE = [1, 8, 6, 2, 5, 4, 8, 3, 7];

const engineCards = (s: ExecutionStep) =>
  Object.fromEntries((s.tracker ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));
const engineContainers = (s: ExecutionStep) =>
  Object.fromEntries(Object.entries(s.container ?? {}).filter(([, span]) => span).map(([kind, span]) => [kind, { ...span }]));
const shownContainers = (u: UiState) => Object.fromEntries(Object.entries(u.containers).map(([kind, { box: _box, ...span }]) => [kind, span]));
const barPointers = (u: UiState) => u.bars.filter(b => b.pointers.length).map(b => `${b.pointers.join('+')}@${b.index}`).sort();
const enginePointers = (s: ExecutionStep) => {
  const at = new Map<number, string[]>();
  for (const [name, i] of Object.entries(s.pointers ?? {})) at.set(i, [...(at.get(i) ?? []), name]);
  return [...at].map(([i, names]) => `${names.join('+')}@${i}`).sort();
};
const settle = (page: Page) =>
  page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));

/** the drawn bar of a column (the coloured block, not the label or the index row) */
const barBlock = (page: Page, i: number) => page.locator(`[data-bar-index="${i}"] > div:first-child > div:last-child`);

/**
 * The current container's water spans the two columns' centres and rises exactly to the shorter bar's top. Polled:
 * after a resize the overlay re-measures and then slides to its new place (a CSS transition that may start after
 * any one snapshot of the running animations), so the check waits for it to arrive — a misplaced overlay never does.
 */
async function expectWaterOnBars(page: Page, left: number, right: number, shorter: number) {
  await expect
    .poll(async () => {
      const water = (await page.locator('[data-container="current"]').boundingBox())!;
      const l = (await page.locator(`[data-bar-index="${left}"]`).boundingBox())!;
      const r = (await page.locator(`[data-bar-index="${right}"]`).boundingBox())!;
      const bar = (await barBlock(page, shorter).boundingBox())!;
      const off = (a: number, b: number) => Math.abs(a - b) < 1.5;
      return {
        'left edge at the left line': off(water.x, l.x + l.width / 2),
        'right edge at the right line': off(water.x + water.width, r.x + r.width / 2),
        'water level at the shorter line': off(water.y, bar.y),
        'water floor at the bars’ floor': off(water.y + water.height, bar.y + bar.height),
      };
    }, { message: 'the water sits on the two lines' })
    .toEqual({
      'left edge at the left line': true,
      'right edge at the right line': true,
      'water level at the shorter line': true,
      'water floor at the bars’ floor': true,
    });
}

async function expectCodeLines(app: VisualizerApp, lang: ProgrammingLanguage, steps: ExecutionStep[]) {
  await app.setLanguage(lang);
  await app.reset();
  await app.expectStep(1);
  const lines = steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef!));
  expect(lines.every(n => n !== null), `${lang}: every step has a line`).toBe(true);
  const shown = await app.collectStates(steps.length);
  expect(shown.map(u => u.activeLine?.n ?? null), lang).toEqual(lines);
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Container With Most Water', () => {
  test('it is listed in ARRAYS after Majority Element', async ({ app }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Majority Element')).toBeLessThan(text.indexOf('Container With Most Water'));
    expect(text.indexOf('Container With Most Water')).toBeLessThan(text.indexOf('LINKED LIST'));
  });

  test('the example: every step shows the pointers, cards and containers the engine has; then max area 49 at [1, 8]', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await expect(app.targetInput).toHaveCount(0);
    const steps = engineSteps(ID, EXAMPLE);
    await app.expectTotal(steps.length);

    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      expect(shown[k].tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(shownContainers(shown[k]), `step ${k + 1} containers`).toEqual(engineContainers(s));
      expect(barPointers(shown[k]), `step ${k + 1} pointers`).toEqual(enginePointers(s));
      expect(shown[k].message, `step ${k + 1}`).toBe(s.message);
    }
    const end = shown.at(-1)!;
    expect(end.outcome).toEqual({ kind: 'found', text: 'Max area 49: lines 1 and 8 (min(8, 7) × 7)' });
    expect(end.bars.filter(b => b.role === 'found').map(b => b.index)).toEqual([1, 8]);
    expect(end.tracker).toMatchObject({ maxArea: { value: '49' }, bestLeft: { value: '1' }, bestRight: { value: '8' } });
  });

  test('the water sits between the two lines at the shorter one’s height (desktop and phone width)', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const steps = engineSteps(ID, EXAMPLE);
    // the 49 container: lines 1 (8) and 8 (7)
    const k = steps.findIndex(s => s.codeRef === 'calc-area' && s.variables!.area === 49);
    await app.advance(k);
    await expectWaterOnBars(page, 1, 8, 8);
    await expect(page.locator('[data-container="current"]')).toContainText('area 49');
    await expect(page.locator('[data-container="best"]')).toContainText('best 8');

    await page.setViewportSize({ width: 375, height: 800 });
    await expectWaterOnBars(page, 1, 8, 8);
  });

  test('the shorter line moves, and equal heights move the right pointer — explained in the panel', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([2, 5, 3, 2]);
    const steps = engineSteps(ID, [2, 5, 3, 2]);
    const shown = await app.collectStates(steps.length);
    const compares = steps.map((s, k) => [s, shown[k]] as const).filter(([s]) => s.codeRef === 'compare-heights');
    expect(compares.map(([, u]) => u.currentAction)).toEqual([
      'height[left] < height[right]?  2 < 2 → false',
      'height[left] < height[right]?  2 < 3 → true',
      'height[left] < height[right]?  5 < 3 → false',
    ]);
    expect(compares[0][1].explanation).toContain('either line can go; this code moves right');
    expect(compares[1][1].explanation).toContain('The left line (2) is shorter');
    expect(compares[1][1].explanation).toContain('drop the left line');
    expect(compares[2][1].explanation).toContain('The right line (3) is shorter');
    expect(compares[2][1].explanation).toContain('drop the right line');
    // after each comparison the pointer that moved is the shorter one (right on a tie)
    const after = steps.map((s, k) => [s, shown[k]] as const).filter(([s]) => s.codeRef === 'move-left' || s.codeRef === 'move-right');
    expect(after.map(([, u]) => barPointers(u))).toEqual([['left@0', 'right@2'], ['left@1', 'right@2'], ['left+right@1']]);
  });

  // One test per case (each a full run; together they used to exceed WebKit's 60 s test budget on this machine).
  // Each checks the banner, the locked bars, the best container drawn, and the area against every pair (brute force).
  for (const { name, heights, best: [l, r], text } of [
    { name: 'zero heights everywhere: 0, the outermost pair', heights: [0, 0, 0], best: [0, 2], text: 'Max area 0: lines 0 and 2 (min(0, 0) × 2)' },
    { name: 'a zero height on one end', heights: [0, 5, 4], best: [1, 2], text: 'Max area 4: lines 1 and 2 (min(5, 4) × 1)' },
    { name: 'equal heights: the widest pair', heights: [3, 3, 3, 3], best: [0, 3], text: 'Max area 9: lines 0 and 3 (min(3, 3) × 3)' },
    { name: 'increasing heights', heights: [1, 2, 3, 4, 5], best: [1, 4], text: 'Max area 6: lines 1 and 4 (min(2, 5) × 3)' },
    { name: 'decreasing heights', heights: [5, 4, 3, 2, 1], best: [0, 3], text: 'Max area 6: lines 0 and 3 (min(5, 2) × 3)' },
    { name: 'duplicate heights: the two tall copies', heights: [1, 9, 2, 9, 1], best: [1, 3], text: 'Max area 18: lines 1 and 3 (min(9, 9) × 2)' },
    { name: 'the best pair at the left end', heights: [9, 9, 1, 1, 1], best: [0, 1], text: 'Max area 9: lines 0 and 1 (min(9, 9) × 1)' },
    { name: 'the best pair at the right end', heights: [1, 1, 1, 9, 9], best: [3, 4], text: 'Max area 9: lines 3 and 4 (min(9, 9) × 1)' },
    { name: 'the best pair in the middle', heights: [1, 2, 10, 1, 10, 2, 1], best: [2, 4], text: 'Max area 20: lines 2 and 4 (min(10, 10) × 2)' },
    { name: 'the fewest lines: two', heights: [4, 7], best: [0, 1], text: 'Max area 4: lines 0 and 1 (min(4, 7) × 1)' },
    { name: 'the largest heights', heights: [999, 0, 999], best: [0, 2], text: 'Max area 1998: lines 0 and 2 (min(999, 999) × 2)' },
  ]) {
    test(`result: ${name}`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await app.enterAndVisualize(heights);
      await app.goToLastStep();
      await expect(app.outcome).toHaveText(text);
      await expect(app.outcome).toHaveAttribute('data-outcome-kind', 'found');
      const end = await app.state();
      expect(end.bars.filter(b => b.role === 'found').map(b => b.index)).toEqual([l, r]);
      const area = Math.min(heights[l], heights[r]) * (r - l);
      expect(end.containers.best).toMatchObject({ left: l, right: r, area });
      // no pair holds more (brute force over every pair)
      let most = 0;
      for (let i = 0; i < heights.length; i++) for (let j = i + 1; j < heights.length; j++) most = Math.max(most, Math.min(heights[i], heights[j]) * (j - i));
      expect(area).toBe(most);
    });
  }

  test('fewer than two heights or a negative one: explained on the array field, and Visualize is disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await expect(page.locator('#input-hint')).toContainText('2 to 16 whole numbers (0 to 999)');
    for (const [text, message] of [
      ['5', 'Container With Most Water needs at least 2 values; got 1.'],
      ['', 'Container With Most Water needs at least 2 values; the array is empty.'],
      ['3, -1, 4', 'Value 2 (-1) is below 0: Container With Most Water takes values from 0 to 999.'],
    ]) {
      await app.type(text);
      await expect(app.inputError).toHaveText(message);
      await expect(app.inputError).toHaveAttribute('data-field', 'array');
      await expect(app.arrayInput).toHaveAttribute('aria-invalid', 'true');
      await expect(app.visualizeButton).toBeDisabled();
    }
    // the running trace is untouched
    await app.expectBars(EXAMPLE);
    await app.type('0, 4');
    await expect(app.inputError).toHaveCount(0);
    await expect(app.visualizeButton).toBeEnabled();
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await expectCodeLines(app, lang, engineSteps(ID, EXAMPLE));
    });
  }

  test('Play runs to the result at the fast speed; Reset returns to step 1', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([4, 1, 3]);
    const total = await app.totalSteps();
    await app.setSpeed('fast');
    await app.play();
    await expect(app.stepCounter).toHaveAttribute('data-step', String(total), { timeout: total * 1000 + 10_000 });
    await expect(app.outcome).toHaveText('Max area 6: lines 0 and 2 (min(4, 3) × 2)');
    await app.reset();
    await app.expectStep(1);
  });

  test('Pause holds the current step mid-trace', async ({ app }) => {
    await app.selectAlgorithm(ID);
    const long = await app.totalSteps();
    await app.setSpeed('medium');
    const firstChange = app.recordStepChanges(1);
    await app.play();
    expect((await firstChange)[0].step).toBe(2);
    await app.pause();
    await expect(app.playButton).toBeVisible();
    const at = await app.stepNumber();
    expect(at, 'paused before the end').toBeLessThan(long);
    await app.expectNoStepChangeFor(1500);
    expect(await app.stepNumber()).toBe(at);
  });

  test('Randomize gives a valid run of non-negative heights; Restore brings a custom array back', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([0, 9, 0, 9]);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toBeVisible();
    const values = await app.barValues();
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values.every(v => v >= 0)).toBe(true);
    await expect(app.stepCounter).toHaveAttribute('data-total', String(engineSteps(ID, values).length));
    await app.restoreButton.click();
    await app.expectBars([0, 9, 0, 9]);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe (${theme} theme): mid-trace with the water, the best outline and the cards`, async ({ app, page }) => {
      await page.locator('#header-theme-select').selectOption(theme);
      await settle(page);
      await app.selectAlgorithm(ID);
      await app.advance(14);
      await expect(page.locator('[data-container="best"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll with 16 lines; the containers stay inside the chart', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([3, 999, 0, 12, 450, 7, 7, 300, 2, 88, 999, 5, 60, 1, 640, 9]);
    await app.advance(30);
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const chart = (await page.getByTestId('array-visualizer').boundingBox())!;
    for (const c of await page.locator('[data-container]').all()) {
      const box = (await c.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(chart.x);
      expect(box.x + box.width).toBeLessThanOrEqual(chart.x + chart.width);
    }
  });
});
