import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import { deriveOutcome, deriveStepVisuals } from '../../src/components/visualizer/barVisuals';
import type { VisualizerApp } from '../support/visualizerApp';

/**
 * Merge Sorted Array through the real UI: two input fields (nums1, nums2); nums1 drawn as bars with its placeholder
 * slots and the pointers i / k; nums2 as a row with its cursor j. What each step shows is checked against the
 * engine's own trace for the same input, mapped through the app's own bar rules. The answers are checked against
 * sorting both arrays together in the unit tests, and the four listings were compiled and run against the generator.
 */
const ID = 'merge-sorted-array' as const;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** types both arrays into the real fields and presses Visualize; waits for the bars (nums1 + its n placeholders) */
async function enter(app: VisualizerApp, nums1: number[], nums2: number[]) {
  await app.arrayInput.or(app.page.locator('#array-input')).first().fill(nums1.join(', '));
  await app.secondInput.fill(nums2.join(', '));
  await app.visualizeButton.click();
  await app.expectBars([...nums1, ...Array<number>(nums2.length).fill(0)]);
  await app.expectStep(1);
}

const engineCards = (s: ExecutionStep) =>
  Object.fromEntries((s.tracker ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));
function engineBars(steps: ExecutionStep[], k: number) {
  const { bars } = deriveStepVisuals(steps[k], { positionPointers: definition(ID).positionPointers, outcome: deriveOutcome(steps, k) });
  return bars.map(b => ({ index: b.index, value: b.value, role: b.role, inRange: b.inRange, pointers: b.pointers }));
}
/** the nums2 row as the page object reads it: its values, and the VALUE in the active (cursor) cell */
const engineRow = (s: ExecutionStep) =>
  Object.fromEntries((s.buffers ?? []).map(b => [b.name, { cells: b.values, active: b.cursor === undefined ? [] : [b.values[b.cursor]] }]));

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

test.describe('Merge Sorted Array', () => {
  test('it is listed in ARRAYS after Container With Most Water, apart from Merge Sort', async ({ app }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Container With Most Water')).toBeLessThan(text.indexOf('Merge Sorted Array'));
    expect(text.indexOf('Merge Sorted Array')).toBeLessThan(text.indexOf('LINKED LIST'));
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Merge Sorted Array');
    await app.selectAlgorithm('merge-sort');
    await expect(app.heading).toHaveText('Merge Sort');
  });

  test('the example: every step shows nums1’s bars, i / k, the nums2 row, the cards and the message the engine has', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await expect(page.locator('#array-input')).toHaveValue('1, 2, 3');
    await expect(app.secondInput).toHaveValue('2, 5, 6');
    const steps = engineSteps(ID, [1, 2, 3], null, [2, 5, 6]);
    await app.expectTotal(steps.length);

    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      const u = shown[k];
      expect(u.bars.map(b => ({ index: b.index, value: b.value, role: b.role, inRange: b.inRange, pointers: b.pointers })), `step ${k + 1} bars`).toEqual(engineBars(steps, k));
      expect(u.buffers, `step ${k + 1} nums2`).toEqual(engineRow(s));
      expect(u.tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(u.message, `step ${k + 1}`).toBe(s.message);
    }
    expect(shown.filter((_, k) => steps[k].codeRef?.startsWith('write')).map(u => u.bars.map(b => b.value))).toEqual([
      [1, 2, 3, 0, 0, 6], [1, 2, 3, 0, 5, 6], [1, 2, 3, 3, 5, 6], [1, 2, 2, 3, 5, 6],
    ]);
    const end = shown.at(-1)!;
    expect(end.outcome).toEqual({ kind: 'sorted', text: 'Merged: [1, 2, 2, 3, 5, 6]' });
    expect(end.bars.every(b => b.role === 'sorted')).toBe(true);
    expect(end.chips).toEqual([]);
  });

  // One test per edge case: the merged array as drawn, and the banner.
  for (const { name, nums1, nums2, merged } of [
    { name: 'm = 0 (nums1 is only placeholders)', nums1: [], nums2: [4, 8], merged: [4, 8] },
    { name: 'n = 0 (nothing to merge)', nums1: [3, 9], nums2: [], merged: [3, 9] },
    { name: 'duplicate values', nums1: [2, 2, 2], nums2: [2, 2], merged: [2, 2, 2, 2, 2] },
    { name: 'negative values', nums1: [-5, -1, 0], nums2: [-3, -3, 7], merged: [-5, -3, -3, -1, 0, 7] },
    { name: 'arrays of different lengths', nums1: [1, 3, 5, 7, 9, 11, 13], nums2: [2], merged: [1, 2, 3, 5, 7, 9, 11, 13] },
    { name: 'all of nums2 smaller', nums1: [4, 5, 6], nums2: [1, 2, 3], merged: [1, 2, 3, 4, 5, 6] },
  ]) {
    test(`result: ${name}`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await enter(app, nums1, nums2);
      await app.expectTotal(engineSteps(ID, nums1, null, nums2).length);
      await app.goToLastStep();
      await expect(app.outcome).toHaveText(`Merged: [${merged.join(', ')}]`);
      expect(await app.barValues()).toEqual(merged);
    });
  }

  test('each array is validated on its own field; "Sort a copy" sorts both and Restore brings them back', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await expect(page.locator('#input-hint')).toContainText('nums1 and nums2: up to 16 whole numbers together');

    await app.secondInput.fill('1, x');
    await expect(app.inputError).toHaveText('nums2: Value 2 ("x") is not a whole number.');
    await expect(app.inputError).toHaveAttribute('data-field', 'second');
    await expect(app.secondInput).toHaveAttribute('aria-invalid', 'true');
    await expect(app.visualizeButton).toBeDisabled();

    await app.secondInput.fill(Array(14).fill(1).join(', '));
    await expect(app.inputError).toHaveText('Too many values: nums1 and nums2 hold 17 together. The visualizer supports at most 16.');

    await page.locator('#array-input').fill('3, 1');
    await app.secondInput.fill('9, 2');
    await expect(app.inputError).toContainText('Merge Sorted Array needs nums1 sorted in ascending order, but index 0 (3) is greater than index 1 (1).');
    await expect(page.locator('#array-input')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#array-input').fill('1, 3');
    await expect(app.inputError).toContainText('Merge Sorted Array needs nums2 sorted in ascending order, but index 0 (9) is greater than index 1 (2).');
    await expect(app.inputError).toHaveAttribute('data-field', 'second');

    await page.locator('#array-input').fill('3, 1');
    await app.sortCopyButton.click();
    await app.expectBars([1, 3, 0, 0]);
    await expect(app.secondInput).toHaveValue('2, 9');
    await expect(app.inputNotice).toContainText('Your original order: nums1 3, 1; nums2 9, 2.');
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Merged: [1, 2, 3, 9]');
    await app.restoreButton.click();
    await expect(page.locator('#array-input')).toHaveValue('3, 1');
    await expect(app.secondInput).toHaveValue('9, 2');
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await expectCodeLines(app, lang, engineSteps(ID, [1, 2, 3], null, [2, 5, 6]));
      await enter(app, [5], [1, 2]); // nums1 runs out first: the compare short-circuits on i < 0
      await expectCodeLines(app, lang, engineSteps(ID, [5], null, [1, 2]));
    });
  }

  test('Play runs to the merged array at the fast speed; Reset returns to step 1', async ({ app }) => {
    await app.selectAlgorithm(ID);
    const total = await app.totalSteps();
    await app.setSpeed('fast');
    await app.play();
    await expect(app.stepCounter).toHaveAttribute('data-step', String(total), { timeout: total * 1000 + 10_000 });
    await expect(app.outcome).toHaveText('Merged: [1, 2, 2, 3, 5, 6]');
    await app.reset();
    await app.expectStep(1);
  });

  test('Pause holds the current step mid-trace', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await enter(app, [1, 4, 7, 10, 13, 16], [2, 3, 8, 9, 14, 15]);
    const total = await app.totalSteps();
    await app.setSpeed('medium');
    const firstChange = app.recordStepChanges(1);
    await app.play();
    expect((await firstChange)[0].step).toBe(2);
    await app.pause();
    await expect(app.playButton).toBeVisible();
    const at = await app.stepNumber();
    expect(at, 'paused before the end').toBeLessThan(total);
    await app.expectNoStepChangeFor(1500);
    expect(await app.stepNumber()).toBe(at);
  });

  test('Randomize gives two sorted arrays sharing the size; Restore brings both custom arrays back', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(app, [1, 1], [0]);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toBeVisible();
    const parse = async (loc: ReturnType<Page['locator']>) => {
      const t = (await loc.inputValue()).trim();
      return t ? t.split(',').map(v => Number(v.trim())) : [];
    };
    const nums1 = await parse(page.locator('#array-input'));
    const nums2 = await parse(app.secondInput);
    expect(nums1.length + nums2.length).toBe(3);
    for (const a of [nums1, nums2]) expect(a).toEqual([...a].sort((x, y) => x - y));
    await app.goToLastStep();
    await expect(app.outcome).toHaveText(`Merged: [${[...nums1, ...nums2].sort((x, y) => x - y).join(', ')}]`);
    await app.restoreButton.click();
    await expect(page.locator('#array-input')).toHaveValue('1, 1');
    await expect(app.secondInput).toHaveValue('0');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe (${theme} theme): mid-trace with a write, the nums2 row and both input fields`, async ({ app, page }) => {
      await page.locator('#header-theme-select').selectOption(theme);
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      await app.selectAlgorithm(ID);
      await app.advance(4); // the first write
      await expect(page.locator('[data-buffer="nums2"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll with 16 values; the nums2 row fits', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await app.selectAlgorithm(ID);
    await enter(app, [-999, -40, 0, 3, 12, 88, 500, 999], [-500, -2, 1, 4, 13, 87, 400, 998]);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Merged: [-999, -500, -40, -2, 0, 1, 3, 4, 12, 13, 87, 88, 400, 500, 998, 999]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
