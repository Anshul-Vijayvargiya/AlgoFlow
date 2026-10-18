import { test, expect } from '../fixtures';
import { walkAndCompareWithEngine } from '../support/walk';
import { binarySearchProbes, isNonDecreasing, isValidSearchAnswer } from '../support/oracles';
import { dedupe, foundIndices, pointerAt } from '../support/derive';
import { engineSteps } from '../support/engineTrace';

const BIN = [1, 3, 5, 7, 9, 11, 14];
const CASES: { name: string; array: number[]; target: number; duplicates?: boolean }[] = [
  { name: 'target in the middle', array: BIN, target: 7 },
  { name: 'target at the first position', array: BIN, target: 1 },
  { name: 'target at the last position', array: BIN, target: 14 },
  { name: 'absent, inside the range', array: BIN, target: 6 },
  { name: 'absent, below the range', array: BIN, target: -5 },
  { name: 'absent, above the range', array: BIN, target: 100 },
  { name: 'single element, present', array: [5], target: 5 },
  { name: 'single element, absent', array: [5], target: 6 },
  { name: 'empty array', array: [], target: 4 },
  { name: 'negative values', array: [-9, -4, 0, 3, 8], target: -4 },
  { name: 'duplicates — any matching index is valid', array: [1, 2, 2, 2, 3], target: 2, duplicates: true },
  { name: 'duplicates — absent', array: [1, 2, 2, 2, 3], target: 4, duplicates: true },
];

test.describe('Binary Search — sorted input', () => {
  for (const { name, array, target, duplicates } of CASES) {
    test(name, async ({ app }) => {
      expect(isNonDecreasing(array), 'test data must be sorted').toBe(true);
      await app.selectAlgorithm('binary-search');
      await app.enterAndVisualize(array, target);

      await expect(app.arrayInput).toHaveValue(array.join(', '));
      expect(await app.barValues()).toEqual(array);

      const { final, observed } = await walkAndCompareWithEngine(app, 'binary-search', array, target);

      // ── independent oracle: a valid result ──
      const idx = foundIndices(final);
      if (array.includes(target)) {
        expect(final.outcome?.kind).toBe('found');
        expect(idx).toHaveLength(1);
        expect(isValidSearchAnswer(array, target, idx[0]), `index ${idx[0]} must hold ${target}`).toBe(true);
      } else {
        expect(final.outcome?.kind).toBe('not-found');
        expect(idx).toEqual([]);
        expect(isValidSearchAnswer(array, target, -1)).toBe(true);
        expect(final.bars.every(b => b.role === 'default')).toBe(true);
      }

      // ── independent oracle: the probes of the displayed algorithm (skipped when duplicates make several answers valid) ──
      if (!duplicates) {
        const probes = dedupe(observed.map(s => pointerAt(s, 'mid')).filter((m): m is number => m !== undefined));
        expect(probes, 'mid indices probed by the UI').toEqual(binarySearchProbes(array, target));
      }
    });
  }
});

test.describe('Binary Search — unsorted input is never sorted silently', () => {
  const UNSORTED = [5, 1, 4, 2];

  test('validation names the problem, offers "Sort a copy", keeps the typed text and the running trace', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    const before = await app.state();

    await app.type(UNSORTED, 4);
    await expect(app.inputError).toContainText('Binary Search needs an array sorted in ascending order');
    await expect(app.inputError).toContainText('index 0 (5) is greater than index 1 (1)');
    await expect(app.sortCopyButton).toBeVisible();
    await expect(app.visualizeButton).toBeDisabled();

    // nothing was applied or sorted: same trace, same bars, typed text untouched
    const after = await app.state();
    expect(after.bars.map(b => b.value)).toEqual(before.bars.map(b => b.value));
    expect(after.total).toBe(before.total);
    await expect(app.arrayInput).toHaveValue('5, 1, 4, 2');
  });

  test('"Sort a copy" sorts a COPY, uses the typed target, discloses the original order, and Restore returns it', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    await app.type(UNSORTED, 4);
    await app.sortCopyButton.click();

    await app.expectBars([1, 2, 4, 5]);
    await expect(app.arrayInput).toHaveValue('1, 2, 4, 5');
    await expect(app.targetInput).toHaveValue('4');
    await expect(app.inputNotice).toContainText('Sorted ascending because Binary Search requires it');
    await expect(app.inputNotice).toContainText('5, 1, 4, 2');
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 4');
    await app.expectTotal(engineSteps('binary-search', [1, 2, 4, 5], 4).length);

    const { final } = await walkAndCompareWithEngine(app, 'binary-search', [1, 2, 4, 5], 4);
    expect(final.outcome?.kind).toBe('found');
    expect(isValidSearchAnswer([1, 2, 4, 5], 4, foundIndices(final)[0])).toBe(true);

    await app.restoreButton.click();
    await expect(app.arrayInput).toHaveValue('5, 1, 4, 2');
    await expect(app.inputIssue).toBeVisible(); // the original is unsorted, so Binary Search again has no trace
    await expect(app.inputNotice).toHaveCount(0);
  });
});
