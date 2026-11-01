import { describe, it, expect } from 'vitest';
import { printSubarraysDefinition as ps } from '../algorithms/printSubarrays';
import { printAllPairsDefinition } from '../algorithms/printAllPairs';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { deriveOutcome, deriveStepVisuals } from '../../components/visualizer/barVisuals';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Print Subarrays: for start in 0..n-1, for end in start..n-1, print arr[start..end] value by value (k).
const run = (arr: number[]) => ps.generateSteps([...arr]);
/** the subarrays the trace prints: the output rows on its last step */
const printed = (steps: ExecutionStep[]) => (steps.at(-1)!.buffers ?? []).map(b => b.values);
/** an oracle written differently from the generator: slice every start..end */
const allSubarrays = (arr: number[]) => arr.flatMap((_, s) => arr.slice(s).map((__, d) => arr.slice(s, s + d + 1)));
const refs = (steps: ExecutionStep[]) => steps.map(s => `${s.codeRef}${s.result ? `:${s.result}` : ''}`);
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;

describe('Print Subarrays — output', () => {
  it.each([
    ['the example', [1, 2, 3], [[1], [1, 2], [1, 2, 3], [2], [2, 3], [3]]],
    ['empty', [], []],
    ['one value', [5], [[5]]],
    ['two values', [4, 9], [[4], [4, 9], [9]]],
    ['negative values', [-3, 0, -1], [[-3], [-3, 0], [-3, 0, -1], [0], [0, -1], [-1]]],
    ['duplicates are separate subarrays when they start at different indices', [7, 7], [[7], [7, 7], [7]]],
    ['input order kept, not sorted', [3, 1, 2], [[3], [3, 1], [3, 1, 2], [1], [1, 2], [2]]],
  ])('%s', (_name, arr, expected) => {
    expect(printed(run(arr as number[]))).toEqual(expected);
  });

  it('on 300 random arrays: exactly n(n + 1) / 2 subarrays, every start..end once in order, and the input untouched', () => {
    const rng = makeRng(4);
    for (let t = 0; t < 300; t++) {
      const arr = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 11) - 5);
      const before = [...arr];
      const steps = run(arr);
      const n = arr.length;
      expect(printed(steps)).toHaveLength((n * (n + 1)) / 2);
      expect(printed(steps), JSON.stringify(arr)).toEqual(allSubarrays(arr));
      // the ranges behind the rows: (start, end) in start-then-end order, each once
      const ranges = steps.filter(s => s.codeRef === 'close').map(s => [s.variables!.start, s.variables!.end]);
      expect(ranges).toEqual(Array.from({ length: n }, (_, s) => Array.from({ length: n - s }, (__, d) => [s, s + d])).flat());
      expect(arr).toEqual(before);
      // every snapshot shows the input as given (traces run to thousands of steps: compared as one string each)
      const given = before.join();
      expect(steps.filter(s => s.state.join() !== given).map(s => s.id), JSON.stringify(arr)).toEqual([]);
    }
  });

  it('refuses values that are not whole numbers, as Print All Pairs does', () => {
    expect(() => run([1.5, 2])).toThrow(TypeError);
    expect(() => printAllPairsDefinition.generateSteps([1.5, 2])).toThrow(TypeError);
  });
});

describe('Print Subarrays — steps', () => {
  it('[5]: init, start 0, end 0, "[", k prints the one value, "]", then every loop ends', () => {
    expect(refs(run([5]))).toEqual([
      'init-n',
      'outer-loop:true', 'init-end',
      'inner-loop:true', 'open', 'init-k',
      'k-loop:true', 'print-elem', 'inc-k',
      'k-loop:false', 'close', 'inc-end',
      'inner-loop:false', 'inc-start',
      'outer-loop:false',
      'fn-exit',
    ]);
  });

  it('an empty array completes normally with no output', () => {
    const steps = run([]);
    expect(refs(steps)).toEqual(['init-n', 'outer-loop:false', 'fn-exit']);
    expect(deriveOutcome(steps, steps.length - 1)).toBe('empty');
    expect(steps.at(-1)!.outcomeText).toMatch(/^No subarrays/);
    for (const s of steps) {
      expect(s.indices ?? []).toEqual([]);
      expect(s.buffers ?? []).toEqual([]);
    }
  });

  it('O(n³) work, step for step: one print per value of every subarray, n(n + 1)(n + 2) / 6 in all', () => {
    for (let n = 0; n <= 16; n++) {
      const steps = run(Array.from({ length: n }, (_, k) => k));
      const subarrays = (n * (n + 1)) / 2;
      const values = (n * (n + 1) * (n + 2)) / 6;
      expect(steps.filter(s => s.codeRef === 'print-elem')).toHaveLength(values);
      expect(steps.filter(s => s.codeRef === 'close')).toHaveLength(subarrays);
      // init + 4 per start + 6 per subarray + 3 per value + the last outer test + complete
      expect(steps).toHaveLength(1 + 4 * n + 6 * subarrays + 3 * values + 2);
    }
  });

  it('every snapshot is accurate: pointers match variables, cards match the bars, rows are the output so far', () => {
    const rng = makeRng(11);
    for (let t = 0; t < 60; t++) {
      const arr = Array.from({ length: Math.floor(rng() * 13) }, () => Math.floor(rng() * 21) - 10);
      const done: number[][] = [];
      let current: number[] | null = null;
      const problems: string[] = [];
      const check = (ok: boolean, what: string) => {
        if (!ok && problems.length < 10) problems.push(`${JSON.stringify(arr)} ${what}`);
      };
      for (const s of run(arr)) {
        const v = s.variables as Record<string, number>;
        const at = `step ${s.id} (${s.codeRef})`;
        for (const [name, p] of Object.entries(s.pointers ?? {})) check(v[name] === p, `${at}: pointer ${name}`);
        if (s.codeRef === 'open') current = [];
        if (s.codeRef === 'print-elem') {
          check(v.start <= v.k && v.k <= v.end, `${at}: k outside start..end`);
          current!.push(arr[v.k]);
        }
        if (s.codeRef === 'close') {
          done.push(current!);
          current = null;
        }
        const expected = [...done, ...(current ? [current] : [])];
        check(JSON.stringify((s.buffers ?? []).map(b => b.values)) === JSON.stringify(expected), `${at}: rows`);
        // only the subarray being printed is marked as such
        check((s.buffers ?? []).every((b, r) => b.label!.endsWith('(printing)') === (current !== null && r === done.length)), `${at}: labels`);
        check(card(s, 'printed').value === done.length, `${at}: printed card`);
        check(card(s, 'arr[start]').value === (v.start !== undefined && v.start < arr.length ? arr[v.start] : null), `${at}: arr[start] card`);
        const inRange = v.start !== undefined && v.end !== undefined && v.end < arr.length;
        check(card(s, 'length').value === (inRange ? v.end - v.start + 1 : null), `${at}: length card`);
        check(JSON.stringify(s.extraInfo?.subRange ?? null) === JSON.stringify(inRange ? [v.start, v.end] : null), `${at}: subRange`);
      }
      expect(problems).toEqual([]);
    }
  });

  it('the selected range start..end is the working range; the value being printed is highlighted', () => {
    const steps = run([10, 20, 30, 40]);
    // the second value of [20, 30, 40]: start 1, end 3, k 2
    const s = steps.find(x => x.codeRef === 'print-elem' && x.variables!.start === 1 && x.variables!.end === 3 && x.variables!.k === 2)!;
    const v = deriveStepVisuals(s, { positionPointers: ps.positionPointers });
    expect(v.bars.map(b => b.inRange)).toEqual([false, true, true, true]);
    expect(v.bars[1].pointers).toEqual(['start']);
    expect(v.bars[2].pointers).toEqual(['k']);
    expect(v.bars[3].pointers).toEqual(['end']);
    expect(v.bars.filter(b => b.role === 'assign').map(b => b.index)).toEqual([2]);
    // start 0 printed output[0..3]; [20] and [20, 30] are output[4] and [5]
    expect(s.buffers!.at(-1)).toMatchObject({ label: 'output[6] (printing)', values: [20, 30] });
  });

  it('finished rows are shared by every later step, not copied per step', () => {
    const steps = run([1, 2, 3, 4]);
    const first = steps.find(s => s.codeRef === 'close')!.buffers![0];
    for (const s of steps.slice(steps.indexOf(steps.find(x => x.codeRef === 'close')!))) expect(s.buffers![0]).toBe(first);
  });

  it('ends with complete: a completed run (not found / sorted), with the subarray count', () => {
    const steps = run([1, 2, 3]);
    expect(steps.some(s => s.type === 'found' || s.type === 'not-found')).toBe(false);
    expect(deriveOutcome(steps, steps.length - 1)).toBe('complete');
    expect(steps.at(-1)!.outcomeText).toMatch(/^6 subarrays printed/);
    expect(steps.at(-1)!.pointers ?? {}).toEqual({});
  });
});

describe('Print Subarrays — code listings', () => {
  const line = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(ps, lang)[ps.lineMap[lang][ref] - 1].trim();

  it('every codeRef the trace uses is mapped in all four languages, to the right statement', () => {
    const used = new Set([...run([1, 2]), ...run([])].map(s => s.codeRef!));
    expect(used).toEqual(new Set(Object.keys(ps.lineMap.cpp)));
    for (const lang of LANGUAGES) {
      for (const ref of used) expect(resolveCodeRef(ps, lang, ref), `${lang} ${ref}`).not.toBeNull();
      expect(line(lang, 'outer-loop'), lang).toMatch(/for \(int start = 0; start < n; start\+\+\)|for start in range\(n\):/);
      expect(line(lang, 'inner-loop'), lang).toMatch(/for \(int end = start; end < n; end\+\+\)|for end in range\(start, n\):/);
      expect(line(lang, 'k-loop'), lang).toMatch(/for \(int k = start; k <= end; k\+\+\)|for k in range\(start, end \+ 1\):/);
      for (const [ref, header] of [['inc-start', 'outer-loop'], ['init-end', 'inner-loop'], ['inc-end', 'inner-loop'], ['init-k', 'k-loop'], ['inc-k', 'k-loop']]) {
        expect(line(lang, ref), `${lang} ${ref}`).toBe(line(lang, header));
      }
      expect(line(lang, 'open'), lang).toContain('"["');
      expect(line(lang, 'print-elem'), lang).toMatch(/k > start.*arr\[k\]/);
      expect(line(lang, 'close'), lang).toMatch(/"\]/);
    }
  });

  it('the listings only read the array, and print each value directly (no copy of the subarray)', () => {
    for (const lang of LANGUAGES) {
      expect(ps.code[lang], lang).not.toMatch(/sort|arr\[\w+\]\s*=[^=]|slice|subList|copyOf|vector<int>\s+\w+\(|\[start:/);
    }
  });
});

describe('Print Subarrays — input and integration', () => {
  it('any array of up to 16 whole numbers, empty included; no target, no sorted requirement', () => {
    expect(validateAlgorithmInput(ps, [1, 2, 3], null).ok).toBe(true);
    expect(validateAlgorithmInput(ps, [], null).ok).toBe(true);
    expect(validateAlgorithmInput(ps, [-999, 999], null).ok).toBe(true);
    expect(validateAlgorithmInput(ps, Array(17).fill(0), null).ok).toBe(false);
    expect(ps.inputSpec).toBeUndefined();
  });

  it('registered once, listed in ARRAYS after Print All Pairs, O(n³) time and O(1) extra space', () => {
    expect(getAlgorithmDefinition('print-subarrays')).toBe(ps);
    expect(ALGORITHM_NAV.filter(a => a.id === 'print-subarrays')).toEqual([
      expect.objectContaining({ name: 'Print Subarrays', category: 'ARRAYS', implemented: true }),
    ]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('print-subarrays')).toBe(order.indexOf('print-all-pairs') + 1);
    expect(ps.complexity).toMatchObject({ best: 'O(n³)', average: 'O(n³)', worst: 'O(n³)', space: 'O(1)' });
    expect(ps.defaultInput).toEqual([1, 2, 3]);
    expect(buildExecution('print-subarrays', [1, 2, 3]).status).toBe('ok');
  });
});
