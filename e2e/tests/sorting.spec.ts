import { test, expect } from '../fixtures';
import { walkAndCompareWithEngine } from '../support/walk';
import { isNonDecreasing, isPermutation, sortedAscending } from '../support/oracles';
import { SORT_IDS, ALGORITHMS } from '../support/engineTrace';

const CASES: { name: string; array: number[] }[] = [
  { name: 'already sorted', array: [1, 2, 3, 4] },
  { name: 'reverse sorted', array: [4, 3, 2, 1] },
  { name: 'duplicate values', array: [2, 2, 1, 2] },
  { name: 'negative values', array: [3, -1, -8, 0] },
  { name: 'single element', array: [7] },
  { name: 'empty array', array: [] },
];


for (const id of SORT_IDS) {
  test.describe(`${ALGORITHMS[id].label} — real UI journey`, () => {
    for (const { name, array } of CASES) {
      test(name, async ({ app }) => {
        await app.selectAlgorithm(id);
        await expect(app.targetInput, 'sorting algorithms take no target').toHaveCount(0);

        await app.enterAndVisualize(array);

        // UI behaviour: the entered order is what is shown first (nothing pre-sorted), and stays in the field
        expect(await app.barValues()).toEqual(array);
        await expect(app.arrayInput).toHaveValue(array.join(', '));

        // UI vs engine trace, every step
        const { final } = await walkAndCompareWithEngine(app, id, array, null);

        // independent oracle: the final bars are the input sorted ascending, and nothing was lost or invented
        const result = final.bars.map(b => b.value);
        expect(result).toEqual(sortedAscending(array));
        expect(isNonDecreasing(result)).toBe(true);
        expect(isPermutation(result, array)).toBe(true);
        expect(final.outcome?.kind).toBe(array.length ? 'sorted' : 'empty');
        if (array.length) expect(final.bars.every(b => b.role === 'sorted')).toBe(true);

        // the user's array stays available for editing in its ORIGINAL order
        await expect(app.arrayInput).toHaveValue(array.join(', '));
      });
    }
  });
}
