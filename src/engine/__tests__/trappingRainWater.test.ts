import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { validateAlgorithmInput } from '../inputParsing';
import { def, makeRng } from './testUtils';

/**
 * Trapping Rain Water (LeetCode 42), run for real: the total against an independent reference (prefix / suffix
 * maxima), and every step against what the two-pointer code computes at that point — the pointers, the maxima, the
 * water decided above each bar and the running total.
 */
const d = def('trapping-rain-water');
const run = (height: number[]) => d.generateSteps([...height]);
const total = (height: number[]) => {
  const steps = run(height);
  return steps[steps.length - 1].variables!.water as number;
};

/** water above each bar: min(highest on the left including it, highest on the right including it) − height */
function reference(height: number[]): number[] {
  const n = height.length;
  const leftMax = height.map((_, i) => Math.max(...height.slice(0, i + 1)));
  const rightMax = height.map((_, i) => Math.max(...height.slice(i, n)));
  return height.map((h, i) => Math.min(leftMax[i], rightMax[i]) - h);
}
const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!.value;

describe('totals', () => {
  it('the LeetCode examples', () => {
    expect(total([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1])).toBe(6);
    expect(total([4, 2, 0, 3, 2, 5])).toBe(9);
  });

  it('empty and minimum-size inputs hold nothing', () => {
    expect(total([])).toBe(0);
    expect(total([5])).toBe(0);
    expect(total([3, 3])).toBe(0);
    expect(total([0, 7])).toBe(0);
  });

  it('flat, strictly increasing and strictly decreasing profiles hold nothing', () => {
    expect(total([2, 2, 2, 2, 2])).toBe(0);
    expect(total([0, 0, 0])).toBe(0);
    expect(total([1, 2, 3, 4, 5])).toBe(0);
    expect(total([5, 4, 3, 2, 1])).toBe(0);
    expect(total([1, 3, 5, 3, 1])).toBe(0); // a peak sheds water both ways
  });

  it('basins: one valley, several valleys, duplicate heights, and the limits', () => {
    expect(total([3, 0, 3])).toBe(3);
    expect(total([3, 0, 3, 0, 3])).toBe(6);
    expect(total([5, 0, 0, 0, 5])).toBe(15);
    expect(total([2, 0, 2, 0, 1])).toBe(3); // the right valley is limited by the last bar (1)
    expect(total([4, 1, 1, 0, 2, 3])).toBe(8);
    expect(total([999, 0, 999])).toBe(999);
    expect(total(Array.from({ length: 16 }, (_, i) => (i === 0 || i === 15 ? 999 : 0)))).toBe(999 * 14);
  });

  it('400 random arrays (including duplicates and zeros) agree with the prefix/suffix-maximum reference', () => {
    const rng = makeRng(42);
    for (let k = 0; k < 400; k++) {
      const n = Math.floor(rng() * 17);
      const height = Array.from({ length: n }, () => Math.floor(rng() * (rng() < 0.5 ? 5 : 50)));
      expect(total(height), JSON.stringify(height)).toBe(sum(reference(height)));
    }
  });
});

describe('every step shows what the code computes at that step', () => {
  const inputs = [
    [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1],
    [4, 2, 0, 3, 2, 5],
    [3, 0, 3, 0, 3],
    [2, 2, 2, 2],
    [5, 4, 3, 2, 1],
    [1, 2, 3, 4],
    [5],
    [],
    [0, 0, 7, 0, 0, 7, 0],
  ];

  it('pointers stay in bounds, only move inward, one per decision, and stop when they meet after n - 1 decisions', () => {
    for (const height of inputs) {
      const n = height.length;
      let left = 0;
      let right = n - 1;
      let moves = 0;
      for (const s of run(height)) {
        const p = s.pointers ?? {};
        if (p.left === undefined) continue;
        expect(p.left, JSON.stringify(height)).toBeGreaterThanOrEqual(left);
        expect(p.right, JSON.stringify(height)).toBeLessThanOrEqual(right);
        if (n > 0) {
          expect(p.left).toBeGreaterThanOrEqual(0);
          expect(p.right).toBeLessThan(n);
          expect(p.left).toBeLessThanOrEqual(p.right);
        }
        if (s.codeRef === 'move-left' || s.codeRef === 'move-right') moves++;
        left = p.left;
        right = p.right;
      }
      expect(moves, JSON.stringify(height)).toBe(Math.max(0, n - 1));
      if (n > 0) expect(left).toBe(right);
      const steps = run(height);
      expect(steps.at(-1)!.type).toBe('complete');
      expect(steps.at(-2)!.codeRef).toBe('loop');
      expect(steps.at(-2)!.result).toBe('false');
    }
  });

  it('the side with the lower bar is decided; leftMax / rightMax are the highest bars passed on each side', () => {
    for (const height of inputs) {
      let leftMax = 0;
      let rightMax = 0;
      for (const s of run(height)) {
        const v = s.variables as Record<string, number>;
        if (s.codeRef === 'compare-heights') {
          expect(s.result).toBe(height[v.left] < height[v.right] ? 'true' : 'false');
          expect([v['height[left]'], v['height[right]']]).toEqual([height[v.left], height[v.right]]);
        }
        if (s.codeRef === 'check-left-max') expect(s.result).toBe(height[v.left] >= leftMax ? 'true' : 'false');
        if (s.codeRef === 'check-right-max') expect(s.result).toBe(height[v.right] >= rightMax ? 'true' : 'false');
        if (s.codeRef === 'update-left-max') leftMax = v.leftMax;
        if (s.codeRef === 'update-right-max') rightMax = v.rightMax;
        if (card(s, 'leftMax') !== null) {
          expect(card(s, 'leftMax'), `${JSON.stringify(height)} step ${s.id}`).toBe(leftMax);
          expect(card(s, 'rightMax')).toBe(rightMax);
        }
      }
    }
  });

  it('each bar’s water is decided once, equals the reference, and the running total is the sum of the water drawn', () => {
    for (const height of inputs) {
      const expected = reference(height);
      const decided = new Set<number>();
      for (const s of run(height)) {
        const w = s.water!;
        expect(w.amounts, `${JSON.stringify(height)} step ${s.id}`).toHaveLength(height.length);
        // the total shown is exactly the water drawn above the bars
        if (card(s, 'water') !== null) expect(card(s, 'water')).toBe(sum(w.amounts));
        // water is only ever added, never changed: every amount drawn is that bar's final water
        w.amounts.forEach((a, i) => {
          if (a > 0) expect(a, `bar ${i}`).toBe(expected[i]);
        });
        if (s.codeRef?.startsWith('add-') || s.codeRef?.startsWith('update-')) {
          const i = w.current!;
          expect(decided.has(i), `bar ${i} decided twice`).toBe(false);
          decided.add(i);
          expect(card(s, 'trapped here')).toBe(expected[i]);
          if (s.codeRef.startsWith('add-')) expect(expected[i]).toBeGreaterThan(0);
          else expect(expected[i]).toBe(0);
        }
      }
      // every bar but the one where the pointers meet is decided (that one is the highest and holds nothing)
      expect(decided.size).toBe(Math.max(0, height.length - 1));
      const end = run(height).at(-1)!;
      expect(end.water!.amounts).toEqual(expected);
      expect(end.variables!.water).toBe(sum(expected));
      expect(end.outcomeText).toBe(`Trapped water: ${sum(expected)} unit${sum(expected) === 1 ? '' : 's'}`);
    }
  });
});

describe('input', () => {
  it('heights are whole numbers from 0 to 999, at most 16 of them; an empty array is allowed', () => {
    expect(validateAlgorithmInput(d, [0, 1, 0, 2], null).ok).toBe(true);
    expect(validateAlgorithmInput(d, [], null).ok).toBe(true);
    const negative = validateAlgorithmInput(d, [3, -1, 2], null);
    expect(negative).toMatchObject({ ok: false, message: 'Value 2 (-1) is below 0: Trapping Rain Water takes values from 0 to 999.' });
    expect(validateAlgorithmInput(d, Array(17).fill(1), null)).toMatchObject({ ok: false, message: 'Too many values (17). The visualizer supports at most 16.' });
    expect(() => run([3, -1, 2])).toThrow(RangeError);
    expect(() => run([1.5])).toThrow(RangeError);
  });

  it('the default input is the LeetCode example, and the complexity is O(n) time, O(1) space', () => {
    expect(d.defaultInput).toEqual([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]);
    expect(d.category).toBe('ARRAYS');
    expect(d.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
  });
});
