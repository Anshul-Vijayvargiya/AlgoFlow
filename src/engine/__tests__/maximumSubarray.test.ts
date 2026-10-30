import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';
import { getAlgorithmDefinition } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { def, makeRng } from './testUtils';

/**
 * Maximum Subarray (Kadane's algorithm), run for real: the answer (sum and subarray) against a brute force over every
 * subarray, and every step against what the code holds at that point. Ties are reported as the code reports them: the
 * first best subarray found (a new run starts only when strictly better, the best only changes on a strictly larger sum).
 */
const d = def('maximum-subarray');
const run = (nums: number[]) => d.generateSteps([...nums]);
const answer = (nums: number[]) => {
  const v = run(nums).at(-1)!.variables!;
  const found = run(nums).at(-2)!.variables!;
  return { maxSum: v.maxSum as number, bestStart: found.bestStart as number, bestEnd: found.bestEnd as number };
};
const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);

/** the largest sum of any non-empty contiguous subarray, by trying them all */
function bruteForce(nums: number[]): number {
  let best = -Infinity;
  for (let a = 0; a < nums.length; a++) for (let b = a; b < nums.length; b++) best = Math.max(best, sum(nums.slice(a, b + 1)));
  return best;
}

const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!.value;

describe('answers', () => {
  it('the LeetCode example: sum 6 from [4, -1, 2, 1]', () => {
    const nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4];
    expect(answer(nums)).toEqual({ maxSum: 6, bestStart: 3, bestEnd: 6 });
    expect(nums.slice(3, 7)).toEqual([4, -1, 2, 1]);
    expect(run(nums).at(-1)!.outcomeText).toBe('Max sum 6: nums[3..6] = [4, -1, 2, 1]');
  });

  it('all negative: the largest single value (never 0)', () => {
    expect(answer([-8, -3, -6, -2, -5, -4])).toEqual({ maxSum: -2, bestStart: 3, bestEnd: 3 });
    expect(answer([-1])).toEqual({ maxSum: -1, bestStart: 0, bestEnd: 0 });
    expect(answer([-5, -5, -5])).toEqual({ maxSum: -5, bestStart: 0, bestEnd: 0 }); // the first of equal values
  });

  it('a single element', () => {
    expect(answer([7])).toEqual({ maxSum: 7, bestStart: 0, bestEnd: 0 });
    expect(answer([0])).toEqual({ maxSum: 0, bestStart: 0, bestEnd: 0 });
  });

  it('all zeros: 0, from the first element', () => {
    expect(answer([0, 0, 0, 0])).toEqual({ maxSum: 0, bestStart: 0, bestEnd: 0 });
  });

  it('the best subarray starts at the first element, or ends at the last', () => {
    expect(answer([5, 4, -1, 7, -20, 3])).toEqual({ maxSum: 15, bestStart: 0, bestEnd: 3 });
    expect(answer([-3, -1, 2, -1, 4, 5])).toEqual({ maxSum: 10, bestStart: 2, bestEnd: 5 });
    expect(answer([5, 4, -1, 7, 8])).toEqual({ maxSum: 23, bestStart: 0, bestEnd: 4 }); // the whole array
  });

  it('zeros, repeated values and mixed signs', () => {
    expect(answer([0, -1, 0, 2, 0, -3, 2, 2])).toEqual({ maxSum: 4, bestStart: 6, bestEnd: 7 });
    expect(answer([2, 2, -5, 2, 2])).toEqual({ maxSum: 4, bestStart: 0, bestEnd: 1 }); // equal later run: the first stays
    expect(answer([1, -1, 1, -1, 1])).toEqual({ maxSum: 1, bestStart: 0, bestEnd: 0 });
  });

  it('500 random arrays (1 to 16 values from -20 to 20) agree with the brute force, and the reported subarray has that sum', () => {
    const rng = makeRng(53);
    for (let k = 0; k < 500; k++) {
      const n = 1 + Math.floor(rng() * 16);
      const nums = Array.from({ length: n }, () => Math.floor(rng() * 41) - 20);
      const a = answer(nums);
      expect(a.maxSum, JSON.stringify(nums)).toBe(bruteForce(nums));
      expect(sum(nums.slice(a.bestStart, a.bestEnd + 1)), JSON.stringify(nums)).toBe(a.maxSum);
      expect(a.bestStart <= a.bestEnd && a.bestEnd < n).toBe(true);
    }
  });

  it('the input is never changed', () => {
    const nums = [3, -4, 5, -1];
    const copy = [...nums];
    for (const s of d.generateSteps(nums)) expect(s.state).toEqual(copy);
    expect(nums).toEqual(copy);
  });
});

describe('every step follows the code', () => {
  const inputs = [[-2, 1, -3, 4, -1, 2, 1, -5, 4], [-8, -3, -6, -2, -5, -4], [7], [0, 0, 0], [5, 4, -1, 7, -20, 3], [-3, -1, 2, -1, 4, 5], [2, 2, -5, 2, 2]];

  it('currentSum is the sum of nums[start..i], maxSum the sum of nums[bestStart..bestEnd], and maxSum never falls', () => {
    for (const nums of inputs) {
      let lastMax = -Infinity;
      for (const s of run(nums)) {
        const where = `${JSON.stringify(nums)} step ${s.id} (${s.codeRef})`;
        const cur = card(s, 'currentSum') as number | null;
        const max = card(s, 'maxSum') as number | null;
        const start = card(s, 'start') as number | null;
        const bs = card(s, 'bestStart') as number | null;
        const be = card(s, 'bestEnd') as number | null;
        if (max !== null && bs !== null && be !== null) {
          expect(sum(nums.slice(bs, be + 1)), where).toBe(max);
          expect(max, where).toBeGreaterThanOrEqual(lastMax);
          lastMax = max;
        }
        // after a run is started or extended, the current run ends at i
        if ((s.codeRef === 'start-new' || s.codeRef === 'extend' || s.codeRef === 'check-max') && cur !== null && start !== null) {
          const i = s.pointers!.i;
          expect(sum(nums.slice(start, i + 1)), where).toBe(cur);
          expect(s.extraInfo!.subRange, where).toEqual([start, i]);
        }
      }
    }
  });

  it('the decision is the code’s: start over exactly when currentSum + nums[i] < nums[i] (the run so far is negative)', () => {
    for (const nums of inputs) {
      const steps = run(nums);
      for (const [k, s] of steps.entries()) {
        if (s.codeRef !== 'compare') continue;
        const v = s.variables as Record<string, number>;
        expect(v['currentSum + nums[i]']).toBe(v.currentSum + nums[v.i]);
        expect(s.result).toBe(v.currentSum + nums[v.i] < nums[v.i] ? 'true' : 'false');
        expect(steps[k + 1].codeRef).toBe(s.result === 'true' ? 'start-new' : 'extend');
      }
    }
  });

  it('pointers stay in bounds (i may be n only when the loop ends); one pass; the run ends with found then complete', () => {
    for (const nums of inputs) {
      const steps = run(nums);
      const n = nums.length;
      for (const s of steps) {
        const p = s.pointers ?? {};
        if (p.start !== undefined) expect(p.start >= 0 && p.start <= (p.i ?? p.start)).toBe(true);
        if (p.i !== undefined) expect(p.i < n || (s.codeRef === 'loop' && s.result === 'false')).toBe(true);
        for (const i of s.indices ?? []) expect(i >= 0 && i < n).toBe(true);
      }
      expect(steps.filter(s => s.codeRef === 'compare')).toHaveLength(n - 1);
      expect(steps.filter(s => s.codeRef === 'loop' && s.result === 'false')).toHaveLength(1);
      const [found, complete] = steps.slice(-2);
      expect([found.type, complete.type]).toEqual(['found', 'complete']);
      const { bestStart, bestEnd } = found.variables as Record<string, number>;
      expect(found.sortedIndices).toEqual(Array.from({ length: bestEnd - bestStart + 1 }, (_, k) => bestStart + k));
      expect(complete.pointers).toBeUndefined();
      for (const s of steps) expect(`${s.message} ${s.explanation}`).not.toMatch(/undefined|NaN/);
    }
  });

  it('an all-negative array says why the answer is a single value', () => {
    expect(run([-8, -3, -6, -2, -5, -4]).at(-2)!.explanation).toMatch(/Every value is negative/);
  });
});

describe('input and integration', () => {
  it('non-empty; negatives allowed; at most 16 values; nothing is sorted or required to be', () => {
    expect(validateAlgorithmInput(d, [-2, 1, -3], null).ok).toBe(true);
    expect(validateAlgorithmInput(d, [-999, 999], null).ok).toBe(true);
    expect(validateAlgorithmInput(d, [], null)).toMatchObject({ ok: false, message: 'Maximum Subarray needs at least 1 values; the array is empty.' });
    expect(validateAlgorithmInput(d, Array(17).fill(1), null).ok).toBe(false);
    expect(d.inputSpec?.sortedRequired).toBeUndefined();
    expect(() => run([])).toThrow(RangeError);
  });

  it('Randomize draws from -20 to 20, so runs are both extended and restarted', () => {
    expect(d.inputSpec?.randomValues).toEqual([-20, 20]);
  });

  it('registered once, listed in ARRAYS, with the default example and O(n) / O(1)', () => {
    expect(getAlgorithmDefinition('maximum-subarray')).toBe(d);
    expect(ALGORITHM_NAV.filter(a => a.id === 'maximum-subarray')).toEqual([
      expect.objectContaining({ name: 'Maximum Subarray', category: 'ARRAYS', implemented: true }),
    ]);
    expect(d.defaultInput).toEqual([-2, 1, -3, 4, -1, 2, 1, -5, 4]);
    expect(d.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
  });
});
