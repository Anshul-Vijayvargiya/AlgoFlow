import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, engineSteps, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';
import type { UiState } from '../support/visualizerApp';

/**
 * Maximum Subarray (Kadane's algorithm) through the real UI. What each step shows — the cards, the pointers, the
 * message and the highlighted line — is checked against the engine's own trace for the same input; the answers are
 * checked against a brute force in the unit tests (maximumSubarray.test.ts).
 */
const ID = 'maximum-subarray' as const;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];
const EXAMPLE = [-2, 1, -3, 4, -1, 2, 1, -5, 4];

const engineCards = (s: ExecutionStep) =>
  Object.fromEntries((s.tracker ?? []).map(c => [c.name, { value: c.value === null ? '—' : String(c.value), role: c.role ?? '' }]));
const barPointers = (u: UiState) => u.bars.filter(b => b.pointers.length).map(b => `${[...b.pointers].sort().join('+')}@${b.index}`).sort();
/** the pointers drawn under the bars: the definition's positionPointers that are inside the array */
const enginePointers = (s: ExecutionStep, n: number) => {
  const drawn = definition(ID).positionPointers ?? [];
  const at = new Map<number, string[]>();
  for (const [name, i] of Object.entries(s.pointers ?? {})) if (drawn.includes(name) && i >= 0 && i < n) at.set(i, [...(at.get(i) ?? []), name]);
  return [...at].map(([i, names]) => `${names.sort().join('+')}@${i}`).sort();
};

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Maximum Subarray', () => {
  test('it is listed in ARRAYS, before STRINGS', async ({ app }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text.indexOf('Trapping Rain Water')).toBeLessThan(text.indexOf('Maximum Subarray'));
    expect(text.indexOf('Maximum Subarray')).toBeLessThan(text.indexOf('STRINGS'));
  });

  test('the example: every step shows the cards, pointers and message the engine has; then 6 from [4, -1, 2, 1]', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await expect(app.targetInput).toHaveCount(0);
    const steps = engineSteps(ID, EXAMPLE);
    await app.expectTotal(steps.length);
    const shown = await app.collectStates(steps.length);
    for (const [k, s] of steps.entries()) {
      expect(shown[k].tracker, `step ${k + 1} cards`).toEqual(engineCards(s));
      expect(barPointers(shown[k]), `step ${k + 1} pointers`).toEqual(enginePointers(s, EXAMPLE.length));
      expect(shown[k].message, `step ${k + 1}`).toBe(s.message);
    }
    const end = shown.at(-1)!;
    expect(end.outcome).toEqual({ kind: 'found', text: 'Max sum 6: nums[3..6] = [4, -1, 2, 1]' });
    expect(end.bars.filter(b => b.role === 'found').map(b => b.index)).toEqual([3, 4, 5, 6]);
  });

  for (const lang of LANGUAGES) {
    test(`the highlighted code line follows the trace (${lang})`, async ({ app }) => {
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const steps = engineSteps(ID, EXAMPLE);
      const lines = steps.map(s => resolveCodeRef(definition(ID), lang, s.codeRef!));
      expect(lines.every(n => n !== null)).toBe(true);
      const shown = await app.collectStates(steps.length);
      expect(shown.map(u => u.activeLine?.n ?? null), lang).toEqual(lines);
    });
  }

  test('all negative: the answer is the single largest value', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([-8, -3, -6, -2, -5, -4]);
    await app.goToLastStep();
    await expect(app.outcome).toHaveText('Max sum -2: nums[3..3] = [-2]');
  });

  test('an empty array is refused on the field, and Visualize is disabled; negatives are accepted', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.type('');
    await expect(app.inputError).toHaveText('Maximum Subarray needs at least 1 values; the array is empty.');
    await expect(app.visualizeButton).toBeDisabled();
    await app.type('-5, 3, -1');
    await expect(app.inputError).toHaveCount(0);
    await expect(app.visualizeButton).toBeEnabled();
  });

  test('Randomize gives values from -20 to 20 in the order drawn; Restore brings a custom array back', async ({ app }) => {
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([3, -1, 2]);
    await app.randomizeButton.click();
    await expect(app.inputNotice).toBeVisible();
    const values = await app.barValues();
    expect(values.length).toBeGreaterThanOrEqual(1);
    expect(values.every(v => v >= -20 && v <= 20)).toBe(true);
    await expect(app.stepCounter).toHaveAttribute('data-total', String(engineSteps(ID, values).length));
    await app.restoreButton.click();
    await app.expectBars([3, -1, 2]);
  });

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe (${theme} theme): mid-trace with the current run, dimmed bars and the cards`, async ({ app, page }) => {
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await app.advance(20);
      await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      expect(await violations(page)).toEqual([]);
    });
  }

  test('phone width with 16 values: no horizontal scroll, and the pointer chips never overlap', async ({ app, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await app.selectAlgorithm(ID);
    await app.enterAndVisualize([5, -9, 3, -1, 4, -20, 7, 2, -3, 6, -8, 1, 9, -4, 2, -6]);
    const total = await app.totalSteps();
    const shown = await app.collectStates(total);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for (const [k, s] of shown.entries()) {
      for (const [a, A] of s.chips.entries()) {
        for (const B of s.chips.slice(a + 1)) {
          const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
          expect(overlap, `step ${k + 1}: chips "${A.text}" and "${B.text}"`).toBe(false);
        }
      }
    }
  });
});
