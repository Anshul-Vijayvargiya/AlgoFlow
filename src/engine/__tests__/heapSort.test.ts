import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { resolveCodeRange, resolveCodeRef } from '../AlgorithmRegistry';
import { LANGUAGES, EDGE_INPUTS, codeLines, def, makeRng, sortedCopy } from './testUtils';
import { LINE_ANCHORS } from './lineAnchors';

const heap = def('heap-sort');
const trace = (input: number[]) => heap.generateSteps([...input]);

/** Inputs with negatives as well as positives (the shared randomArrays helper only produces 1..30). */
function mixedArrays(count: number, seed: number): number[][] {
  const rnd = makeRng(seed);
  return Array.from({ length: count }, () => Array.from({ length: Math.floor(rnd() * 17) }, () => Math.floor(rnd() * 41) - 20));
}

const INPUTS: [string, number[]][] = [
  ['empty', []],
  ['single', [7]],
  ['two sorted', [1, 2]],
  ['two reversed', [2, 1]],
  ['sorted', [1, 2, 3, 4, 5, 6]],
  ['reverse-sorted', [6, 5, 4, 3, 2, 1]],
  ['duplicates', [2, 2, 1, 2, 3, 3]],
  ['all equal', [5, 5, 5, 5]],
  ['negatives', [-3, -1, -7, -2]],
  ['mixed', [0, -5, 9, -1, 3, 0, 4]],
  ['default input', [...heap.defaultInput]],
  ...Object.entries(EDGE_INPUTS),
  ...mixedArrays(200, 77).map((a, i) => [`random #${i}`, a] as [string, number[]]),
];

const isMaxHeap = (a: number[], size: number) => {
  for (let k = 0; k < size; k++) {
    for (const c of [2 * k + 1, 2 * k + 2]) if (c < size && a[c] > a[k]) return false;
  }
  return true;
};

/**
 * Walks the trace with an independent model of the displayed code. Every executed statement must be the next step,
 * with the right type, condition result, pointers, array, heap boundary (extraInfo.subRange) and call stack.
 */
function verifyAgainstOracle(input: number[]) {
  const steps = trace(input);
  const arr = [...input];
  const n = arr.length;
  const stack: string[] = ['heapSort'];
  let p = 0;
  const counts = { heapifyCalls: 0, recursions: 0, swaps: 0, maxDepth: 1, missingChildChecks: 0 };

  const take = (ref: string | undefined, type: ExecutionStep['type'], heapSize?: number): ExecutionStep => {
    const s = steps[p++];
    const where = `${JSON.stringify(input)} step ${p - 1}`;
    expect(s, `${where}: trace ended early; expected ${ref}`).toBeDefined();
    expect(s.codeRef, `${where} (${s.message})`).toBe(ref);
    expect(s.type, `${where} ${ref}`).toBe(type);
    expect(s.state, `${where} ${ref} (${s.message}): array`).toEqual(arr);
    expect(s.variables?.stack, `${where} ${ref}: stack`).toBe(stack.join(' › '));
    if (heapSize !== undefined) expect(s.extraInfo?.subRange, `${where} ${ref}: heap boundary`).toEqual(heapSize > 0 ? [0, heapSize - 1] : undefined);
    for (const i of s.indices ?? []) expect(i >= 0 && i < n, `${where} ${ref}: index ${i} in bounds`).toBe(true);
    return s;
  };

  function heapify(size: number, i: number) {
    counts.heapifyCalls++;
    counts.maxDepth = Math.max(counts.maxDepth, stack.length);
    let largest = i;
    expect(take('set-largest', 'assign', size).variables).toMatchObject({ n: size, i, largest: i });
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    expect(take('set-left', 'assign', size).variables).toMatchObject({ i, l });
    expect(take('set-right', 'assign', size).variables).toMatchObject({ i, l, r });

    for (const [c, name, check, assign] of [[l, 'l', 'check-left', 'take-left'], [r, 'r', 'check-right', 'take-right']] as const) {
      const exists = c < size;
      const greater = exists && arr[c] > arr[largest];
      const s = take(check, 'condition', size);
      expect(s.result, `${check} (${s.message})`).toBe(String(greater));
      if (exists) {
        expect(s.comparedValues).toEqual({ val1: arr[c], val2: arr[largest] });
        expect(s.indices).toEqual([c, largest]);
        expect(s.pointers?.[name]).toBe(c);
      } else {
        // short-circuit: the missing child is never read, so nothing is compared or highlighted
        counts.missingChildChecks++;
        expect(s.comparedValues).toBeUndefined();
        expect(s.indices).toEqual([largest]);
        expect(s.pointers && name in s.pointers).toBe(false);
        expect(Object.keys(s.variables ?? {})).not.toContain(`arr[${name}]`);
        expect(s.message).toMatch(/no (left|right) child/);
      }
      if (greater) {
        largest = c;
        expect(take(assign, 'assign', size).variables).toMatchObject({ largest: c });
      }
    }

    const needsSwap = largest !== i;
    expect(take('check-swap', 'condition', size).result).toBe(String(needsSwap));
    if (!needsSwap) return;
    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    counts.swaps++;
    expect(take('do-swap', 'swap', size).indices).toEqual([i, largest]);
    take('call-recurse', 'loop-start', size);
    counts.recursions++;
    stack.push(`heapify(${size},${largest})`);
    heapify(size, largest);
    stack.pop();
  }

  take('init-n', 'init');

  // build
  for (let i = Math.floor(n / 2) - 1; ; i--) {
    const go = i >= 0;
    const cond = take('build-loop', 'loop-condition', n);
    expect(cond.result).toBe(String(go));
    expect(cond.variables).toMatchObject({ i });
    if (!go) break;
    take('call-build', 'loop-start', n);
    stack.push(`heapify(${n},${i})`);
    heapify(n, i);
    stack.pop();
    expect(take('build-loop', 'decrement', n).variables).toMatchObject({ i: i - 1 });
  }
  expect(isMaxHeap(arr, n), `${JSON.stringify(input)}: max-heap after construction ${JSON.stringify(arr)}`).toBe(true);

  // extract
  const locked: number[] = [];
  for (let i = n - 1; ; i--) {
    const go = i > 0;
    const cond = take('extract-loop', 'loop-condition', go ? i + 1 : 0);
    expect(cond.result).toBe(String(go));
    expect(cond.variables).toMatchObject({ i });
    if (!go) break;
    const max = arr[0];
    [arr[0], arr[i]] = [arr[i], arr[0]];
    expect(take('extract-swap', 'swap', i + 1).indices).toEqual([0, i]);
    expect(arr[i], 'the extracted value is the maximum of the heap').toBe(max);
    locked.push(i);
    const lockStep = take(undefined, 'sorted', i);
    expect(lockStep.indices).toEqual([i]);
    expect(lockStep.sortedIndices).toEqual(locked);
    take('call-extract', 'loop-start', i);
    stack.push(`heapify(${i},0)`);
    heapify(i, 0);
    stack.pop();
    expect(isMaxHeap(arr, i), `${JSON.stringify(input)}: heap [0..${i - 1}] after extraction`).toBe(true);
    expect(take('extract-loop', 'decrement', i).variables).toMatchObject({ i: i - 1 });
  }

  stack.pop();
  const done = take('fn-exit', 'complete');
  expect(done.sortedIndices).toEqual(Array.from({ length: n }, (_, k) => k));
  expect(done.variables!.stack).toBe('');
  expect(p, `${JSON.stringify(input)}: extra steps after complete`).toBe(steps.length);
  return { steps, final: arr, counts };
}

describe('Heap Sort trace — every executed statement, in order, with correct state', () => {
  for (const [name, input] of INPUTS) {
    it(`${name} ${JSON.stringify(input)}`, () => {
      const { final } = verifyAgainstOracle(input);
      // trusted oracle: the engine's own numeric sort
      expect(final).toEqual(sortedCopy(input));
    });
  }

  it('never mutates the caller input', () => {
    for (const [, input] of INPUTS) {
      const copy = [...input];
      heap.generateSteps(input);
      expect(input).toEqual(copy);
    }
  });

  it('empty and single-element arrays: both loops are checked once and fail, nothing else runs', () => {
    for (const input of [[], [7]]) {
      const steps = trace(input);
      expect(steps.map(s => `${s.codeRef}${s.result ? ':' + s.result : ''}`)).toEqual(['init-n', 'build-loop:false', 'extract-loop:false', 'fn-exit']);
      expect(steps[1].variables!.i).toBe(-1);
      expect(steps[2].variables!.i).toBe(input.length - 1);
      for (const s of steps) {
        expect(`${s.message} ${s.explanation ?? ''}`).not.toMatch(/undefined|NaN/);
        expect(s.indices ?? []).toEqual([]);
      }
    }
  });
});

describe('Heap Sort semantics', () => {
  it('sortedIndices grows n-1, n-2, …, 1 (each a final position), then complete marks every index', () => {
    const steps = trace([4, 10, 3, 5, 1, 8, 9]);
    const seq: number[][] = [];
    for (const s of steps) if (JSON.stringify(seq.at(-1)) !== JSON.stringify(s.sortedIndices ?? [])) seq.push(s.sortedIndices ?? []);
    expect(seq).toEqual([[], [6], [6, 5], [6, 5, 4], [6, 5, 4, 3], [6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 1], [0, 1, 2, 3, 4, 5, 6]]);
    const final = steps[steps.length - 1].state;
    for (const s of steps) for (const i of s.sortedIndices ?? []) expect(s.state[i]).toBe(final[i]);
  });

  it('"locked" steps carry no codeRef (no statement runs) and follow the extraction swap', () => {
    const steps = trace([4, 10, 3, 5, 1, 8, 9]);
    steps.forEach((s, k) => {
      if (s.type !== 'sorted') return;
      expect(s.codeRef).toBeUndefined();
      expect(steps[k - 1].codeRef).toBe('extract-swap');
      for (const lang of LANGUAGES) expect(resolveCodeRef(heap, lang, s.codeRef)).toBeNull();
    });
  });

  it('the heap boundary shrinks by one after every extraction', () => {
    const steps = trace([4, 10, 3, 5, 1, 8, 9]);
    const calls = steps.filter(s => s.codeRef === 'call-extract').map(s => s.extraInfo?.subRange);
    expect(calls).toEqual([[0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0]]);
  });

  it('recursion: deep sift-downs push frames and the stack unwinds to empty', () => {
    const { steps, counts } = verifyAgainstOracle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(counts.recursions).toBeGreaterThan(5);
    const deepest = Math.max(...steps.map(s => String(s.variables!.stack).split(' › ').length));
    expect(deepest).toBeGreaterThanOrEqual(4); // heapSort › heapify › heapify › heapify
    expect(steps[steps.length - 1].variables!.stack).toBe('');
    // every call step is immediately followed by the callee's first statement (largest = i)
    steps.forEach((s, k) => {
      if (s.codeRef?.startsWith('call-')) expect(steps[k + 1].codeRef).toBe('set-largest');
    });
  });

  it('missing children are short-circuited, never compared (default input exercises it)', () => {
    const { counts } = verifyAgainstOracle([4, 10, 3, 5, 1, 8, 9]);
    expect(counts.missingChildChecks).toBeGreaterThan(0);
  });

  it('child pointers are drawn only inside the heap; past it the bars belong to the sorted part', () => {
    for (const [, input] of INPUTS) {
      for (const s of trace(input)) {
        const size = s.extraInfo?.subRange ? s.extraInfo.subRange[1] + 1 : input.length;
        for (const name of ['l', 'r'] as const) if (s.pointers && name in s.pointers) expect(s.pointers[name]).toBeLessThan(size);
      }
    }
  });

  it('representative step counts', () => {
    const count = (a: number[]) => trace(a).length;
    expect(count([])).toBe(4);
    expect(count([7])).toBe(4);
    expect(count([2, 1])).toBe(24);
    expect(count([1, 2])).toBe(33);
    expect(count([1, 2, 3, 4])).toBe(101);
    expect(count([4, 3, 2, 1])).toBe(64);
    expect(count([3, 3, 3])).toBe(35);
    expect(count([4, 10, 3, 5, 1, 8, 9])).toBe(181);
    expect(count(Array.from({ length: 16 }, (_, i) => 16 - i))).toBe(492);
  });
});

describe('Heap Sort code lines — every codeRef highlights its statement in all four languages', () => {
  const EXPECTED: Record<string, Record<(typeof LANGUAGES)[number], string>> = {
    'init-n': { c: 'void heapSort(int arr[], int n) {', cpp: 'int n = arr.size();', java: 'int n = arr.length;', python: 'n = len(arr)' },
    'fn-exit': { c: 'void heapSort(int arr[], int n) {', cpp: 'void heapSort(vector<int>& arr) {', java: 'public static void heapSort(int[] arr) {', python: 'return arr' },
    'build-loop': { c: 'for (int i = n / 2 - 1; i >= 0; i--)', cpp: 'for (int i = n / 2 - 1; i >= 0; i--)', java: 'for (int i = n / 2 - 1; i >= 0; i--)', python: 'for i in range(n // 2 - 1, -1, -1):' },
    'call-build': { c: 'heapify(arr, n, i);', cpp: 'heapify(arr, n, i);', java: 'heapify(arr, n, i);', python: 'heapify(arr, n, i)' },
    'extract-loop': { c: 'for (int i = n - 1; i > 0; i--) {', cpp: 'for (int i = n - 1; i > 0; i--) {', java: 'for (int i = n - 1; i > 0; i--) {', python: 'for i in range(n - 1, 0, -1):' },
    'extract-swap': { c: 'int temp = arr[0];', cpp: 'swap(arr[0], arr[i]);', java: 'int temp = arr[0];', python: 'arr[0], arr[i] = arr[i], arr[0]' },
    'call-extract': { c: 'heapify(arr, i, 0);', cpp: 'heapify(arr, i, 0);', java: 'heapify(arr, i, 0);', python: 'heapify(arr, i, 0)' },
    'set-largest': { c: 'int largest = i;', cpp: 'int largest = i;', java: 'int largest = i;', python: 'largest = i' },
    'set-left': { c: 'int l = 2 * i + 1;', cpp: 'int l = 2 * i + 1;', java: 'int l = 2 * i + 1;', python: 'l = 2 * i + 1' },
    'set-right': { c: 'int r = 2 * i + 2;', cpp: 'int r = 2 * i + 2;', java: 'int r = 2 * i + 2;', python: 'r = 2 * i + 2' },
    'check-left': { c: 'if (l < n && arr[l] > arr[largest]) largest = l;', cpp: 'if (l < n && arr[l] > arr[largest]) largest = l;', java: 'if (l < n && arr[l] > arr[largest]) largest = l;', python: 'if l < n and arr[l] > arr[largest]:' },
    'take-left': { c: 'if (l < n && arr[l] > arr[largest]) largest = l;', cpp: 'if (l < n && arr[l] > arr[largest]) largest = l;', java: 'if (l < n && arr[l] > arr[largest]) largest = l;', python: 'largest = l' },
    'check-right': { c: 'if (r < n && arr[r] > arr[largest]) largest = r;', cpp: 'if (r < n && arr[r] > arr[largest]) largest = r;', java: 'if (r < n && arr[r] > arr[largest]) largest = r;', python: 'if r < n and arr[r] > arr[largest]:' },
    'take-right': { c: 'if (r < n && arr[r] > arr[largest]) largest = r;', cpp: 'if (r < n && arr[r] > arr[largest]) largest = r;', java: 'if (r < n && arr[r] > arr[largest]) largest = r;', python: 'largest = r' },
    'check-swap': { c: 'if (largest != i) {', cpp: 'if (largest != i) {', java: 'if (largest != i) {', python: 'if largest != i:' },
    'do-swap': { c: 'int temp = arr[i];', cpp: 'swap(arr[i], arr[largest]);', java: 'int temp = arr[i];', python: 'arr[i], arr[largest] = arr[largest], arr[i]' },
    'call-recurse': { c: 'heapify(arr, n, largest);', cpp: 'heapify(arr, n, largest);', java: 'heapify(arr, n, largest);', python: 'heapify(arr, n, largest)' },
  };

  it('the table covers exactly the codeRefs the trace emits and the line map defines', () => {
    const emitted = new Set<string>();
    for (const [, input] of INPUTS) for (const s of trace(input)) if (s.codeRef) emitted.add(s.codeRef);
    expect([...emitted].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const lang of LANGUAGES) expect(Object.keys(heap.lineMap[lang]).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [ref, byLang] of Object.entries(EXPECTED)) {
    for (const lang of LANGUAGES) {
      it(`${lang} / ${ref} → "${byLang[lang]}"`, () => {
        const line = resolveCodeRef(heap, lang, ref);
        expect(line).not.toBeNull();
        expect(codeLines(heap, lang)[line! - 1].trim()).toBe(byLang[lang]);
        expect(LINE_ANCHORS['heap-sort'][ref].test(byLang[lang])).toBe(true);
      });
    }
  }

  it('C and Java swaps highlight all three statements; C++ and Python one line', () => {
    const text = (lang: (typeof LANGUAGES)[number], ref: string) => {
      const r = resolveCodeRange(heap, lang, ref)!;
      return codeLines(heap, lang).slice(r.start - 1, r.end).map(t => t.trim());
    };
    for (const lang of ['c', 'java'] as const) {
      expect(text(lang, 'do-swap')).toEqual(['int temp = arr[i];', 'arr[i] = arr[largest];', 'arr[largest] = temp;']);
      expect(text(lang, 'extract-swap')).toEqual(['int temp = arr[0];', 'arr[0] = arr[i];', 'arr[i] = temp;']);
    }
    for (const lang of ['cpp', 'python'] as const) {
      expect(text(lang, 'do-swap')).toHaveLength(1);
      expect(text(lang, 'extract-swap')).toHaveLength(1);
    }
  });

  it('every statement of every listing is highlighted by some step (except function headers)', () => {
    for (const lang of LANGUAGES) {
      const covered = new Set<number>();
      for (const input of [heap.defaultInput, [1, 2, 3, 4, 5, 6, 7, 8], [2, 1], []]) {
        for (const s of trace(input)) {
          const r = resolveCodeRange(heap, lang, s.codeRef);
          if (r) for (let k = r.start; k <= r.end; k++) covered.add(k);
        }
      }
      codeLines(heap, lang).forEach((text, k) => {
        if (/^[\s{}]*$/.test(text) || /^\s*(def heapify|void heapify|private static void heapify|public class|def heap_sort|void heapSort|public static void heapSort)/.test(text)) return;
        expect(covered.has(k + 1), `${lang} line ${k + 1} "${text.trim()}"`).toBe(true);
      });
    }
  });
});
