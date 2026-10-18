import { test, expect } from '../fixtures';
import { walkAndCompareWithEngine } from '../support/walk';
import { isNonDecreasing, isValidPair, pairExists } from '../support/oracles';
import { foundIndices } from '../support/derive';
import { engineSteps } from '../support/engineTrace';

const TP = [1, 3, 4, 6, 8];
const CASES: { name: string; array: number[]; target: number }[] = [
  { name: 'valid pair in the middle', array: TP, target: 10 },
  { name: 'valid pair using both ends', array: TP, target: 9 },
  { name: 'no valid pair', array: TP, target: 100 },
  { name: 'duplicate values pair with each other', array: [2, 2, 3, 5], target: 4 },
  { name: 'negative values', array: [-4, -1, 2, 6], target: 1 },
  { name: 'negative values, no pair', array: [-4, -1, 2, 6], target: 0 },
  { name: 'a single element cannot pair with itself', array: [3], target: 6 },
  { name: 'empty array', array: [], target: 0 },
];

test.describe('Two Pointer (pair with a given sum, ascending array) — real UI journey', () => {
  for (const { name, array, target } of CASES) {
    test(name, async ({ app }) => {
      expect(isNonDecreasing(array)).toBe(true);
      await app.selectAlgorithm('two-pointer');
      await expect(app.targetInput, 'the field is named "Target sum"').toHaveAccessibleName('Target sum');
      await app.enterAndVisualize(array, target);
      expect(await app.barValues()).toEqual(array);

      const { final } = await walkAndCompareWithEngine(app, 'two-pointer', array, target);

      // independent oracle: a pair exists iff brute force finds one, and the UI's pair is valid
      const idx = foundIndices(final);
      if (pairExists(array, target)) {
        expect(final.outcome?.kind).toBe('found');
        expect(idx).toHaveLength(2);
        expect(isValidPair(array, target, idx[0], idx[1]), `positions ${idx} must be distinct and sum to ${target}`).toBe(true);
      } else {
        expect(final.outcome?.kind).toBe('not-found');
        expect(idx).toEqual([]);
      }
    });
  }

  test('documents its requirement and meaning in the UI', async ({ app }) => {
    await app.selectAlgorithm('two-pointer');
    const hint = app.page.getByText(/must be sorted ascending/);
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Find two elements whose sum equals this');
  });
});

test.describe('Two Pointer — unsorted input and "Sort a copy"', () => {
  const ORIGINAL = [8, 1, 6, 3, 4];
  const SORTED = [1, 3, 4, 6, 8];
  const TYPED_TARGET = 10; // deliberately different from the default target (27)

  test('the sort action is available for unsorted input and Visualize is disabled until then', async ({ app }) => {
    await app.selectAlgorithm('two-pointer');
    await app.type(ORIGINAL, TYPED_TARGET);
    await expect(app.inputError).toContainText('Two Pointer Technique needs an array sorted in ascending order');
    await expect(app.sortCopyButton).toBeVisible();
    await expect(app.visualizeButton).toBeDisabled();
    await expect(app.arrayInput).toHaveValue('8, 1, 6, 3, 4'); // never changed silently
  });

  test('Sort a copy → ascending array, the TYPED target is used, the trace matches, Restore returns the original order', async ({ app }) => {
    await app.selectAlgorithm('two-pointer');
    await app.type(ORIGINAL, TYPED_TARGET);
    await app.sortCopyButton.click();

    // the resulting input is ascending (and is a permutation of what was typed)
    await app.expectBars(SORTED);
    await expect(app.arrayInput).toHaveValue('1, 3, 4, 6, 8');
    const shown = await app.barValues();
    expect(isNonDecreasing(shown)).toBe(true);
    expect([...shown].sort((a, b) => a - b)).toEqual([...ORIGINAL].sort((a, b) => a - b));

    // the target typed in the field (10) — not the previous/default one — is used
    await expect(app.targetInput).toHaveValue(String(TYPED_TARGET));
    await expect(app.page.getByTestId('target-pill')).toHaveText(`target = ${TYPED_TARGET}`);

    // disclosure of what happened
    await expect(app.inputNotice).toContainText('Sorted ascending because Two Pointer Technique requires it');
    await expect(app.inputNotice).toContainText('8, 1, 6, 3, 4');

    // the trace is the one for the sorted copy and that target
    await app.expectTotal(engineSteps('two-pointer', SORTED, TYPED_TARGET).length);
    const { final } = await walkAndCompareWithEngine(app, 'two-pointer', SORTED, TYPED_TARGET);
    const idx = foundIndices(final);
    expect(final.outcome?.kind).toBe('found');
    expect(isValidPair(SORTED, TYPED_TARGET, idx[0], idx[1])).toBe(true); // independent check

    // Restore returns the ORIGINAL order (and, being unsorted, Two Pointer again has no trace)
    await app.restoreButton.click();
    await expect(app.arrayInput).toHaveValue('8, 1, 6, 3, 4');
    await expect(app.inputIssue).toBeVisible();
    await expect(app.inputNotice).toHaveCount(0);
    await expect(app.bars).toHaveCount(0);
  });
});
