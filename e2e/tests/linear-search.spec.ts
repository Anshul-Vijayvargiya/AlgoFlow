import { test, expect } from '../fixtures';
import { walkAndCompareWithEngine } from '../support/walk';
import { linearSearchOracle } from '../support/oracles';
import { dedupe, foundIndices, pointerAt } from '../support/derive';

const LIN = [4, 2, 9, 7, 5, 1, 8];
const CASES: { name: string; array: number[]; target: number }[] = [
  { name: 'target at the first index', array: LIN, target: 4 },
  { name: 'target at a middle index', array: LIN, target: 7 },
  { name: 'target at the last index', array: LIN, target: 8 },
  { name: 'target absent', array: LIN, target: 3 },
  { name: 'empty array', array: [], target: 5 },
  { name: 'duplicates — first occurrence wins', array: [2, 2, 1, 2], target: 2 },
  { name: 'duplicates — target absent', array: [2, 2, 1, 2], target: 5 },
  { name: 'zero as target', array: [-3, 0, 5, -3], target: 0 },
  { name: 'negative target present (duplicated)', array: [-3, 0, 5, -3], target: -3 },
  { name: 'negative target absent', array: [-3, 0, 5, -3], target: -7 },
  { name: 'single element, present', array: [7], target: 7 },
  { name: 'single element, absent', array: [7], target: 8 },
];

test.describe('Linear Search — real UI journey', () => {
  for (const { name, array, target } of CASES) {
    test(name, async ({ app }) => {
      await app.selectAlgorithm('linear-search');
      await expect(app.targetInput, 'Linear Search has a target field').toBeVisible();

      await app.enterAndVisualize(array, target);

      // ── UI behaviour: the entered order and target are what is shown, nothing is sorted ──
      await expect(app.arrayInput).toHaveValue(array.join(', '));
      await expect(app.targetInput).toHaveValue(String(target));
      expect(await app.barValues(), 'bars show the entered order').toEqual(array);
      await expect(app.page.getByTestId('target-pill')).toHaveText(`target = ${target}`);

      // ── UI vs engine trace, every step ──
      const { final, observed } = await walkAndCompareWithEngine(app, 'linear-search', array, target);

      // ── independent oracle: which values were examined, in which order, and the result ──
      const oracle = linearSearchOracle(array, target);
      const examined = dedupe(
        observed
          .filter(s => s.comparing && s.comparing !== 'N/A')
          .map(s => `${pointerAt(s, 'i')}:${s.comparing}`)
      );
      expect(examined, 'indices/values examined (UI) vs an independent linear scan').toEqual(
        oracle.examined.map((v, i) => `${i}:${v} vs ${target}`)
      );

      if (oracle.index === -1) {
        expect(final.outcome?.kind).toBe('not-found');
        expect(final.bars.every(b => b.role === 'default'), 'no bar is green when the target is absent').toBe(true);
      } else {
        expect(final.outcome?.kind).toBe('found');
        expect(foundIndices(final), 'the first occurrence (Linear Search promises it) is the only MATCH').toEqual([oracle.index]);
        expect(array[foundIndices(final)[0]]).toBe(target);
      }

      // the user's array is still exactly what they typed
      await expect(app.arrayInput).toHaveValue(array.join(', '));
    });
  }
});
