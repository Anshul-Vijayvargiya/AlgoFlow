import { describe, it, expect } from 'vitest';
import { removeDuplicatesSortedDefinition as rd } from '../algorithms/removeDuplicatesSorted';
import { buildExecution } from '../buildExecution';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { deriveOutcome, deriveStepVisuals } from '../../components/visualizer/barVisuals';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Remove Duplicates from Sorted Array, in place: slow ends the unique prefix, fast scans; a new value is written at
// ++slow; the answer is slow + 1.
const run = (nums: number[]) => rd.generateSteps([...nums]);
const result = (steps: ExecutionStep[]) => {
  const end = steps.at(-1)!;
  const k = end.variables!.unique as number;
  return { k, prefix: end.state.slice(0, k), array: end.state };
};
/** an oracle written differently from the generator: the distinct values of a sorted array, in order */
const distinct = (sorted: number[]) => [...new Set(sorted)];
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;

describe('Remove Duplicates — answers', () => {
  it.each([
    ['the example', [1, 1, 2, 2, 3], 3, [1, 2, 3]],
    ['empty', [], 0, []],
    ['one element', [7], 1, [7]],
    ['all duplicates', [4, 4, 4, 4], 1, [4]],
    ['all unique', [1, 2, 3, 4, 5], 5, [1, 2, 3, 4, 5]],
    ['negative numbers', [-5, -5, -1, 0, 0, 7], 4, [-5, -1, 0, 7]],
    ['repeated groups', [0, 0, 1, 1, 1, 2, 3, 3, 3, 3], 4, [0, 1, 2, 3]],
    ['the extremes', [-999, -999, 999, 999], 2, [-999, 999]],
  ])('%s', (_name, nums, k, prefix) => {
    expect(result(run(nums as number[]))).toMatchObject({ k, prefix });
  });

  it('agrees with an independent de-duplication on 3,000 random sorted arrays; the input array is not mutated', () => {
    const rng = makeRng(23);
    for (let t = 0; t < 3000; t++) {
      const spread = [1, 3, 9, 999][t % 4];
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * (2 * spread + 1)) - spread).sort((a, b) => a - b);
      const before = [...nums];
      const { k, prefix, array } = result(run(nums));
      expect(prefix, JSON.stringify(nums)).toEqual(distinct(nums));
      expect(k).toBe(distinct(nums).length);
      // in place: same length; whatever is left after the prefix is values of the input
      expect(array).toHaveLength(nums.length);
      for (const v of array.slice(k)) expect(nums).toContain(v);
      expect(nums).toEqual(before);
    }
  });
});

describe('Remove Duplicates — steps', () => {
  it('the example: empty check, slow = 0, then per fast: loop check, compare, and (new value) slow++ and the write', () => {
    expect(run([1, 1, 2, 2, 3]).map(s => s.codeRef)).toEqual([
      'fn-entry', 'check-empty', 'init-slow',
      'loop-condition', 'compare', // fast = 1: 1 == 1, skip
      'loop-condition', 'compare', 'increment-slow', 'write', // fast = 2: 2 → index 1
      'loop-condition', 'compare', // fast = 3: 2 == 2, skip
      'loop-condition', 'compare', 'increment-slow', 'write', // fast = 4: 3 → index 2
      'loop-condition', 'return', 'return',
    ]);
  });

  it('writes change the array in place, step by step', () => {
    const steps = run([1, 1, 2, 2, 3]);
    expect(steps.filter(s => s.codeRef === 'write').map(s => s.state)).toEqual([[1, 2, 2, 2, 3], [1, 2, 3, 2, 3]]);
    expect(steps.filter(s => s.codeRef === 'write').map(s => s.message)).toEqual(['nums[1] = nums[2] = 2', 'nums[2] = nums[4] = 3']);
    expect(steps.at(-1)!.state).toEqual([1, 2, 3, 2, 3]);
  });

  it('comparisons say whether nums[fast] is new or a skipped duplicate; the skipped count follows', () => {
    const steps = run([1, 1, 2, 2, 3]);
    const compares = steps.filter(s => s.codeRef === 'compare');
    expect(compares.map(s => [s.result, s.actionLabel])).toEqual([
      ['false', 'Duplicate — skip'], ['true', 'New value'], ['false', 'Duplicate — skip'], ['true', 'New value'],
    ]);
    expect(compares[0].explanation).toBe('1 is a duplicate of the last kept value: skip it (1 skipped so far).');
    expect(compares.map(s => card(s, 'skipped').value)).toEqual([1, 1, 2, 2]);
    expect(compares[0]).toMatchObject({ indices: [0, 1], pointers: { slow: 0, fast: 1 }, comparedValues: { val1: 1, val2: 1 } });
  });

  it('the unique prefix is "kept" and grows on each write; the leftover tail is dimmed at the end', () => {
    const steps = run([1, 1, 2, 2, 3]);
    expect(steps.find(s => s.codeRef === 'init-slow')!.keptIndices).toEqual([0]);
    // slow++ points at the free slot, which is not kept until the write
    expect(steps.filter(s => s.codeRef === 'increment-slow').map(s => s.keptIndices)).toEqual([[0], [0, 1]]);
    expect(steps.filter(s => s.codeRef === 'write').map(s => s.keptIndices)).toEqual([[0, 1], [0, 1, 2]]);
    const end = steps.at(-1)!;
    const bars = deriveStepVisuals(end, { positionPointers: rd.positionPointers, outcome: deriveOutcome(steps, steps.length - 1) }).bars;
    expect(bars.map(b => [b.role, b.inRange])).toEqual([['kept', true], ['kept', true], ['kept', true], ['default', false], ['default', false]]);
  });

  it('the cards: slow, fast, nums[slow], nums[fast], unique (slow + 1) and skipped, at every step', () => {
    const steps = run([1, 1, 2, 2, 3]);
    for (const s of steps) expect(s.tracker!.map(c => c.name)).toEqual(['slow', 'fast', 'nums[slow]', 'nums[fast]', 'unique', 'skipped']);
    const write = steps.find(s => s.codeRef === 'write')!;
    expect(card(write, 'unique')).toEqual({ name: 'unique', value: 2, role: 'changed' });
    expect(card(write, 'nums[slow]')).toMatchObject({ value: 2, role: 'changed' });
    expect(card(steps[0], 'slow').value).toBeNull();
  });

  it('the end: the outcome gives the count and the prefix; empty and all-unique arrays say so', () => {
    const steps = run([1, 1, 2, 2, 3]);
    expect(deriveOutcome(steps, steps.length - 1)).toBe('complete');
    expect(steps.at(-1)!.outcomeText).toBe('3 unique values: [1, 2, 3] (nums[0..2])');
    expect(steps.at(-2)!.explanation).toBe('3 unique values [1, 2, 3]; the 2 positions after the prefix are left over.');
    const empty = run([]);
    expect(empty.map(s => s.codeRef)).toEqual(['fn-entry', 'check-empty', 'return-empty', 'return-empty']);
    expect(empty.at(-1)!.outcomeText).toBe('0 unique values: the array is empty');
    expect(run([1, 2, 3]).at(-2)!.explanation).toBe('All 3 values were already distinct.');
    expect(run([7]).at(-1)!.outcomeText).toBe('1 unique value: [7] (nums[0..0])');
  });

  it('every step is numbered from 0', () => {
    run([1, 1, 2, 2, 3]).forEach((s, k) => expect(s.id).toBe(k));
  });
});

describe('Remove Duplicates — complexity', () => {
  it('O(n) time: at most 4 steps per element after the first, plus a constant; O(1) space: six tracked values', () => {
    for (const n of [0, 1, 2, 8, 16]) {
      for (const nums of [Array.from({ length: n }, (_, i) => i), Array(n).fill(3)]) {
        const steps = run(nums);
        expect(steps.length).toBeLessThanOrEqual(4 * Math.max(0, n - 1) + 6);
        expect(new Set(steps.flatMap(s => (s.tracker ?? []).map(c => c.name))).size).toBe(6);
      }
    }
    expect(rd.complexity).toMatchObject({ worst: 'O(n)', space: 'O(1)' });
  });
});

describe('Remove Duplicates — code lines in C, C++, Java and Python', () => {
  it('each step highlights its statement in every language', () => {
    const expected: Record<string, RegExp> = {
      'fn-entry': /remove_?duplicates\(/i,
      'check-empty': /^\s*if\b/,
      'return-empty': /return 0/,
      'init-slow': /slow = 0/,
      'loop-condition': /^\s*for\b/,
      compare: /nums\[fast\] != nums\[slow\]/,
      'increment-slow': /slow(\+\+| \+= 1)/,
      write: /nums\[slow\] = nums\[fast\]/,
      return: /return slow \+ 1/,
    };
    const refs = new Set([...run([1, 1, 2, 2, 3]), ...run([])].map(s => s.codeRef!));
    expect([...refs].sort()).toEqual(Object.keys(expected).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(rd, lang);
      for (const ref of refs) expect(lines[resolveCodeRef(rd, lang, ref)! - 1], `${lang} ${ref}`).toMatch(expected[ref]);
    }
  });
});

describe('Remove Duplicates — input', () => {
  it('requires ascending (non-decreasing) input; repeats are fine; an unsorted array can be sorted as a copy', () => {
    expect(validateAlgorithmInput(rd, [1, 1, 2, 2, 3], null).ok).toBe(true);
    expect(validateAlgorithmInput(rd, [], null).ok).toBe(true);
    expect(validateAlgorithmInput(rd, [3, 1, 2], null)).toEqual({
      ok: false,
      canSortCopy: true,
      message: 'Remove Duplicates from Sorted Array needs an array sorted in ascending order, but index 0 (3) is greater than index 1 (1).',
    });
    expect(validateDraft(rd, '3, 1, 2', '')).toMatchObject({ ok: false, field: 'order', canSortCopy: true });
  });

  it('Randomize draws from 1 to 9, so repeats are common', () => {
    expect(rd.inputSpec?.randomValues).toEqual([1, 9]);
  });

  it('a direct call with unsorted input traces what the listings do (adjacent duplicates only), never throws', () => {
    expect(result(run([2, 2, 1, 1, 2]))).toMatchObject({ k: 3, prefix: [2, 1, 2] });
    expect(buildExecution('remove-duplicates-sorted', [1, 1, 2, 2, 3]).status).toBe('ok');
  });
});
