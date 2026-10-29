import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import { deriveOutcome, deriveStepVisuals } from '../../src/components/visualizer/barVisuals';
import type { VisualizerApp } from '../support/visualizerApp';

/**
 * Remove Duplicates from Sorted Array through the real UI. What each step shows (bar values, roles and dimming,
 * pointers, value cards, message) is checked against the engine's own trace for the same input, mapped through the
 * app's own bar rules (UI-to-engine consistency). The answers are checked against an independent de-duplication in
 * the unit tests, and the four listings were compiled and run against the generator.
 */
const ID = 'remove-duplicates-sorted' as const;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];
const EXAMPLE = [1, 1, 2, 2, 3];

const engineCards = (s: ExecutionStep) =>
  Object.fromEntries((s.tracker ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));
/** what the bars should show at step k: the app's own mapping of the engine step */
function engineBars(steps: ExecutionStep[], k: number) {
  const { bars } = deriveStepVisuals(steps[k], { positionPointers: definition(ID).positionPointers, outcome: deriveOutcome(steps, k) });
  return bars.map(b => ({ index: b.index, value: b.value, role: b.role, inRange: b.inRange, pointers: b.pointers }));
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

test.describe('Remove Duplicates from Sorted Array', () => {
  test('it is listed in ARRAYS after Container With Most Water', async ({ app }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Container With Most Water')).toBeLessThan(text.indexOf('Remove Duplicates from Sorted Array'));
    expect(text.indexOf('Remove Duplicates from Sorted Array')).toBeLessThan(text.indexOf('LINKED LIST'));
  });

  test('the example [1, 1, 2, 2, 3]: every step shows the bars, pointers, cards and message the engine has; then 3', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await expect(app.targetInput).toHaveCount(0);
    const steps = engineSteps(ID, EXAMPLE);
    await app.expectTotal(steps.length);

    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      const u = shown[k];
      expect(u.bars.map(b => ({ index: b.index, value: b.value, role: b.role, inRange: b.inRange, pointers: b.pointers })), `step ${k + 1} bars`).toEqual(engineBars(steps, k));
      expect(u.tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(u.message, `step ${k + 1}`).toBe(s.message);
    }
    // the in-place writes, as the user sees them
    const writes = shown.filter((_, k) => steps[k].codeRef === 'write');
    expect(writes.map(u => u.bars.map(b => b.value))).toEqual([[1, 2, 2, 2, 3], [1, 2, 3, 2, 3]]);
    const end = shown.at(-1)!;
    expect(end.outcome).toEqual({ kind: 'complete', text: '3 unique values: [1, 2, 3] (nums[0..2])' });
    expect(end.bars.filter(b => b.role === 'kept').map(b => b.index)).toEqual([0, 1, 2]);
    expect(end.bars.filter(b => !b.inRange).map(b => b.index)).toEqual([3, 4]);
  });

  // One test per edge case: each checks the result banner and the kept prefix as drawn.
  for (const { name, input, text, kept } of [
    { name: 'empty array', input: [], text: '0 unique values: the array is empty', kept: [] },
    { name: 'one element', input: [7], text: '1 unique value: [7] (nums[0..0])', kept: [0] },
    { name: 'all duplicates', input: [4, 4, 4, 4], text: '1 unique value: [4] (nums[0..0])', kept: [0] },
    { name: 'all unique', input: [1, 2, 3, 4, 5], text: '5 unique values: [1, 2, 3, 4, 5] (nums[0..4])', kept: [0, 1, 2, 3, 4] },
    { name: 'negative numbers', input: [-5, -5, -1, 0, 0, 7], text: '4 unique values: [-5, -1, 0, 7] (nums[0..3])', kept: [0, 1, 2, 3] },
    { name: 'repeated groups', input: [0, 0, 1, 1, 1, 2, 3, 3, 3, 3], text: '4 unique values: [0, 1, 2, 3] (nums[0..3])', kept: [0, 1, 2, 3] },
  ]) {
    test(`result: ${name}`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await app.enterAndVisualize(input);
      await app.goToLastStep();
      await expect(app.outcome).toHaveText(text);
      const end = await app.state();
      expect(end.bars.filter(b => b.role === 'kept').map(b => b.index)).toEqual(kept);
      expect(end.tracker.unique.value).toBe(String(kept.length));
    });
  }

  test('an unsorted array is refused with the reason, never reordered; "Sort a copy" runs on a sorted copy', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.type('3, 1, 3, 2');
    // the message, with the "Sort a copy" offer inside it
    await expect(app.inputError).toContainText(
      'Remove Duplicates from Sorted Array needs an array sorted in ascending order, but index 0 (3) is greater than index 1 (1).'
    );
    await expect(app.inputError.getByRole('button', { name: 'Sort a copy' })).toBeVisible();
    await expect(app.visualizeButton).toBeDisabled();
    await app.expectBars(EXAMPLE);
    await app.sortCopyButton.click();
    await app.expectBars([1, 2, 3, 3]);
    await expect(app.inputNotice).toBeVisible();
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('3 unique values: [1, 2, 3] (nums[0..2])');
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await expectCodeLines(app, lang, engineSteps(ID, EXAMPLE));
      await app.enterAndVisualize([]);
      await expectCodeLines(app, lang, engineSteps(ID, []));
    });
  }

  test('Play runs to the result at the fast speed; Reset returns to step 1', async ({ app }) => {
    await app.selectAlgorithm(ID);
    const total = await app.totalSteps();
    await app.setSpeed('fast');
    await app.play();
    await expect(app.stepCounter).toHaveAttribute('data-step', String(total), { timeout: total * 1000 + 10_000 });
    await expect(app.outcome).toHaveText('3 unique values: [1, 2, 3] (nums[0..2])');
    await app.reset();
    await app.expectStep(1);
  });

  test('Pause holds the current step mid-trace', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([1, 1, 2, 2, 2, 3, 4, 4, 5, 5, 5, 6]);
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

  test('Randomize gives a sorted array of values from 1 to 9; Restore brings a custom array back', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([4, 4, 4]);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toBeVisible();
    const values = await app.barValues();
    expect(values.every(v => v >= 1 && v <= 9)).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    await expect(app.stepCounter).toHaveAttribute('data-total', String(engineSteps(ID, values).length));
    await app.restoreButton.click();
    await app.expectBars([4, 4, 4]);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe (${theme} theme): mid-trace with kept bars, a write and the cards`, async ({ app, page }) => {
      await page.locator('#header-theme-select').selectOption(theme);
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      await app.selectAlgorithm(ID);
      await app.advance(8); // the first write
      await expect(page.locator('[data-bar-index][data-role="kept"]')).not.toHaveCount(0);
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width: no horizontal scroll with 16 values; the end shows the kept prefix', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([-999, -999, -40, -40, 0, 0, 0, 3, 3, 12, 12, 88, 88, 500, 999, 999]);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('8 unique values: [-999, -40, 0, 3, 12, 88, 500, 999] (nums[0..7])');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
