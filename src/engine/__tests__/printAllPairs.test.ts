import { describe, it, expect } from 'vitest';
import { printAllPairsDefinition as pp } from '../algorithms/printAllPairs';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { deriveOutcome, deriveStepVisuals } from '../../components/visualizer/barVisuals';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Print All Pairs: for i in 0..n-1, for j in i+1..n-1, print (arr[i], arr[j]). No sorting, no sums, input order kept.
const run = (arr: number[]) => pp.generateSteps([...arr]);
/** the pairs the trace prints: the output rows on its last step */
const printed = (steps: ExecutionStep[]) => (steps.at(-1)!.buffers ?? []).map(b => b.values);
/** an oracle written differently from the generator: every index pair a < b, in index order */
const allPairs = (arr: number[]) => arr.flatMap((x, a) => arr.slice(a + 1).map(y => [x, y]));
const refs = (steps: ExecutionStep[]) => steps.map(s => `${s.codeRef}${s.result ? `:${s.result}` : ''}`);
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;

describe('Print All Pairs — output', () => {
  it.each([
    ['the example', [10, 20, 30, 40], [[10, 20], [10, 30], [10, 40], [20, 30], [20, 40], [30, 40]]],
    ['empty', [], []],
    ['one value', [7], []],
    ['two values', [1, 2], [[1, 2]]],
    ['three values', [1, 2, 3], [[1, 2], [1, 3], [2, 3]]],
    ['equal values at different indices still pair', [5, 5, 8], [[5, 5], [5, 8], [5, 8]]],
    ['negative values', [-3, -1, 2], [[-3, -1], [-3, 2], [-1, 2]]],
    ['input order kept, not sorted', [3, 1, 2], [[3, 1], [3, 2], [1, 2]]],
    ['all equal', [4, 4, 4], [[4, 4], [4, 4], [4, 4]]],
  ])('%s', (_name, arr, expected) => {
    expect(printed(run(arr as number[]))).toEqual(expected);
  });

  it('on 500 random arrays: exactly n(n - 1) / 2 pairs, one per index pair i < j in order, and the input untouched', () => {
    const rng = makeRng(2);
    for (let t = 0; t < 500; t++) {
      const arr = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 11) - 5);
      const before = [...arr];
      const steps = run(arr);
      const n = arr.length;
      expect(printed(steps)).toHaveLength((n * (n - 1)) / 2);
      expect(printed(steps), JSON.stringify(arr)).toEqual(allPairs(arr));
      // the indices behind each printed pair: every i < j exactly once, lexicographic, never i == j or reversed
      const at = steps.filter(s => s.codeRef === 'print').map(s => [s.variables!.i, s.variables!.j] as number[]);
      expect(at).toEqual(Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, d) => [i, i + 1 + d])).flat());
      expect(arr).toEqual(before);
      for (const s of steps) expect(s.state).toEqual(before);
    }
  });

  it('refuses values that are not whole numbers', () => {
    expect(() => run([1.5, 2])).toThrow(TypeError);
  });
});

describe('Print All Pairs — steps', () => {
  it('[1, 2, 3]: init, each i with its j loop (start, test, print, j++), i++, and the final false tests', () => {
    expect(refs(run([1, 2, 3]))).toEqual([
      'init-n',
      'outer-loop:true', 'init-j',
      'inner-loop:true', 'print', 'inc-j',
      'inner-loop:true', 'print', 'inc-j',
      'inner-loop:false', 'inc-i',
      'outer-loop:true', 'init-j',
      'inner-loop:true', 'print', 'inc-j',
      'inner-loop:false', 'inc-i',
      // the last i has nothing after it: its inner loop is false at once
      'outer-loop:true', 'init-j', 'inner-loop:false', 'inc-i',
      'outer-loop:false',
      'fn-exit',
    ]);
  });

  it('empty and one-value arrays complete normally with no output', () => {
    expect(refs(run([]))).toEqual(['init-n', 'outer-loop:false', 'fn-exit']);
    expect(refs(run([7]))).toEqual(['init-n', 'outer-loop:true', 'init-j', 'inner-loop:false', 'inc-i', 'outer-loop:false', 'fn-exit']);
    for (const arr of [[], [7]]) {
      const steps = run(arr);
      expect(steps.at(-1)!.type).toBe('complete');
      expect(printed(steps)).toEqual([]);
      for (const s of steps) expect(`${s.message} ${s.explanation} ${s.outcomeText ?? ''}`).not.toMatch(/undefined|NaN/);
    }
  });

  it('every snapshot is accurate: pointers match variables, cards match the bars, rows are the pairs printed so far', () => {
    const rng = makeRng(9);
    for (let t = 0; t < 100; t++) {
      const arr = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 21) - 10);
      const rows: number[][] = [];
      for (const s of run(arr)) {
        const where = `${JSON.stringify(arr)} step ${s.id} (${s.codeRef})`;
        for (const [k, v] of Object.entries(s.pointers ?? {})) expect(s.variables![k], where).toBe(v);
        if (s.codeRef === 'print') {
          const { i, j } = s.variables as Record<string, number>;
          expect(i < j && j < arr.length, where).toBe(true);
          expect(s.indices).toEqual([i, j]);
          rows.push([arr[i], arr[j]]);
        }
        // the pair being printed is the newest row; earlier rows are the earlier pairs, unchanged
        expect((s.buffers ?? []).map(b => b.values), where).toEqual(rows);
        expect(card(s, 'printed').value, where).toBe(rows.length);
        for (const name of ['i', 'j'] as const) {
          const k = s.pointers?.[name];
          expect(card(s, `arr[${name}]`).value, where).toBe(k !== undefined && k < arr.length ? arr[k] : null);
        }
      }
    }
  });

  it('i and j are drawn under their bars and the pair being printed is highlighted', () => {
    const steps = run([10, 20, 30, 40]);
    const s = steps.filter(x => x.codeRef === 'print')[4]; // (20, 40)
    expect(s.variables).toMatchObject({ i: 1, j: 3 });
    const v = deriveStepVisuals(s, { positionPointers: pp.positionPointers });
    expect(v.bars[1].pointers).toEqual(['i']);
    expect(v.bars[3].pointers).toEqual(['j']);
    expect(v.bars.filter(b => b.role === 'assign').map(b => b.index)).toEqual([1, 3]);
    expect(s.buffers!.at(-1)).toMatchObject({ label: 'output[4]', values: [20, 40] });
  });

  it('ends with complete: the outcome is a completed run (not found / not-found / sorted), with the pair count', () => {
    const steps = run([10, 20, 30, 40]);
    expect(steps.some(s => s.type === 'found' || s.type === 'not-found')).toBe(false);
    expect(deriveOutcome(steps, steps.length - 1)).toBe('complete');
    expect(steps.at(-1)!.outcomeText).toMatch(/^6 pairs printed/);
    const empty = run([]);
    expect(deriveOutcome(empty, empty.length - 1)).toBe('empty');
    expect(run([7]).at(-1)!.outcomeText).toMatch(/^No pairs/);
  });
});

describe('Print All Pairs — code listings', () => {
  const line = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(pp, lang)[pp.lineMap[lang][ref] - 1].trim();

  it('every codeRef the trace uses is mapped in all four languages, and the mapped lines are the right statements', () => {
    const used = new Set([...run([1, 2, 3]), ...run([])].map(s => s.codeRef!));
    expect(used).toEqual(new Set(Object.keys(pp.lineMap.cpp)));
    for (const lang of LANGUAGES) {
      for (const ref of used) expect(resolveCodeRef(pp, lang, ref), `${lang} ${ref}`).not.toBeNull();
      expect(line(lang, 'outer-loop'), lang).toMatch(/for \(int i = 0; i < n; i\+\+\)|for i in range\(n\):/);
      expect(line(lang, 'inner-loop'), lang).toMatch(/for \(int j = i \+ 1; j < n; j\+\+\)|for j in range\(i \+ 1, n\):/);
      expect(line(lang, 'init-j')).toBe(line(lang, 'inner-loop'));
      expect(line(lang, 'inc-j')).toBe(line(lang, 'inner-loop'));
      expect(line(lang, 'inc-i')).toBe(line(lang, 'outer-loop'));
      expect(line(lang, 'print'), lang).toMatch(/arr\[i\].*arr\[j\]/);
    }
    expect(line('c', 'print')).toBe('printf("(%d, %d)\\n", arr[i], arr[j]);');
    expect(line('python', 'print')).toBe('print(f"({arr[i]}, {arr[j]})")');
  });

  it('the listings only read the array: no sort, no sum, no assignment to it', () => {
    for (const lang of LANGUAGES) {
      expect(pp.code[lang], lang).not.toMatch(/sort|sum|arr\[[ij]\]\s*=[^=]|\+\s*arr\[j\]\s*[;)]/i);
    }
  });
});

describe('Print All Pairs — input and integration', () => {
  it('any array of up to 16 whole numbers, empty included; no target, no sorted requirement', () => {
    expect(validateAlgorithmInput(pp, [10, 20, 30, 40], null).ok).toBe(true);
    expect(validateAlgorithmInput(pp, [], null).ok).toBe(true);
    expect(validateAlgorithmInput(pp, [-999, 999, -999], null).ok).toBe(true);
    expect(validateAlgorithmInput(pp, Array(17).fill(0), null).ok).toBe(false);
    expect(pp.inputSpec).toBeUndefined();
  });

  it('registered once, listed in ARRAYS after 4Sum, O(n²) time and O(1) extra space', () => {
    expect(getAlgorithmDefinition('print-all-pairs')).toBe(pp);
    expect(ALGORITHM_NAV.filter(a => a.id === 'print-all-pairs')).toEqual([
      expect.objectContaining({ name: 'Print All Pairs in an Array', category: 'ARRAYS', implemented: true }),
    ]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('print-all-pairs')).toBe(order.indexOf('four-sum') + 1);
    expect(pp.complexity).toMatchObject({ best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' });
    expect(pp.defaultInput).toEqual([10, 20, 30, 40]);
    expect(buildExecution('print-all-pairs', [10, 20, 30, 40]).status).toBe('ok');
  });
});
