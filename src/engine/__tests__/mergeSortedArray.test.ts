import { describe, it, expect } from 'vitest';
import { mergeSortedArrayDefinition as msa } from '../algorithms/mergeSortedArray';
import { buildExecution } from '../buildExecution';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { deriveOutcome, deriveStepVisuals } from '../../components/visualizer/barVisuals';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Merge Sorted Array, in place from the back: i (nums1), j (nums2), k (slot); the larger value goes to nums1[k].
const run = (nums1: number[], nums2: number[]) => msa.generateSteps([...nums1], { second: [...nums2] });
const final = (steps: ExecutionStep[]) => steps.at(-1)!.state;
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;
const writes = (steps: ExecutionStep[]) =>
  steps.filter(s => s.codeRef === 'write-from-first' || s.codeRef === 'write-from-second').map(s => s.message);

describe('Merge Sorted Array — answers', () => {
  it.each([
    ['the example', [1, 2, 3], [2, 5, 6], [1, 2, 2, 3, 5, 6]],
    ['m = 0 (nums1 has only placeholders)', [], [1], [1]],
    ['n = 0 (nothing to merge)', [1], [], [1]],
    ['both empty', [], [], []],
    ['all of nums2 is smaller', [4, 5, 6], [1, 2, 3], [1, 2, 3, 4, 5, 6]],
    ['all of nums2 is larger', [1, 2, 3], [4, 5, 6], [1, 2, 3, 4, 5, 6]],
    ['duplicates within and across', [2, 2, 2], [2, 2], [2, 2, 2, 2, 2]],
    ['negative values', [-5, -1, 0], [-3, -3, 7], [-5, -3, -3, -1, 0, 7]],
    ['different lengths', [1, 3, 5, 7, 9, 11, 13], [2], [1, 2, 3, 5, 7, 9, 11, 13]],
    ['the extremes', [-999], [999], [-999, 999]],
  ])('%s', (_name, nums1, nums2, expected) => {
    expect(final(run(nums1 as number[], nums2 as number[]))).toEqual(expected);
  });

  it('agrees with sorting the two arrays together on 3,000 random pairs (any m, n up to 16 values)', () => {
    const rng = makeRng(29);
    const asc = (a: number[]) => [...a].sort((x, y) => x - y);
    for (let t = 0; t < 3000; t++) {
      const total = Math.floor(rng() * 17);
      const m = Math.floor(rng() * (total + 1));
      const spread = [2, 9, 999][t % 3];
      const draw = (len: number) => asc(Array.from({ length: len }, () => Math.floor(rng() * (2 * spread + 1)) - spread));
      const nums1 = draw(m);
      const nums2 = draw(total - m);
      expect(final(run(nums1, nums2)), JSON.stringify({ nums1, nums2 })).toEqual(asc([...nums1, ...nums2]));
    }
  });
});

describe('Merge Sorted Array — steps', () => {
  it('the example: init, then per value of nums2 merged: loop check, compare, write, pointer--, k--', () => {
    const steps = run([1, 2, 3], [2, 5, 6]);
    expect(steps.map(s => s.codeRef)).toEqual([
      'fn-entry', 'init-pointers',
      'loop-condition', 'compare', 'write-from-second', 'decrement-j', 'decrement-k', // 6
      'loop-condition', 'compare', 'write-from-second', 'decrement-j', 'decrement-k', // 5
      'loop-condition', 'compare', 'write-from-first', 'decrement-i', 'decrement-k', // 3 (from nums1)
      'loop-condition', 'compare', 'write-from-second', 'decrement-j', 'decrement-k', // 2 (tie: nums2's)
      'loop-condition', 'fn-entry',
    ]);
    expect(writes(steps)).toEqual(['nums1[5] = nums2[2] = 6', 'nums1[4] = nums2[1] = 5', 'nums1[3] = nums1[2] = 3', 'nums1[2] = nums2[0] = 2']);
    expect(steps[1].message).toBe('i = m - 1 = 2, j = n - 1 = 2, k = m + n - 1 = 5');
  });

  it('nums1 starts with its n placeholders (0) and is changed in place by each write', () => {
    const steps = run([1, 2, 3], [2, 5, 6]);
    expect(steps[0].state).toEqual([1, 2, 3, 0, 0, 0]);
    const w = steps.filter(s => s.codeRef?.startsWith('write'));
    expect(w.map(s => s.state)).toEqual([[1, 2, 3, 0, 0, 6], [1, 2, 3, 0, 5, 6], [1, 2, 3, 3, 5, 6], [1, 2, 2, 3, 5, 6]]);
  });

  it('comparisons: the larger value is taken; on a tie nums2’s; when i < 0 nums2 is taken without comparing', () => {
    const steps = run([1, 2, 3], [2, 5, 6]);
    const compares = steps.filter(s => s.codeRef === 'compare');
    expect(compares.map(s => [s.result, s.actionLabel])).toEqual([
      ['false', 'Take nums2[j]'], ['false', 'Take nums2[j]'], ['true', 'Take nums1[i]'], ['false', 'Take nums2[j]'],
    ]);
    expect(compares[0]).toMatchObject({ message: 'i >= 0 && nums1[i] > nums2[j]?  3 > 6 → false', comparedValues: { val1: 3, val2: 6 } });
    expect(compares[3].explanation).toBe("Equal values: nums2's 2 goes to slot 2 (either order gives the same array).");
    const exhausted = run([5], [1, 2]).filter(s => s.codeRef === 'compare').at(-1)!;
    expect(exhausted).toMatchObject({ message: 'i >= 0?  -1 >= 0 → false (nums1 has no values left)', result: 'false' });
  });

  it('the loop ends when nums2 is merged; nums1’s remaining values were never moved', () => {
    const steps = run([1, 2, 3], [4]);
    const last = steps.filter(s => s.codeRef === 'loop-condition').at(-1)!;
    expect(last).toMatchObject({ result: 'false', message: 'j >= 0?  -1 >= 0 → false' });
    expect(last.explanation).toBe('nums2 is fully merged. nums1[0..2] were never moved: they are the smallest values and already in place.');
    expect(writes(steps)).toEqual(['nums1[3] = nums2[0] = 4']);
  });

  it('the bars: i and k on nums1; the merged suffix is final (sorted); nothing is out of range; nums2 is the j row', () => {
    const steps = run([1, 2, 3], [2, 5, 6]);
    const k = steps.findIndex(s => s.codeRef === 'decrement-k');
    const s = steps[k]; // after 6 went to slot 5: i = 2, j = 1, k = 4
    expect(s.pointers).toEqual({ i: 2, k: 4 });
    expect(s.sortedIndices).toEqual([5]);
    expect(s.buffers).toEqual([{ name: 'nums2', label: 'nums2', cursorLabel: 'j', values: [2, 5, 6], cursor: 1 }]);
    const bars = deriveStepVisuals(s, { positionPointers: msa.positionPointers, outcome: null }).bars;
    expect(bars.map(b => b.role)).toEqual(['default', 'default', 'default', 'default', 'focus', 'sorted']);
    // no working range: the slot being written (k) is never outside the step's range
    expect(bars.every(b => b.inRange)).toBe(true);
    expect(s.extraInfo).toBeUndefined();
    expect(msa.positionPointers).toEqual(['i', 'k']);
  });

  it('the end: every slot final, no pointers left, and the outcome gives the merged array', () => {
    const steps = run([1, 2, 3], [2, 5, 6]);
    const end = steps.at(-1)!;
    expect(end).toMatchObject({ type: 'complete', sortedIndices: [0, 1, 2, 3, 4, 5], pointers: {}, outcomeText: 'Merged: [1, 2, 2, 3, 5, 6]' });
    expect(deriveOutcome(steps, steps.length - 1)).toBe('sorted');
  });

  it('the cards: i, j, k, nums1[i] and nums2[j] at every step ("—" before set or when exhausted)', () => {
    const steps = run([1, 2, 3], [2, 5, 6]);
    for (const s of steps) expect(s.tracker!.map(c => c.name)).toEqual(['i', 'j', 'k', 'nums1[i]', 'nums2[j]']);
    expect(card(steps[0], 'i').value).toBeNull();
    expect(card(steps[1], 'k')).toEqual({ name: 'k', value: 5, role: 'changed' });
    const end = steps.at(-2)!; // j = -1
    expect(card(end, 'j').value).toBe(-1);
    expect(card(end, 'nums2[j]').value).toBeNull();
  });

  it('m = 0, n = 0 and both empty: the right steps and no nums2 row when it is empty', () => {
    expect(run([], [1]).map(s => s.codeRef)).toEqual(['fn-entry', 'init-pointers', 'loop-condition', 'compare', 'write-from-second', 'decrement-j', 'decrement-k', 'loop-condition', 'fn-entry']);
    const noSecond = run([1], []);
    expect(noSecond.map(s => s.codeRef)).toEqual(['fn-entry', 'init-pointers', 'loop-condition', 'fn-entry']);
    expect(noSecond.every(s => (s.buffers ?? []).length === 0)).toBe(true);
    expect(noSecond[0].explanation).toBe('nums2 is empty: nums1 is already the merged array.');
    expect(final(run([], []))).toEqual([]);
  });

  it('every step is numbered from 0; the trace never reads outside nums1', () => {
    const steps = run([1, 3, 5], [2, 4, 6, 8]);
    steps.forEach((s, k) => {
      expect(s.id).toBe(k);
      expect(s.state).toHaveLength(7);
      for (const i of s.indices ?? []) expect(i >= 0 && i < 7, `${s.codeRef} ${i}`).toBe(true);
    });
  });
});

describe('Merge Sorted Array — complexity', () => {
  it('O(m + n) time: 4 steps plus exactly 5 per write, and at most m + n writes; O(1) space: five tracked values', () => {
    for (const [m, n] of [[0, 0], [5, 0], [0, 5], [8, 8], [1, 15]]) {
      const steps = run(Array.from({ length: m }, (_, i) => i * 2), Array.from({ length: n }, (_, i) => i * 2 + 1));
      const writeCount = writes(steps).length;
      expect(writeCount).toBeLessThanOrEqual(m + n);
      expect(steps.length).toBe(4 + 5 * writeCount);
      expect(new Set(steps.flatMap(s => (s.tracker ?? []).map(c => c.name))).size).toBe(5);
    }
    expect(msa.complexity).toMatchObject({ worst: 'O(m + n)', space: 'O(1)' });
  });
});

describe('Merge Sorted Array — code lines in C, C++, Java and Python', () => {
  it('each step highlights its statement in every language', () => {
    const expected: Record<string, RegExp> = {
      'fn-entry': /\bmerge\(/,
      'init-pointers': /m - 1.*n - 1.*m \+ n - 1/,
      'loop-condition': /while \(?j >= 0/,
      compare: /i >= 0 (&&|and) nums1\[i\] > nums2\[j\]/,
      'write-from-first': /nums1\[k\] = nums1\[i\]/,
      'decrement-i': /i(--| -= 1)/,
      'write-from-second': /nums1\[k\] = nums2\[j\]/,
      'decrement-j': /j(--| -= 1)/,
      'decrement-k': /k(--| -= 1)/,
    };
    const refs = new Set(run([1, 2, 3], [2, 5, 6]).map(s => s.codeRef!));
    expect([...refs].sort()).toEqual(Object.keys(expected).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(msa, lang);
      for (const ref of refs) expect(lines[resolveCodeRef(msa, lang, ref)! - 1], `${lang} ${ref}`).toMatch(expected[ref]);
    }
  });
});

describe('Merge Sorted Array — input', () => {
  it('both arrays must be sorted (each error names its array); together at most 16 values; either may be empty', () => {
    expect(validateAlgorithmInput(msa, [1, 2, 3], null, null, [2, 5, 6]).ok).toBe(true);
    expect(validateAlgorithmInput(msa, [], null, null, []).ok).toBe(true);
    expect(validateAlgorithmInput(msa, [3, 1], null, null, [2])).toEqual({
      ok: false, canSortCopy: true, message: 'Merge Sorted Array needs nums1 sorted in ascending order, but index 0 (3) is greater than index 1 (1).',
    });
    expect(validateAlgorithmInput(msa, [1, 3], null, null, [5, 2])).toEqual({
      ok: false, canSortCopy: true, field: 'second', message: 'Merge Sorted Array needs nums2 sorted in ascending order, but index 0 (5) is greater than index 1 (2).',
    });
    expect(validateAlgorithmInput(msa, Array(10).fill(1), null, null, Array(7).fill(2))).toMatchObject({
      ok: false, field: 'second', message: 'Too many values: nums1 and nums2 hold 17 together. The visualizer supports at most 16.',
    });
    expect(validateAlgorithmInput(msa, [1], null, null, null)).toMatchObject({ ok: false, field: 'second' });
  });

  it('typed text: each field is parsed and reported on its own; a valid draft carries both arrays', () => {
    expect(validateDraft(msa, '1, 2, 3', '', '2, 5, 6')).toEqual({ ok: true, array: [1, 2, 3], target: null, second: [2, 5, 6] });
    expect(validateDraft(msa, '', '', '')).toEqual({ ok: true, array: [], target: null, second: [] });
    expect(validateDraft(msa, '1, 2', '', '1, x')).toMatchObject({ ok: false, field: 'second', message: 'nums2: Value 2 ("x") is not a whole number.' });
    expect(validateDraft(msa, '1, 2', '', '9, 3')).toMatchObject({ ok: false, field: 'second', canSortCopy: true, array: [1, 2], second: [9, 3] });
    expect(validateDraft(msa, '2, 1', '', '3')).toMatchObject({ ok: false, field: 'order', canSortCopy: true });
  });

  it('other algorithms’ drafts keep their shape (no second array)', () => {
    expect(validateDraft({ name: 'Bubble Sort', inputSpec: undefined }, '4, 2', '')).toEqual({ ok: true, array: [4, 2], target: null });
  });

  it('a direct call: no nums2 uses the example; null is refused; the input is used as given', () => {
    expect(final(msa.generateSteps([1, 2, 3]))).toEqual([1, 2, 2, 3, 5, 6]);
    expect(() => msa.generateSteps([1], { second: null })).toThrow(TypeError);
    expect(buildExecution('merge-sorted-array', [1, 2, 3]).status).toBe('ok');
  });
});
