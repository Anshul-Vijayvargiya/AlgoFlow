import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { MAX_NUMS, SUBARRAY_SUM_DEFAULT_K } from '../algorithms/subarraySumK';
import { LANGUAGES, makeRng } from './testUtils';
import type { ExecutionStep, PrefixMapRange, PrefixMapView } from '../../types/algorithm';

const ID = 'array-subarray-sum-k' as const;
const def = getAlgorithmDefinition(ID)!;
const run = (nums: readonly number[], k: number) => def.generateSteps([...nums], { target: k });
const view = (s: ExecutionStep) => s.prefixMap!;
const last = (steps: ExecutionStep[]) => view(steps.at(-1)!);
const refs = (steps: ExecutionStep[]) => steps.map(s => s.codeRef);
const ranges = (rs: readonly PrefixMapRange[]) => rs.map(r => `${r.start}-${r.end}`);

/** an independent reference: every subarray nums[s..e], summed directly, in the order the pass counts them (by end) */
function brute(nums: readonly number[], k: number): string[] {
  const out: string[] = [];
  for (let e = 0; e < nums.length; e++)
    for (let s = 0; s <= e; s++) {
      let sum = 0;
      for (let p = s; p <= e; p++) sum += nums[p];
      if (sum === k) out.push(`${s}-${e}`);
    }
  return out;
}

const rng = makeRng(560);
const randomCase = (lo: number, hi: number): [number[], number] => {
  const n = Math.floor(rng() * (MAX_NUMS + 1));
  const nums = Array.from({ length: n }, () => lo + Math.floor(rng() * (hi - lo + 1)));
  // k: often a sum that occurs, sometimes anything
  const k = rng() < 0.7 && n ? nums.slice(Math.floor(rng() * n)).slice(0, 1 + Math.floor(rng() * n)).reduce((a, b) => a + b, 0) : lo + Math.floor(rng() * (hi - lo + 1));
  return [nums, Math.max(-999, Math.min(999, k))];
};
const AGREED: [number[], number, number][] = [
  [[1, 2, 3], 3, 2],
  [[1, 1, 1], 2, 2],
  [[1, -1, 0], 0, 3],
  [[0, 0, 0], 0, 6],
  [[-1, -1, 1], 0, 1],
  [[1, 2, 3], 10, 0],
  [[3], 3, 1],
  [[], 0, 0],
];
const CASES: [number[], number][] = [
  ...AGREED.map(([nums, k]) => [nums, k] as [number[], number]),
  [Array(10).fill(0), 0],
  [Array(10).fill(999), 999],
  [Array(10).fill(-999), -999],
  [[999, -999, 999, -999, 999, -999, 999, -999, 999, -999], 0],
  [[3, 4, 7, 2, -3, 1, 4, 2], 7],
  [[1, -1, 1, -1, 1, -1], 0],
  [[5], -5],
  [[-2, 2, -2, 2], 2],
  ...Array.from({ length: 300 }, () => randomCase(-3, 4)),
  ...Array.from({ length: 150 }, () => randomCase(-999, 999)),
];

describe('Subarray Sum Equals K: the definition', () => {
  it('an ARRAYS algorithm right after Two Sum, before Majority Element; not Coming Soon, and the Prefix Sum placeholder is untouched', () => {
    const arrays = ALGORITHM_NAV.filter(a => a.category === 'ARRAYS').map(a => a.id);
    expect(arrays.indexOf(ID)).toBe(arrays.indexOf('two-sum') + 1);
    expect(arrays.indexOf('majority-element')).toBe(arrays.indexOf(ID) + 1);
    expect(arrays.at(-1)).toBe('array-buy-sell-stock-iii');
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Subarray Sum Equals K', category: 'ARRAYS', implemented: true, subtitle: def.subtitle });
    expect(ALGORITHM_NAV.find(a => a.id === 'prefix-sum')).toMatchObject({ name: 'Prefix Sum', implemented: false });
    expect(getAlgorithmDefinition('prefix-sum')).toBeUndefined();
  });

  it('drawn as its own kind (prefix-map), taking k as its target; at most 10 numbers; O(n) time and O(n) space', () => {
    expect(def).toMatchObject({ id: ID, category: 'ARRAYS', visual: 'prefix-map', defaultInput: [1, 2, 3] });
    expect(visualKindOf(def)).toBe('prefix-map');
    expect(def.inputSpec).toEqual({
      target: { label: 'k', hint: 'Count the subarrays whose numbers sum to this', defaultValue: 3 },
      maxLength: 10,
      randomValues: [-3, 4],
    });
    expect(SUBARRAY_SUM_DEFAULT_K).toBe(3);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(n)' });
    expect(getAllAlgorithms().filter(d => d.visual === 'prefix-map').map(d => d.id)).toEqual([ID]);
  });

  it('the listings: count, prefix and a map holding 0 once; one loop; the lookup before the store; no nested loop, sorting or sentinel', () => {
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      const body = code.slice(code.indexOf(lang === 'python' ? 'def subarray_sum' : 'subarraySum('));
      expect(body.match(/\bfor\b/g), lang).toHaveLength(1);
      expect(code, lang).not.toMatch(/\bsort|INT_MIN|MIN_VALUE|inf\b|while \(true\)/);
      const lines = body.split('\n').map(l => l.trim());
      const at = (re: RegExp) => lines.findIndex(l => re.test(l));
      expect(at(/^(int )?need = prefix - k;?$/), lang).toBeGreaterThan(at(/^prefix \+= nums\[i\];?$/));
      expect(at(/^count \+= /), lang).toBeGreaterThan(at(/need = prefix - k/));
      expect(at(/^(add\(&freq, prefix\)|freq\[prefix\]|freq\.put\(prefix)/), lang).toBeGreaterThan(at(/^count \+= /));
    }
    // C++: the lookup never inserts need (operator[] would add a 0 entry the visualizer does not show)
    expect(def.code.cpp).toContain('count += freq.count(need) ? freq.at(need) : 0;');
    expect(def.code.cpp).not.toMatch(/freq\[need\]/);
  });
});

describe('Subarray Sum Equals K: the answers', () => {
  it('the agreed cases, the empty array included', () => {
    for (const [nums, k, want] of AGREED) {
      expect(last(run(nums, k)).result!.count, `${JSON.stringify(nums)} k=${k}`).toBe(want);
      expect(last(run(nums, k)).count).toBe(want);
    }
    expect(def.generateSteps([1, 2, 3]).at(-1)!.prefixMap!.result!.count).toBe(2);
  });

  it(`${CASES.length} cases (negatives, zeros, repeats, the extremes, 450 seeded random): the count and every subarray match a direct search`, () => {
    for (const [nums, k] of CASES) {
      const want = brute(nums, k);
      const v = last(run(nums, k));
      expect(v.count, `${JSON.stringify(nums)} k=${k}`).toBe(want.length);
      expect(ranges(v.matches), `${JSON.stringify(nums)} k=${k}`).toEqual(want);
    }
  });

  it('the count never reads the subarrays: a plain run of the listing gives it on every input', () => {
    for (const [nums, k] of CASES) {
      let count = 0;
      let prefix = 0;
      const freq = new Map([[0, 1]]);
      for (const x of nums) {
        prefix += x;
        count += freq.get(prefix - k) ?? 0;
        freq.set(prefix, (freq.get(prefix) ?? 0) + 1);
      }
      expect(last(run(nums, k)).count, JSON.stringify([nums, k])).toBe(count);
      expect(last(run(nums, k)).freq, JSON.stringify([nums, k])).toEqual([...freq].map(([key, c]) => ({ key, count: c })));
    }
  });

  it('the result text: none, the empty array, or the subarrays (eight at most, then how many more)', () => {
    expect(last(run([1, 2, 3], 3)).result!.text).toBe('2 subarrays sum to 3: nums[0..1] = [1, 2], nums[2..2] = [3]');
    expect(last(run([3], 3)).result!.text).toBe('1 subarray sums to 3: nums[0..0] = [3]');
    expect(last(run([1, 2, 3], 10)).result!.text).toBe('No subarray sums to 10');
    expect(last(run([], 0)).result!.text).toBe('The array is empty: no subarray, count 0');
    expect(last(run(Array(10).fill(0), 0)).result!.text).toMatch(/^55 subarrays sum to 0: nums\[0\.\.0\] = \[0\], .*, and 47 more$/);
    expect(steps123.at(-1)!.outcomeText).toBe(last(steps123).result!.text);
  });
});

const steps123 = run([1, 2, 3], 3);

describe('Subarray Sum Equals K: the trace', () => {
  it('[1, 2, 3], k = 3 step by step: the setup, then per number the loop check, prefix, need, lookup and store', () => {
    expect(refs(steps123)).toEqual([
      'fn-entry', 'init-count', 'init-prefix', 'init-map',
      ...[0, 1, 2].flatMap(() => ['loop-condition', 'add-prefix', 'calc-need', 'lookup', 'store']),
      'loop-condition', 'return-result',
    ]);
    expect(steps123.map(s => s.message)).toEqual([
      'subarraySum([1, 2, 3], k = 3): count the subarrays that sum to 3',
      'count = 0',
      'prefix = 0',
      'freq = {0: 1}',
      'i=0 < n=3 → true',
      'prefix = 0 + nums[0] = 0 + 1 = 1',
      'need = prefix - k = 1 - 3 = -2',
      'freq has no -2: count += 0 → count = 0',
      'freq[1] = 0 + 1 = 1',
      'i=1 < n=3 → true',
      'prefix = 1 + nums[1] = 1 + 2 = 3',
      'need = prefix - k = 3 - 3 = 0',
      'count += freq[0] = 0 + 1 = 1',
      'freq[3] = 0 + 1 = 1',
      'i=2 < n=3 → true',
      'prefix = 3 + nums[2] = 3 + 3 = 6',
      'need = prefix - k = 6 - 3 = 3',
      'count += freq[3] = 1 + 1 = 2',
      'freq[6] = 0 + 1 = 1',
      'i=3 < n=3 → false — loop ends',
      'return count = 2',
    ]);
    const lookups = steps123.filter(s => s.codeRef === 'lookup').map(view);
    expect(lookups.map(v => v.lookup)).toEqual([
      { key: -2, found: false, occurrences: 0, countBefore: 0 },
      { key: 0, found: true, occurrences: 1, countBefore: 0 },
      { key: 3, found: true, occurrences: 1, countBefore: 1 },
    ]);
    expect(lookups.map(v => ranges(v.matchesHere))).toEqual([[], ['0-1'], ['2-2']]);
    expect(steps123.filter(s => s.codeRef === 'store').map(s => view(s).write)).toEqual([
      { key: 1, kind: 'insert', from: 0, to: 1 },
      { key: 3, kind: 'insert', from: 0, to: 1 },
      { key: 6, kind: 'insert', from: 0, to: 1 },
    ]);
    expect(view(steps123[3])).toMatchObject({ operation: 'init-map', freq: [{ key: 0, count: 1 }], recorded: 1, write: { key: 0, kind: 'insert', from: 0, to: 1 } });
  });

  it('[0, 0, 0], k = 0: need equals prefix, looked up before the store, so a subarray is never empty; repeats count once per occurrence', () => {
    const steps = run([0, 0, 0], 0);
    const lookups = steps.filter(s => s.codeRef === 'lookup').map(view);
    expect(lookups.map(v => v.lookup!.occurrences)).toEqual([1, 2, 3]);
    expect(lookups.map(v => ranges(v.matchesHere))).toEqual([['0-0'], ['0-1', '1-1'], ['0-2', '1-2', '2-2']]);
    expect(steps.filter(s => s.codeRef === 'store').map(s => view(s).write)).toEqual([
      { key: 0, kind: 'increment', from: 1, to: 2 },
      { key: 0, kind: 'increment', from: 2, to: 3 },
      { key: 0, kind: 'increment', from: 3, to: 4 },
    ]);
    expect(last(steps).freq).toEqual([{ key: 0, count: 4 }]);
  });

  it('negative k and negative numbers are shown with their signs in parentheses', () => {
    const steps = run([-1, 2], -1);
    expect(steps.map(s => s.message)).toContain('prefix = 0 + nums[0] = 0 + (-1) = -1');
    expect(steps.map(s => s.message)).toContain('need = prefix - k = -1 - (-1) = 0');
  });

  it('[] : the setup, an empty loop and 0', () => {
    expect(refs(run([], 0))).toEqual(['fn-entry', 'init-count', 'init-prefix', 'init-map', 'loop-condition', 'return-result']);
    expect(last(run([], 5))).toMatchObject({ count: 0, matches: [], freq: [{ key: 0, count: 1 }], result: { count: 0 } });
  });

  it('on every input: the step count, ids, state, and each lookup and store agree with the values around them', () => {
    for (const [nums, k] of CASES) {
      const steps = run(nums, k);
      const tag = `${JSON.stringify(nums)} k=${k}`;
      expect(steps.length, tag).toBe(6 + 5 * nums.length);
      steps.forEach((s, id) => {
        expect(s.id).toBe(id);
        expect(s.state).toEqual(nums);
        expect(`${s.message} ${s.explanation ?? ''}`, `${tag} step ${id}`).not.toMatch(/undefined|NaN|-0\b(?!\.)|\bnull\b/);
      });
      for (let x = 0; x < steps.length; x++) {
        const v = view(steps[x]);
        const prev = x > 0 ? view(steps[x - 1]) : null;
        // the map always counts exactly the prefix sums recorded so far
        if (v.freq) expect(v.freq.reduce((a, e) => a + e.count, 0), tag).toBe(v.recorded);
        if (v.operation === 'add-prefix') expect(v.prefix).toBe(prev!.prefix! + nums[v.i!]);
        if (v.operation === 'calc-need') expect(v.need).toBe(v.prefix! - k);
        if (v.operation === 'lookup') {
          const had = prev!.freq!.find(e => e.key === v.need)?.count ?? 0;
          expect(v.lookup, tag).toEqual({ key: v.need, found: had > 0, occurrences: had, countBefore: prev!.count });
          expect(v.count).toBe(prev!.count! + had);
          expect(v.matchesHere).toHaveLength(had);
          expect(v.freq).toEqual(prev!.freq);
        } else {
          expect(v.matchesHere).toEqual([]);
        }
        if (v.operation === 'store') {
          const had = prev!.freq!.find(e => e.key === v.prefix)?.count ?? 0;
          expect(v.write).toEqual({ key: v.prefix, kind: had ? 'increment' : 'insert', from: had, to: had + 1 });
          expect(v.recorded).toBe(prev!.recorded + 1);
        }
        // the subarrays counted so far add up to count, each summing to k
        expect(v.matches.length, tag).toBe(v.count ?? 0);
        for (const r of v.matches) expect(nums.slice(r.start, r.end + 1).reduce((a, b) => a + b, 0)).toBe(k);
      }
    }
  });
});

describe('Subarray Sum Equals K: snapshots are immutable', () => {
  const frozenDeep = (value: unknown): boolean =>
    value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value as object).every(frozenDeep));

  it('every view is frozen all the way down', () => {
    for (const [nums, k] of CASES.slice(0, 80)) for (const s of run(nums, k)) expect(frozenDeep(view(s)), `${JSON.stringify(nums)} step ${s.id}`).toBe(true);
  });

  it('a snapshot cannot be changed, later steps never change an earlier one, and the input array is not touched', () => {
    const input = [0, 0, 0];
    const steps = def.generateSteps(input, { target: 0 });
    expect(input).toEqual([0, 0, 0]);
    const v: PrefixMapView = view(steps[12]);
    expect(() => (v.nums as number[]).push(9)).toThrow(TypeError);
    expect(() => ((v as { count: number | null }).count = 99)).toThrow(TypeError);
    expect(() => (v.freq as { key: number; count: number }[]).pop()).toThrow(TypeError);
    expect(() => ((v.freq![0] as { count: number }).count = 99)).toThrow(TypeError);
    expect(() => (v.matches as PrefixMapRange[]).pop()).toThrow(TypeError);
    expect(view(steps[3]).freq).toEqual([{ key: 0, count: 1 }]);
    expect(view(steps[7]).matches).toHaveLength(1);
    expect(def.generateSteps([0, 0, 0], { target: 0 })).toEqual(steps);
  });
});

describe('Subarray Sum Equals K: code references', () => {
  it('every step names a line in all four listings, and every mapped reference is reached', () => {
    const seen = new Set<string>();
    for (const [nums, k] of CASES) for (const s of run(nums, k)) seen.add(s.codeRef ?? '(none)');
    for (const ref of seen) for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, ref), `${lang} ${ref}`).not.toBeNull();
    expect([...seen].sort()).toEqual(Object.keys(def.lineMap.c).sort());
    for (const lang of LANGUAGES) expect(Object.keys(def.lineMap[lang]).sort(), lang).toEqual(Object.keys(def.lineMap.c).sort());
  });

  it('each reference names the statement it describes; C and Java record P(0) on the line after creating the map', () => {
    const line = (lang: (typeof LANGUAGES)[number], ref: string, offset = 0) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1 + offset].trim();
    for (const lang of LANGUAGES) {
      const end = lang === 'python' ? '' : ';';
      const decl = lang === 'python' ? '' : 'int ';
      expect(line(lang, 'init-count')).toBe(`${decl}count = 0${end}`);
      expect(line(lang, 'init-prefix')).toBe(`${decl}prefix = 0${end}`);
      expect(line(lang, 'add-prefix')).toBe(`prefix += nums[i]${end}`);
      expect(line(lang, 'calc-need')).toBe(`${decl}need = prefix - k${end}`);
      expect(line(lang, 'return-result')).toBe(`return count${end}`);
      expect(line(lang, 'loop-condition')).toMatch(/^for /);
      expect(line(lang, 'fn-entry')).toMatch(/subarray_?[Ss]um\(/);
    }
    expect(line('c', 'init-map', 1)).toBe('add(&freq, 0);');
    expect(line('java', 'init-map', 1)).toBe('freq.put(0, 1);');
    expect(def.lineSpans).toEqual({ c: { 'init-map': 2 }, java: { 'init-map': 2 } });
    // C frees the map just before returning
    expect([line('c', 'return-result', -2), line('c', 'return-result', -1)]).toEqual(['free(freq.keys);', 'free(freq.counts);']);
  });
});

describe('Subarray Sum Equals K: input', () => {
  it('0 to 10 whole numbers from -999 to 999, and k from -999 to 999; anything else is refused in words', () => {
    expect(validateAlgorithmInput(def, [1, 2, 3], 3)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [], 0)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, Array(10).fill(-999), -999)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, Array(11).fill(1), 3)).toMatchObject({ ok: false, message: 'Too many values (11). The visualizer supports at most 10.' });
    expect(validateAlgorithmInput(def, [1, 2], null)).toMatchObject({ ok: false, message: 'Enter a value for "k".' });
    expect(validateDraft(def, '1000', '3')).toMatchObject({ ok: false, message: expect.stringContaining('out of range') });
    expect(validateDraft(def, '1, 2', '1000')).toMatchObject({ ok: false, field: 'target', message: expect.stringContaining('out of range') });
    expect(validateDraft(def, '1, 2', '-1000')).toMatchObject({ ok: false, field: 'target' });
    expect(validateDraft(def, '2, 7.5', '3')).toMatchObject({ ok: false, message: expect.stringContaining('is a decimal') });
    expect(validateDraft(def, '1, 2', '1.5')).toMatchObject({ ok: false, field: 'target' });
    expect(validateDraft(def, '-3, 4, 0', '-2')).toMatchObject({ ok: true, array: [-3, 4, 0], target: -2 });
  });

  it('the generator refuses input the app would refuse; without k it uses the example k; Two Sum and the Stocks are unchanged', () => {
    expect(() => run(Array(11).fill(1), 3)).toThrow(RangeError);
    expect(() => run([1], 1000)).toThrow(RangeError);
    expect(() => def.generateSteps([1], { target: 1.5 })).toThrow(TypeError);
    expect(() => def.generateSteps([1], { target: null })).toThrow(TypeError);
    expect(def.generateSteps([3]).at(-1)!.prefixMap!.k).toBe(3);
    expect(getAlgorithmDefinition('two-sum')!.generateSteps([3, 8, 11, 5, 2, 7, 4], { target: 9 }).at(-1)!.outcomeText).toMatch(/Pair found/);
    expect(getAlgorithmDefinition('array-buy-sell-stock-iii')!.generateSteps([3, 3, 5, 0, 0, 3, 1, 4]).at(-1)!.stockIII!.result!.profit).toBe(6);
    expect(run([1, 2], 3).every(s => s.stockIII === undefined && s.hashMap === undefined)).toBe(true);
  });
});
