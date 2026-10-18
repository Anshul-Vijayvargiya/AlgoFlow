import { test, expect } from '../fixtures';
import { engineSteps } from '../support/engineTrace';
import { isNonDecreasing, isPermutation, sortedAscending } from '../support/oracles';

/**
 * The user's array is never reordered unless they explicitly choose "Sort a copy".
 *
 * Reachability note: through the UI, an UNSORTED array can never reach the Binary Search / Two Pointer generators
 * (validation blocks it, and "Sort a copy" sorts before applying). Whether the generators themselves would sort is
 * therefore not observable here and is covered by unit tests (src/store/__tests__/inputFlow.test.ts). These tests
 * cover what IS reachable: the field, the bars, the validation state, the explicit sort and the restore.
 */
const UNSORTED: number[][] = [
  [5, 1, 4, 2],
  [3, -1, 3, 0], // duplicates + negatives
  [2, 1], // smallest unsorted case
  [9, 9, -9, 0, 9], // duplicates of the maximum
];

test.describe('unsorted input for algorithms that require sorted input @cross', () => {
  for (const id of ['binary-search', 'two-pointer'] as const) {
    for (const array of UNSORTED) {
      test(`${id}: [${array}] is rejected as typed, never applied or reordered, until "Sort a copy"`, async ({ app }) => {
        await app.selectAlgorithm(id);
        const before = await app.state();

        await app.type(array, 4);
        await expect(app.inputError).toHaveAttribute('data-field', 'order');
        await expect(app.inputError).toContainText('needs an array sorted in ascending order');
        await expect(app.visualizeButton).toBeDisabled();

        // Enter and the (disabled) button both leave everything as it was
        await app.arrayInput.press('Enter');
        await app.visualizeButton.click({ force: true }).catch(() => {}); // disabled: the click must have no effect
        const after = await app.state();
        expect(after.bars.map(b => b.value), 'the running trace is untouched').toEqual(before.bars.map(b => b.value));
        expect(after.total).toBe(before.total);
        await expect(app.arrayInput, 'the typed text is exactly as entered').toHaveValue(array.join(', '));

        // the explicit, disclosed sort
        await app.sortCopyButton.click();
        const sorted = sortedAscending(array);
        await app.expectBars(sorted);
        const shown = await app.barValues();
        expect(isNonDecreasing(shown)).toBe(true);
        expect(isPermutation(shown, array), 'nothing lost, nothing invented (duplicates kept)').toBe(true);
        await expect(app.inputNotice).toContainText(`Your original order: ${array.join(', ')}.`);

        // Restore brings back the exact original order, including duplicates and negatives
        await app.restoreButton.click();
        await expect(app.arrayInput).toHaveValue(array.join(', '));
        await expect(app.inputIssue).toBeVisible();
        await expect(app.bars).toHaveCount(0);
      });
    }
  }

  test('"Sort a copy" uses the target as it is in the field at the moment of clicking (edited after the error appeared)', async ({ app }) => {
    await app.selectAlgorithm('two-pointer');
    await app.type([8, 1, 6, 3, 4], 27);
    await expect(app.sortCopyButton).toBeVisible();
    await app.targetInput.fill('9'); // changed while the error is showing
    await expect(app.sortCopyButton).toBeVisible();
    await app.sortCopyButton.click();
    await app.expectBars([1, 3, 4, 6, 8]);
    await expect(app.page.getByTestId('target-pill')).toHaveText('target = 9');
    await app.expectTotal(engineSteps('two-pointer', [1, 3, 4, 6, 8], 9).length);
  });
});

test.describe('the original array survives algorithm switching @cross', () => {
  test('a custom unsorted array keeps its order through Bubble → Quick → Binary (blocked) → Two Pointer (blocked) → Linear → Merge', async ({ app }) => {
    const ORIGINAL = [7, -2, 7, 0, 3];
    const text = ORIGINAL.join(', ');
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize(ORIGINAL);

    for (const id of ['quick-sort', 'binary-search', 'two-pointer', 'linear-search', 'merge-sort'] as const) {
      await test.step(id, async () => {
        await app.selectAlgorithm(id);
        await expect(app.arrayInput).toHaveValue(text);
        if (id === 'binary-search' || id === 'two-pointer') {
          await expect(app.inputIssue, 'explicit state, not a sorted copy').toBeVisible();
          await expect(app.bars).toHaveCount(0);
          expect((await app.state()).activeLine, 'no stale highlighted code line').toBeNull();
        } else {
          await app.expectStep(1);
          expect(await app.barValues(), 'step 1 shows the user order').toEqual(ORIGINAL);
          await expect(app.inputIssue).toHaveCount(0);
        }
      });
    }
  });

  test('an invalid draft is discarded when switching algorithms: the new trace uses the last APPLIED array, no stale error', async ({ app }) => {
    await app.selectAlgorithm('bubble-sort');
    await app.enterAndVisualize([4, 3, 2]);
    await app.type('4, 3, x');
    await expect(app.inputError).toBeVisible();

    await app.selectAlgorithm('selection-sort');
    await expect(app.inputError).toHaveCount(0);
    await expect(app.arrayInput).toHaveValue('4, 3, 2');
    await app.expectStep(1);
    await app.expectTotal(engineSteps('selection-sort', [4, 3, 2]).length);
    expect(await app.barValues()).toEqual([4, 3, 2]);
  });

  test('after Sort a copy, switching to a sorting algorithm keeps the sorted copy (the user chose it), and Restore is no longer offered', async ({ app }) => {
    await app.selectAlgorithm('binary-search');
    await app.type([5, 1, 4, 2], 4);
    await app.sortCopyButton.click();
    await app.expectBars([1, 2, 4, 5]);
    await app.selectAlgorithm('insertion-sort');
    expect(await app.barValues()).toEqual([1, 2, 4, 5]);
    await expect(app.inputNotice).toHaveCount(0);
  });
});
