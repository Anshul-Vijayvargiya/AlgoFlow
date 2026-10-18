import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { LANGUAGES, EDGE_INPUTS, randomArrays, codeLines, def, sortedCopy } from './testUtils';
import { LINE_ANCHORS } from './lineAnchors';

const quick = def('quick-sort');
const trace = (input: number[]) => quick.generateSteps([...input]);

const INPUTS: [string, number[]][] = [
  ['empty', []],
  ['single', [7]],
  ['two sorted', [1, 2]],
  ['two reversed', [2, 1]],
  ['sorted', [1, 2, 3, 4, 5]],
  ['reverse-sorted', [5, 4, 3, 2, 1]],
  ['duplicates', [2, 2, 1, 2]],
  ['all equal', [3, 3, 3]],
  ['mixed', [5, 1, 4, 2, 3]],
  ['default input', [...quick.defaultInput]],
  ...randomArrays(60, 9, 3).map((a, i) => [`random #${i}`, a] as [string, number[]]),
];

/**
 * Walks the trace with an independent oracle of the displayed code (Lomuto partition,
 * last-element pivot, unconditional swaps). Every executed statement must be the next
 * step, with the right result, pointers, highlighted indices and array contents.
 * Returns summary counters for further assertions.
 */
function verifyAgainstOracle(input: number[]) {
  const steps = trace(input);
  const arr = [...input];
  let p = 0;
  const counts = { selfSwaps: 0, swaps: 0, partitions: 0, calls: 0 };
  const lockedAfter: number[] = [];

  const take = (ref: string, type?: ExecutionStep['type']): ExecutionStep => {
    const s = steps[p++];
    expect(s, `trace ended early; expected ${ref}`).toBeDefined();
    expect(s.codeRef, `step ${s.id} (${s.message})`).toBe(ref);
    if (type) expect(s.type, `step ${s.id} ${ref}`).toBe(type);
    expect(s.state, `step ${s.id} ${ref} (${s.message}): array`).toEqual(arr);
    return s;
  };

  function partition(low: number, high: number): number {
    counts.partitions++;
    const pivot = arr[high];
    const pick = take('pick-pivot', 'assign');
    expect(pick.variables!.pivot).toBe(pivot);
    expect(pick.indices).toEqual([high]);
    expect(pick.extraInfo!.pivotIndex).toBe(high);

    let i = low - 1;
    const init = take('init-i', 'assign');
    expect(init.variables!.i).toBe(i);
    expect(init.pointers!.i).toBe(i);

    for (let j = low; ; j++) {
      const cond = take('loop-j', 'loop-condition');
      expect(cond.result).toBe(j < high ? 'true' : 'false');
      expect(cond.variables!.j).toBe(j);
      expect(cond.pointers).toMatchObject({ i, j });
      if (!(j < high)) break;

      const le = arr[j] <= pivot;
      const cmp = take('compare-pivot', 'compare');
      expect(cmp.result).toBe(le ? 'true' : 'false');
      expect(cmp.comparedValues).toEqual({ val1: arr[j], val2: pivot });
      expect(cmp.indices).toEqual([j, high]);
      expect(cmp.state[j]).toBe(cmp.comparedValues!.val1);
      expect(cmp.state[high]).toBe(cmp.comparedValues!.val2);
      expect(cmp.pointers).toMatchObject({ i, j });

      if (le) {
        i++;
        const inc = take('inc-i', 'increment');
        expect(inc.pointers).toMatchObject({ i, j });
        expect(inc.variables!.i).toBe(i);
        // The displayed code swaps unconditionally, including when i === j.
        [arr[i], arr[j]] = [arr[j], arr[i]];
        const sw = take('swap-smaller', 'swap');
        expect(sw.indices).toEqual([i, j]);
        counts.swaps++;
        if (i === j) {
          counts.selfSwaps++;
          expect(sw.message).toMatch(/same position|unchanged/);
        }
      }
    }

    const pos = i + 1;
    [arr[pos], arr[high]] = [arr[high], arr[pos]];
    const place = take('place-pivot', 'swap');
    expect(place.indices).toEqual([pos, high]);
    expect(place.extraInfo!.pivotIndex).toBe(pos);
    expect(place.sortedIndices).toContain(pos);
    // Partition invariant right after the pivot swap.
    for (let t = low; t < pos; t++) expect(arr[t]).toBeLessThanOrEqual(pivot);
    for (let t = pos + 1; t <= high; t++) expect(arr[t]).toBeGreaterThan(pivot);
    lockedAfter.push(pos);

    const ret = take('return-pivot', 'return');
    expect(ret.variables!.returnVal).toBe(pos);
    expect(ret.indices).toEqual([pos]);
    return pos;
  }

  function quickSort(low: number, high: number) {
    counts.calls++;
    const check = take('range-check', 'condition');
    expect(check.result).toBe(low < high ? 'true' : 'false');
    expect(check.pointers).toEqual({ low, high });
    if (!(low < high)) return;

    const call = take('call-partition', 'loop-start');
    expect(call.pointers).toEqual({ low, high });
    const pi = partition(low, high);
    const assign = take('call-partition', 'assign');
    expect(assign.pointers!.pi).toBe(pi);
    expect(assign.variables!.pi).toBe(pi);

    const left = take('call-left', 'loop-start');
    expect(left.message).toContain(`${low}, ${pi - 1}`);
    quickSort(low, pi - 1);
    const right = take('call-right', 'loop-start');
    expect(right.message).toContain(`${pi + 1}, ${high}`);
    quickSort(pi + 1, high);
  }

  take('fn-entry', 'init');
  quickSort(0, input.length - 1);
  const done = take('fn-entry', 'complete');
  expect(p, 'trace has extra steps after completion').toBe(steps.length);
  expect(done.state).toEqual(sortedCopy(input));
  expect(done.sortedIndices).toEqual(Array.from({ length: input.length }, (_, i) => i));
  return { steps, counts, lockedAfter };
}

describe('Quick Sort trace — every executed statement, in order, with correct state', () => {
  for (const [name, input] of INPUTS) {
    it(`${name} ${JSON.stringify(input)}`, () => {
      verifyAgainstOracle(input);
    });
  }

  it('shows self-swaps when i === j (the displayed code swaps unconditionally)', () => {
    const { counts } = verifyAgainstOracle([1, 2, 3, 4, 5]);
    expect(counts.selfSwaps).toBeGreaterThan(0);
  });

  it('shows the pivot swap even when the pivot is already in place', () => {
    const steps = trace([1, 2, 3]);
    const place = steps.filter(s => s.codeRef === 'place-pivot');
    expect(place.length).toBeGreaterThan(0);
    expect(place.some(s => /unchanged/.test(s.message))).toBe(true);
  });

  it('every partition has exactly one pivot placement and one return; every compare is shown', () => {
    for (const [, input] of INPUTS) {
      const steps = trace(input);
      const partitions = steps.filter(s => s.codeRef === 'pick-pivot').length;
      expect(steps.filter(s => s.codeRef === 'place-pivot')).toHaveLength(partitions);
      expect(steps.filter(s => s.codeRef === 'return-pivot')).toHaveLength(partitions);
      // The number of partitions of a non-empty array equals the number of pivots locked by them.
      expect(steps.filter(s => s.codeRef === 'init-i')).toHaveLength(partitions);
    }
  });

  it('recursion is visible: call steps carry the call stack, which unwinds to empty at completion', () => {
    const steps = trace([3, 1, 4, 2]);
    expect(steps[0].variables!.stack).toBe('quickSort(0,3)');
    const calls = steps.filter(s => s.codeRef === 'call-left' || s.codeRef === 'call-right');
    expect(calls.length).toBeGreaterThan(0);
    const deepest = Math.max(...steps.map(s => String(s.variables!.stack).split(' › ').length));
    expect(deepest).toBeGreaterThan(2); // quickSort › partition, and nested quickSort frames
    expect(steps[steps.length - 1].variables!.stack).toBe('');
    // partition frames are only on the stack between call-partition and return-pivot
    for (const s of steps) {
      const inPartition = ['pick-pivot', 'init-i', 'loop-j', 'compare-pivot', 'inc-i', 'swap-smaller', 'place-pivot', 'return-pivot'].includes(s.codeRef!);
      expect(String(s.variables!.stack).includes('partition('), `${s.codeRef}`).toBe(inPartition);
    }
  });

  it('pointers agree with variables everywhere (fixes audit P2-1 for Quick Sort)', () => {
    for (const [, input] of INPUTS) {
      for (const s of trace(input)) {
        for (const [k, v] of Object.entries(s.pointers ?? {})) {
          if (s.variables && k in s.variables) expect(s.variables[k], `${s.codeRef} ${k}`).toBe(v);
        }
      }
    }
  });

  it('every step maps to a line whose text matches that operation in C, C++, Java and Python', () => {
    for (const [, input] of INPUTS.slice(0, 14)) {
      for (const s of trace(input)) {
        for (const lang of LANGUAGES) {
          const line = quick.lineMap[lang][s.codeRef!];
          const text = codeLines(quick, lang)[line - 1];
          expect(text, `${lang}/${s.codeRef}`).toMatch(LINE_ANCHORS['quick-sort'][s.codeRef!]);
        }
      }
    }
  });

  it('final array is sorted for 200 random inputs, in every language trace (traces are language-independent)', () => {
    for (const input of randomArrays(200, 10, 77)) {
      const steps = trace(input);
      expect(steps[steps.length - 1].state).toEqual(sortedCopy(input));
    }
    expect(EDGE_INPUTS.empty).toEqual([]);
  });
});
