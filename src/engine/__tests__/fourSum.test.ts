import { describe, it, expect } from 'vitest';
import { fourSumDefinition as fs } from '../algorithms/fourSum';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { deriveOutcome, deriveStepVisuals } from '../../components/visualizer/barVisuals';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// 4Sum: sort a copy, fix i and j, close in with left / right; duplicates skipped at every level; each fixed level is
// cut short (break) or skipped (continue) when its smallest / largest possible sum cannot reach the target.
const run = (nums: number[], target = 0) => fs.generateSteps([...nums], { target });
/** the quadruplets the trace reports: the result rows on its last step */
const answer = (steps: ExecutionStep[]) => (steps.at(-1)!.buffers ?? []).map(b => b.values);
const key = (q: number[]) => q.join(',');
/** order-free comparison: the quadruplets as a sorted list of keys */
const normalized = (qs: number[][]) => qs.map(key).sort();
/** an oracle written differently from the generator: every index quadruple, kept once per distinct sorted value quadruple */
function bruteForce(nums: number[], target: number): number[][] {
  const seen = new Map<string, number[]>();
  for (let a = 0; a < nums.length; a++)
    for (let b = a + 1; b < nums.length; b++)
      for (let c = b + 1; c < nums.length; c++)
        for (let d = c + 1; d < nums.length; d++)
          if (BigInt(nums[a]) + BigInt(nums[b]) + BigInt(nums[c]) + BigInt(nums[d]) === BigInt(target)) {
            const q = [nums[a], nums[b], nums[c], nums[d]].sort((x, y) => x - y);
            seen.set(key(q), q);
          }
  return [...seen.values()];
}
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;
const refs = (steps: ExecutionStep[]) => steps.map(s => `${s.codeRef}${s.result ? `:${s.result}` : ''}`);

describe('4Sum — answers', () => {
  it.each([
    ['the LeetCode example', [1, 0, -1, 0, -2, 2], 0, [[-2, -1, 1, 2], [-2, 0, 0, 2], [-1, 0, 0, 1]]],
    ['empty', [], 0, []],
    ['one value', [0], 0, []],
    ['three values', [1, 2, 3], 6, []],
    ['exactly four, summing to the target', [4, 1, 3, 2], 10, [[1, 2, 3, 4]]],
    ['exactly four, not summing to it', [4, 1, 3, 2], 11, []],
    ['no solution', [1, 1, 1, 1, 1], 0, []],
    ['all negative', [-5, -4, -3, -2, -1], -10, [[-4, -3, -2, -1]]],
    ['a negative target', [-1, -1, -1, 0, 1, 2], -2, [[-1, -1, -1, 1]]],
    ['all equal: one quadruplet', [2, 2, 2, 2, 2], 8, [[2, 2, 2, 2]]],
    ['many zeros: one quadruplet', [0, 0, 0, 0, 0, 0, 0], 0, [[0, 0, 0, 0]]],
    ['duplicate-heavy', [-2, -2, -2, 0, 0, 0, 0, 2, 2, 2], 0, [[-2, -2, 2, 2], [-2, 0, 0, 2], [0, 0, 0, 0]]],
    ['several quadruplets', [-3, -2, -1, 0, 0, 1, 2, 3], 0,
      [[-3, -2, 2, 3], [-3, -1, 1, 3], [-3, 0, 0, 3], [-3, 0, 1, 2], [-2, -1, 0, 3], [-2, -1, 1, 2], [-2, 0, 0, 2], [-1, 0, 0, 1]]],
    ['a target above any sum', [1, 2, 3, 4, 5], 999, []],
    ['a target below any sum', [1, 2, 3, 4, 5], -999, []],
    ['the input extremes', [-999, 999, -999, 999, 0, 0], 0, [[-999, -999, 999, 999], [-999, 0, 0, 999]]],
  ])('%s', (_name, nums, target, expected) => {
    // ascending inside each quadruplet and in order of discovery, which is lexicographic for this algorithm
    expect(answer(run(nums as number[], target as number))).toEqual(expected);
  });

  it('sums that overflow 32 bits are not mistaken for the target', () => {
    // 4 × 10⁹ wraps to -294967296 in 32 bits; 4 × (2³¹ - 1) wraps to -4
    expect(answer(run([1e9, 1e9, 1e9, 1e9], -294967296))).toEqual([]);
    expect(answer(run([-1e9, -1e9, -1e9, -1e9], 294967296))).toEqual([]);
    expect(answer(run([2147483647, 2147483647, 2147483647, 2147483647], -4))).toEqual([]);
    expect(answer(run([1e9, 1e9, -1e9, -1e9, 5], 0))).toEqual([[-1e9, -1e9, 1e9, 1e9]]);
    expect(answer(run([2147483647, 2147483647, -2147483648, -2147483648, 1], -2))).toEqual([[-2147483648, -2147483648, 2147483647, 2147483647]]);
  });

  it('agrees with a brute force on 2,000 random arrays and targets; quadruplets are unique and ascending; the input is not mutated', () => {
    const rng = makeRng(18);
    for (let t = 0; t < 2000; t++) {
      const spread = [2, 4, 9, 999][t % 4];
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * (2 * spread + 1)) - spread);
      const target = Math.floor(rng() * (4 * spread + 1)) - 2 * spread;
      const before = [...nums];
      const found = answer(run(nums, target));
      const where = `${JSON.stringify(nums)} target ${target}`;
      expect(normalized(found), where).toEqual(normalized(bruteForce(nums, target)));
      expect(new Set(found.map(key)).size, where).toBe(found.length);
      for (const f of found) expect(f, where).toEqual([...f].sort((x, y) => x - y));
      expect(nums).toEqual(before);
    }
  });

  it('is deterministic: the same input and target give the same trace', () => {
    const nums = [5, -3, 0, 2, -2, 3, 0, -1, 1, 4, -4];
    expect(run(nums, 2)).toEqual(run(nums, 2));
    expect(run(nums, 2)).not.toEqual(run(nums, 3));
  });

  it('values and targets that cannot be added exactly are refused', () => {
    expect(() => run([1.5, 0, -1.5, 0])).toThrow(TypeError);
    expect(() => run([Number.MAX_SAFE_INTEGER, 0, 0, 0])).toThrow(TypeError);
    expect(() => run([1, 2, 3, 4], 2.5)).toThrow(TypeError);
    expect(() => fs.generateSteps([1, 2, 3, 4], { target: '10' })).toThrow(TypeError);
    // no target: the example target, 0
    expect(answer(fs.generateSteps([1, 0, -1, 0]))).toEqual([[-1, 0, 0, 1]]);
  });
});

describe('4Sum — steps', () => {
  it('[0, 0, 0, 0]: copy, sort, result, both prunings pass at each level, one quadruplet, then every loop ends', () => {
    expect(refs(run([0, 0, 0, 0]))).toEqual([
      'fn-entry', 'copy', 'sort', 'init-result',
      'outer-loop:true', 'check-dup-i:false', 'check-min-i:false', 'check-max-i:false',
      'j-loop:true', 'check-dup-j:false', 'check-min-j:false', 'check-max-j:false', 'init-pointers',
      'inner-loop:true', 'calc-sum', 'check-target:true', 'record', 'found-left', 'found-right',
      'skip-left-check:false', 'skip-right-check:false',
      'inner-loop:false',
      'j-loop:false',
      'outer-loop:false',
      'return', 'return',
    ]);
  });

  it('the copy is shown unsorted, the sort step shows the ascending copy, and every later step keeps it', () => {
    const steps = run([3, -1, 2, -2, 0]);
    expect(steps.find(s => s.codeRef === 'copy')!.state).toEqual([3, -1, 2, -2, 0]);
    const k = steps.findIndex(s => s.codeRef === 'sort');
    for (const s of steps.slice(k)) expect(s.state).toEqual([-2, -1, 0, 2, 3]);
  });

  it('a sum below the target moves left, above it moves right', () => {
    const steps = run([-4, -1, 1, 2, 5, 6], 0);
    const less = steps.filter(s => s.codeRef === 'check-less');
    for (const c of less) {
      expect(steps[c.id + 1].codeRef).toBe(c.result === 'true' ? 'move-left' : 'move-right');
      expect((c.variables!.sum as number) < 0).toBe(c.result === 'true');
      expect(c.comparedValues).toEqual({ val1: c.variables!.sum, val2: 0 });
    }
    expect(less.map(s => s.result)).toEqual(expect.arrayContaining(['true', 'false']));
  });

  it('a repeated first value and a repeated second value are each skipped with continue', () => {
    const steps = run([-1, -1, 0, 0, 0, 1, 1]);
    const dupI = steps.filter(s => s.codeRef === 'check-dup-i' && s.result === 'true');
    expect(dupI[0].variables).toMatchObject({ i: 1, 'nums[i]': -1, 'nums[i - 1]': -1 });
    expect(steps[dupI[0].id + 1].codeRef).toBe('skip-i');
    expect(steps[dupI[0].id + 2]).toMatchObject({ codeRef: 'outer-loop', variables: expect.objectContaining({ i: 2 }) });

    const dupJ = steps.filter(s => s.codeRef === 'check-dup-j' && s.result === 'true');
    expect(dupJ.length).toBeGreaterThan(0);
    for (const d of dupJ) {
      const { i, j } = d.variables as Record<string, number>;
      expect(j).toBeGreaterThan(i + 1);
      expect(d.state[j]).toBe(d.state[j - 1]);
      expect(steps[d.id + 1].codeRef).toBe('skip-j');
      expect(steps[d.id + 2]).toMatchObject({ codeRef: 'j-loop', variables: expect.objectContaining({ i, j: j + 1 }) });
    }
    expect(answer(steps)).toEqual([[-1, -1, 1, 1], [-1, 0, 0, 1]]);
  });

  it('after a quadruplet, repeated left and right values are skipped, until the pointers meet', () => {
    // i = 0 (-2), j = 1 (0): [-2, 0, 0, 2] at left 2, right 7; then left 3 → 5 past the 0s, right 6 → 5 past one 2,
    // where left < right stops it
    const all = run([-2, 0, 0, 0, 0, 2, 2, 2]);
    const steps = all.filter(s => s.variables?.i === 0 && s.variables?.j === 1);
    expect(steps.filter(s => s.codeRef === 'skip-left').map(s => s.variables!.left)).toEqual([4, 5]);
    expect(steps.filter(s => s.codeRef === 'skip-right').map(s => s.variables!.right)).toEqual([5]);
    expect(steps.filter(s => s.codeRef === 'skip-right-check').at(-1)).toMatchObject({ result: 'false', variables: expect.objectContaining({ left: 5, right: 5 }) });
    // and the four 0s make a quadruplet of their own (i = 1)
    expect(answer(all)).toEqual([[-2, 0, 0, 2], [0, 0, 0, 0]]);
  });

  it('the first value: break once even its smallest sum is above the target', () => {
    const steps = run([1, 2, 3, 4, 5], 5);
    const check = steps.find(s => s.codeRef === 'check-min-i')!;
    expect(check).toMatchObject({ result: 'true', indices: [0, 1, 2, 3], comparedValues: { val1: 10, val2: 5 }, variables: expect.objectContaining({ smallest: 10 }) });
    expect(steps[check.id + 1]).toMatchObject({ codeRef: 'stop-i', type: 'loop-condition', result: 'false' });
    expect(steps[check.id + 2].codeRef).toBe('return');
  });

  it('the first value: continue when even its largest sum is below the target', () => {
    const steps = run([-10, 1, 2, 3, 4], 9);
    const check = steps.find(s => s.codeRef === 'check-max-i')!;
    expect(check).toMatchObject({ result: 'true', indices: [0, 2, 3, 4], comparedValues: { val1: -1, val2: 9 } });
    expect(steps[check.id + 1].codeRef).toBe('skip-max-i');
    // the next first value is too large for the target, so the search ends without a two-pointer pass
    expect(refs(steps.slice(check.id + 2))).toEqual(['outer-loop:true', 'check-dup-i:false', 'check-min-i:true', 'stop-i:false', 'return', 'return']);
    expect(steps.some(s => s.codeRef === 'init-pointers')).toBe(false);
  });

  it('the second value: break (to the next i) once its smallest sum is above the target', () => {
    const steps = run([-6, 0, 4, 5, 6, 7], 4);
    const check = steps.find(s => s.codeRef === 'check-min-j' && s.result === 'true')!;
    expect(check).toMatchObject({ indices: [0, 2, 3, 4], variables: expect.objectContaining({ i: 0, j: 2, smallest: 9 }) });
    expect(steps[check.id + 1]).toMatchObject({ codeRef: 'stop-j', type: 'loop-condition', result: 'false' });
    expect(steps[check.id + 2]).toMatchObject({ codeRef: 'outer-loop', variables: expect.objectContaining({ i: 1 }) });
    expect(steps[check.id + 2].variables).not.toHaveProperty('j');
    expect(answer(steps)).toEqual([[-6, 0, 4, 6]]);
  });

  it('the second value: continue when its largest sum is below the target', () => {
    const steps = run([-6, -5, 1, 2, 3], 0);
    const check = steps.find(s => s.codeRef === 'check-max-j' && s.result === 'true')!;
    expect(check).toMatchObject({ indices: [0, 1, 3, 4], comparedValues: { val1: -6, val2: 0 }, variables: expect.objectContaining({ i: 0, j: 1 }) });
    expect(steps[check.id + 1].codeRef).toBe('skip-max-j');
    expect(steps[check.id + 2]).toMatchObject({ codeRef: 'j-loop', result: 'true', variables: expect.objectContaining({ j: 2 }) });
    expect(answer(steps)).toEqual([[-6, 1, 2, 3]]);
  });

  it('every snapshot is accurate: pointers match variables, sums match the bars, and the rows are the quadruplets so far', () => {
    // traces run to over a thousand steps, so mismatches are collected and asserted once (an expect per field is too slow)
    const problems: string[] = [];
    const check = (ok: boolean, what: string) => {
      if (!ok && problems.length < 20) problems.push(what);
    };
    const rng = makeRng(7);
    for (let t = 0; t < 300; t++) {
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 13) - 6);
      const target = Math.floor(rng() * 9) - 4;
      const steps = run(nums, target);
      const rows: number[][] = [];
      for (const s of steps) {
        const where = () => `${JSON.stringify(nums)} target ${target} step ${s.id} (${s.codeRef})`;
        const v = s.variables as Record<string, number>;
        check(v.target === target, `${where()}: target ${v.target}`);
        for (const [k, p] of Object.entries(s.pointers ?? {})) check(v[k] === p, `${where()}: pointer ${k} ${p} vs variable ${v[k]}`);
        if (s.codeRef === 'calc-sum') {
          const { i, j, left, right, sum } = v;
          check(i < j && j < left && left < right, `${where()}: order ${i} ${j} ${left} ${right}`);
          check(sum === s.state[i] + s.state[j] + s.state[left] + s.state[right], `${where()}: sum ${sum}`);
          check(card(s, 'sum').value === sum, `${where()}: sum card`);
          check(key(s.indices!) === key([i, j, left, right]), `${where()}: indices ${s.indices}`);
        }
        if (/^check-(min|max)-[ij]$/.test(s.codeRef!)) {
          const bound = s.indices!.reduce((acc, k) => acc + s.state[k], 0);
          check(s.comparedValues?.val1 === bound && s.comparedValues?.val2 === target, `${where()}: compared ${JSON.stringify(s.comparedValues)}`);
          check(s.result === String(s.codeRef!.startsWith('check-min') ? bound > target : bound < target), `${where()}: result ${s.result}`);
        }
        if (s.codeRef === 'record') rows.push([s.state[v.i], s.state[v.j], s.state[v.left], s.state[v.right]]);
        check(JSON.stringify((s.buffers ?? []).map(b => b.values)) === JSON.stringify(rows), `${where()}: rows`);
        check(card(s, 'found').value === rows.length, `${where()}: found card`);
        for (const name of ['i', 'j', 'left', 'right'] as const) {
          const k = s.pointers?.[name];
          if (k !== undefined && k < s.state.length) check(card(s, `nums[${name}]`).value === s.state[k], `${where()}: nums[${name}] card`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('ends with found (the bars the quadruplets use) or not-found, then complete with the quadruplets in words', () => {
    const steps = run([1, 0, -1, 0, -2, 2]);
    expect(steps.at(-2)!.type).toBe('found');
    expect(deriveOutcome(steps, steps.length - 1)).toBe('found');
    // sorted: [-2, -1, 0, 0, 1, 2]; every position is used by some quadruplet
    expect(steps.at(-1)!.sortedIndices).toEqual([0, 1, 2, 3, 4, 5]);
    expect(steps.at(-1)!.outcomeText).toBe('3 quadruplets sum to 0: [[-2, -1, 1, 2], [-2, 0, 0, 2], [-1, 0, 0, 1]]');
    expect(run([4, 1, 3, 2], 10).at(-1)!.outcomeText).toBe('1 quadruplet sums to 10: [[1, 2, 3, 4]]');

    const none = run([1, 2, 3, 4], -3);
    expect(none.at(-2)!.type).toBe('not-found');
    expect(deriveOutcome(none, none.length - 1)).toBe('not-found');
    expect(none.at(-1)!.outcomeText).toBe('No quadruplet sums to -3');
  });

  it('i, j, left and right are drawn under their bars; the four summed bars are highlighted', () => {
    const steps = run([1, 0, -1, 0, -2, 2]);
    const s = steps.find(x => x.codeRef === 'calc-sum')!;
    const v = deriveStepVisuals(s, { positionPointers: fs.positionPointers });
    const { i, j, left, right } = s.variables as Record<string, number>;
    expect(v.bars[i].pointers).toEqual(['i']);
    expect(v.bars[j].pointers).toEqual(['j']);
    expect(v.bars[left].pointers).toEqual(['left']);
    expect(v.bars[right].pointers).toEqual(['right']);
    expect([i, j, left, right].every(k => v.bars[k].inRange && v.bars[k].role === 'assign')).toBe(true);
  });

  it('an empty or short array: no highlighted bars, no rows, and a reason in words', () => {
    for (const nums of [[], [1], [1, 2, 3]]) {
      const steps = run(nums, 6);
      for (const s of steps) {
        expect(s.indices ?? []).toEqual([]);
        expect(s.buffers ?? []).toEqual([]);
        expect(`${s.message} ${s.explanation}`).not.toMatch(/undefined|NaN/);
      }
      expect(steps.find(s => s.codeRef === 'outer-loop')!.explanation).toBe(`A quadruplet needs four values; this array has ${nums.length}.`);
      expect(steps.at(-1)!.outcomeText).toBe('No quadruplet sums to 6');
    }
  });
});

describe('4Sum — code listings', () => {
  const line = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(fs, lang)[fs.lineMap[lang][ref] - 1];

  it('every codeRef the trace uses resolves in all four languages', () => {
    const used = new Set([
      ...run([-1, -1, 0, 0, 0, 1, 1, 2, -2, 3]),
      ...run([1, 2, 3, 4, 5], 5),
      ...run([-10, 1, 2, 3, 4], 9),
      ...run([-6, 0, 4, 5, 6, 7], 4),
      ...run([-6, -5, 1, 2, 3]),
      ...run([-2, 0, 0, 0, 0, 2, 2, 2]),
      ...run([-4, -1, 1, 2, 5, 6]),
    ].map(s => s.codeRef!));
    expect(used).toEqual(new Set(Object.keys(fs.lineMap.cpp)));
    for (const lang of LANGUAGES) for (const ref of used) expect(resolveCodeRef(fs, lang, ref), `${lang} ${ref}`).not.toBeNull();
  });

  it('C, C++ and Java add the four values in a wider type, in the sum and both prunings; every listing sorts a copy', () => {
    for (const ref of ['calc-sum', 'check-min-i', 'check-max-i', 'check-min-j', 'check-max-j']) {
      expect(line('c', ref), ref).toContain('(long long)nums[i]');
      expect(line('cpp', ref), ref).toContain('(long long)nums[i]');
      expect(line('java', ref), ref).toContain('(long) nums[i]');
    }
    expect(line('c', 'calc-sum')).toContain('long long sum =');
    expect(line('java', 'calc-sum')).toContain('long sum =');
    expect(fs.code.c).toContain('free(nums);');
    for (const lang of LANGUAGES) {
      expect(line(lang, 'fn-entry'), lang).toMatch(/target/);
      expect(line(lang, 'sort')).not.toMatch(/\binput\b/);
    }
  });
});

describe('4Sum — input and integration', () => {
  it('any array of up to 16 whole numbers and a whole-number target; negatives allowed; nothing is sorted or required to be', () => {
    expect(validateAlgorithmInput(fs, [1, 0, -1, 0, -2, 2], 0).ok).toBe(true);
    expect(validateAlgorithmInput(fs, [], 0).ok).toBe(true);
    expect(validateAlgorithmInput(fs, [-999, 999], -999).ok).toBe(true);
    expect(validateAlgorithmInput(fs, Array(17).fill(0), 0).ok).toBe(false);
    expect(validateAlgorithmInput(fs, [1, 2, 3, 4], null)).toMatchObject({ ok: false, message: 'Enter a value for "Target sum".' });
    expect(fs.inputSpec?.sortedRequired).toBeUndefined();
    expect(fs.inputSpec?.target?.defaultValue).toBe(0);
    expect(fs.inputSpec?.randomValues).toEqual([-9, 9]);
  });

  it('registered once, listed in ARRAYS after 3Sum, with the LeetCode example and O(n³) time', () => {
    expect(getAlgorithmDefinition('four-sum')).toBe(fs);
    expect(ALGORITHM_NAV.filter(a => a.id === 'four-sum')).toEqual([
      expect.objectContaining({ name: '4Sum', category: 'ARRAYS', implemented: true }),
    ]);
    const order = ALGORITHM_NAV.map(a => a.id);
    expect(order.indexOf('four-sum')).toBe(order.indexOf('three-sum') + 1);
    expect(fs.defaultInput).toEqual([1, 0, -1, 0, -2, 2]);
    expect(fs.complexity).toMatchObject({ average: 'O(n³)', worst: 'O(n³)' });
    expect(buildExecution('four-sum', [1, 0, -1, 0, -2, 2], undefined, { target: 0 }).status).toBe('ok');
  });
});
