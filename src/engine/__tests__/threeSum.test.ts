import { describe, it, expect } from 'vitest';
import { threeSumDefinition as ts } from '../algorithms/threeSum';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { deriveOutcome, deriveStepVisuals } from '../../components/visualizer/barVisuals';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// 3Sum: sort a copy, fix i, close in with left / right; duplicates skipped at both levels; stop once nums[i] > 0.
const run = (nums: number[]) => ts.generateSteps([...nums]);
/** the triplets the trace reports: the result rows on its last step */
const answer = (steps: ExecutionStep[]) => (steps.at(-1)!.buffers ?? []).map(b => b.values);
/** an oracle written differently from the generator: every index triple, kept once per distinct sorted value triple */
function bruteForce(nums: number[]): number[][] {
  const seen = new Map<string, number[]>();
  for (let a = 0; a < nums.length; a++)
    for (let b = a + 1; b < nums.length; b++)
      for (let c = b + 1; c < nums.length; c++)
        if (nums[a] + nums[b] + nums[c] === 0) {
          const t = [nums[a], nums[b], nums[c]].sort((x, y) => x - y);
          seen.set(t.join(','), t);
        }
  return [...seen.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
}
const card = (s: ExecutionStep, name: string) => s.tracker!.find(c => c.name === name)!;

describe('3Sum — answers', () => {
  it.each([
    ['the example', [-1, 0, 1, 2, -1, -4], [[-1, -1, 2], [-1, 0, 1]]],
    ['empty', [], []],
    ['one value', [0], []],
    ['two values', [-1, 1], []],
    ['three zeros', [0, 0, 0], [[0, 0, 0]]],
    ['many zeros: one triplet', [0, 0, 0, 0, 0], [[0, 0, 0]]],
    ['all positive', [1, 2, 3, 4], []],
    ['all negative', [-4, -3, -2, -1], []],
    ['no solution', [0, 1, 1], []],
    ['repeated values', [-2, 0, 0, 2, 2, -2], [[-2, 0, 2]]],
    ['several triplets', [-4, -2, -2, -2, 0, 1, 2, 2, 2, 3, 3, 4, 4, 6, 6], [[-4, -2, 6], [-4, 0, 4], [-4, 1, 3], [-4, 2, 2], [-2, -2, 4], [-2, 0, 2]]],
    ['the extremes', [-999, 999, 0, -998, 998, 1], [[-999, 0, 999], [-999, 1, 998], [-998, 0, 998]]],
  ])('%s', (_name, nums, expected) => {
    expect(answer(run(nums as number[]))).toEqual(expected);
  });

  it('agrees with a brute force on 3,000 random arrays; triplets are unique and ascending; the input is not mutated', () => {
    const rng = makeRng(15);
    for (let t = 0; t < 3000; t++) {
      const spread = [2, 4, 9, 999][t % 4];
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * (2 * spread + 1)) - spread);
      const before = [...nums];
      const found = answer(run(nums));
      expect(found, JSON.stringify(nums)).toEqual(bruteForce(nums));
      expect(new Set(found.map(f => f.join(','))).size).toBe(found.length);
      for (const f of found) expect(f).toEqual([...f].sort((x, y) => x - y));
      expect(nums).toEqual(before);
    }
  });
});

describe('3Sum — steps', () => {
  it('[-1, 0, 1]: copy, sort, result, one fixed value, one triplet, both pointers past it, then the loops end', () => {
    expect(run([1, 0, -1]).map(s => `${s.codeRef}${s.result ? `:${s.result}` : ''}`)).toEqual([
      'fn-entry', 'copy', 'sort', 'init-result',
      'outer-loop:true', 'check-dup-i:false', 'check-positive:false', 'init-pointers',
      'inner-loop:true', 'calc-sum', 'check-zero:true', 'record', 'found-left', 'found-right',
      'skip-left-check:false', 'skip-right-check:false',
      'inner-loop:false',
      'outer-loop:false',
      'return', 'return',
    ]);
  });

  it('the copy is shown unsorted, the sort step shows the ascending copy, and every later step keeps it', () => {
    const steps = run([3, -1, 2, -2]);
    expect(steps.find(s => s.codeRef === 'copy')!.state).toEqual([3, -1, 2, -2]);
    const k = steps.findIndex(s => s.codeRef === 'sort');
    for (const s of steps.slice(k)) expect(s.state).toEqual([-2, -1, 2, 3]);
  });

  it('a sum below 0 moves left, above 0 moves right', () => {
    const steps = run([-4, 1, 2, 5]);
    const less = steps.filter(s => s.codeRef === 'check-less');
    for (const c of less) {
      const next = steps[c.id + 1];
      expect(next.codeRef).toBe(c.result === 'true' ? 'move-left' : 'move-right');
      expect((c.variables!.sum as number) < 0).toBe(c.result === 'true');
    }
    expect(less.map(s => s.result)).toEqual(expect.arrayContaining(['true', 'false']));
  });

  it('a repeated fixed value is skipped with continue', () => {
    const steps = run([-1, -1, 0, 1]);
    const dup = steps.filter(s => s.codeRef === 'check-dup-i' && s.result === 'true');
    expect(dup).toHaveLength(1);
    expect(dup[0].variables).toMatchObject({ i: 1, 'nums[i]': -1, 'nums[i - 1]': -1 });
    expect(steps[dup[0].id + 1].codeRef).toBe('skip-i');
    expect(steps[dup[0].id + 2]).toMatchObject({ codeRef: 'outer-loop', variables: expect.objectContaining({ i: 2 }) });
  });

  it('after a triplet, repeated left and right values are skipped, until the pointers meet', () => {
    // [-2, 0, 2] at (0, 1, 6); then left 2 → 4 past the 0s, right 5 → 4 past one 2, where left < right stops it
    const steps = run([-2, 0, 0, 0, 2, 2, 2]);
    expect(steps.filter(s => s.codeRef === 'skip-left').map(s => s.variables!.left)).toEqual([3, 4]);
    expect(steps.filter(s => s.codeRef === 'skip-right').map(s => s.variables!.right)).toEqual([4]);
    expect(steps.filter(s => s.codeRef === 'skip-right-check' && s.variables!.i === 0).at(-1)).toMatchObject({ result: 'false', variables: expect.objectContaining({ left: 4, right: 4 }) });
    // and the three 0s make a triplet of their own (i = 1)
    expect(answer(steps)).toEqual([[-2, 0, 2], [0, 0, 0]]);
  });

  it('stops once the fixed value is positive', () => {
    const steps = run([-3, 1, 2, 4, 5]);
    const check = steps.find(s => s.codeRef === 'check-positive' && s.result === 'true')!;
    expect(check.variables).toMatchObject({ i: 1, 'nums[i]': 1 });
    expect(steps[check.id + 1]).toMatchObject({ codeRef: 'stop', type: 'loop-condition', result: 'false' });
    expect(steps[check.id + 2].codeRef).toBe('return');
    // i = 2 is never tried, though i < n - 2 still holds
    expect(steps.some(s => s.codeRef === 'outer-loop' && s.variables!.i === 2)).toBe(false);
  });

  it('every snapshot is accurate: pointers match variables, the sum matches the bars, and the rows are the triplets so far', () => {
    const rng = makeRng(7);
    for (let t = 0; t < 300; t++) {
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 13) - 6);
      const steps = run(nums);
      const rows: number[][] = [];
      for (const s of steps) {
        const where = `${JSON.stringify(nums)} step ${s.id} (${s.codeRef})`;
        for (const [k, v] of Object.entries(s.pointers ?? {})) expect(s.variables![k], where).toBe(v);
        if (s.codeRef === 'calc-sum') {
          const { i, left, right, sum } = s.variables as Record<string, number>;
          expect(i < left && left < right, where).toBe(true);
          expect(sum, where).toBe(s.state[i] + s.state[left] + s.state[right]);
          expect(card(s, 'sum').value).toBe(sum);
          expect(s.indices).toEqual([i, left, right]);
        }
        if (s.codeRef === 'record') {
          const { i, left, right } = s.variables as Record<string, number>;
          rows.push([s.state[i], s.state[left], s.state[right]]);
        }
        expect((s.buffers ?? []).map(b => b.values), where).toEqual(rows);
        expect(card(s, 'found').value).toBe(rows.length);
        for (const name of ['i', 'left', 'right'] as const) {
          const k = s.pointers?.[name];
          if (k !== undefined && k < s.state.length) expect(card(s, `nums[${name}]`).value, where).toBe(s.state[k]);
        }
      }
    }
  });

  it('ends with found (the bars the triplets use) or not-found, then complete with the triplets in words', () => {
    const steps = run([-1, 0, 1, 2, -1, -4]);
    expect(steps.at(-2)!.type).toBe('found');
    expect(deriveOutcome(steps, steps.length - 1)).toBe('found');
    // sorted: [-4, -1, -1, 0, 1, 2]; [-1, -1, 2] uses 1, 2, 5 and [-1, 0, 1] uses 1, 3, 4
    expect(steps.at(-1)!.sortedIndices).toEqual([1, 2, 3, 4, 5]);
    expect(steps.at(-1)!.outcomeText).toBe('2 triplets sum to 0: [[-1, -1, 2], [-1, 0, 1]]');

    const none = run([1, 2, 3]);
    expect(none.at(-2)!.type).toBe('not-found');
    expect(deriveOutcome(none, none.length - 1)).toBe('not-found');
    expect(none.at(-1)!.outcomeText).toBe('No triplet sums to 0');
  });

  it('i, left and right are drawn under their bars; i stays in the working range while the pointers move', () => {
    const steps = run([-1, 0, 1, 2, -1, -4]);
    const s = steps.find(x => x.codeRef === 'calc-sum')!;
    const v = deriveStepVisuals(s, { positionPointers: ts.positionPointers });
    const { i, left, right } = s.variables as Record<string, number>;
    expect(v.bars[i].pointers).toEqual(['i']);
    expect(v.bars[left].pointers).toEqual(['left']);
    expect(v.bars[right].pointers).toEqual(['right']);
    expect(v.bars[i].inRange).toBe(true);
    expect([i, left, right].every(k => v.bars[k].role === 'assign')).toBe(true);
  });

  it('an empty array: no highlighted bars, no rows, and i is listed off the array', () => {
    const steps = run([]);
    for (const s of steps) {
      expect(s.indices ?? []).toEqual([]);
      expect(s.buffers ?? []).toEqual([]);
      expect(`${s.message} ${s.explanation}`).not.toMatch(/undefined|NaN/);
    }
    expect(steps.find(s => s.codeRef === 'outer-loop')!.explanation).toBe('A triplet needs three values; this array has 0.');
  });
});

describe('3Sum — code listings', () => {
  it('every codeRef resolves in all four languages', () => {
    const refs = new Set(run([-1, 0, 1, 2, -1, -4, 0, 0, 3, -3]).map(s => s.codeRef!));
    for (const lang of LANGUAGES) for (const ref of refs) expect(resolveCodeRef(ts, lang, ref), `${lang} ${ref}`).not.toBeNull();
  });

  it('C, C++ and Java add the three values in a wider type; every listing works on a sorted copy', () => {
    const line = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(ts, lang)[ts.lineMap[lang][ref] - 1];
    expect(line('c', 'calc-sum')).toContain('long long sum = (long long)nums[i]');
    expect(line('cpp', 'calc-sum')).toContain('long long sum = (long long)nums[i]');
    expect(line('java', 'calc-sum')).toContain('long sum = (long) nums[i]');
    expect(ts.code.c).toContain('free(nums);');
    for (const lang of LANGUAGES) expect(line(lang, 'sort')).not.toMatch(/\binput\b/);
  });
});

describe('3Sum — input and integration', () => {
  it('any array of up to 16 whole numbers; negatives allowed; nothing is sorted or required to be', () => {
    expect(validateAlgorithmInput(ts, [-1, 0, 1, 2, -1, -4], null).ok).toBe(true);
    expect(validateAlgorithmInput(ts, [], null).ok).toBe(true);
    expect(validateAlgorithmInput(ts, [-999, 999], null).ok).toBe(true);
    expect(validateAlgorithmInput(ts, Array(17).fill(0), null).ok).toBe(false);
    expect(ts.inputSpec?.sortedRequired).toBeUndefined();
    expect(ts.inputSpec?.target).toBeUndefined();
    expect(ts.inputSpec?.randomValues).toEqual([-9, 9]);
    expect(() => run([1.5, 0, -1.5])).toThrow(TypeError);
  });

  it('registered once, listed in ARRAYS, with the LeetCode example and O(n²) time', () => {
    expect(getAlgorithmDefinition('three-sum')).toBe(ts);
    expect(ALGORITHM_NAV.filter(a => a.id === 'three-sum')).toEqual([
      expect.objectContaining({ name: '3Sum', category: 'ARRAYS', implemented: true }),
    ]);
    expect(ts.defaultInput).toEqual([-1, 0, 1, 2, -1, -4]);
    expect(ts.complexity).toMatchObject({ average: 'O(n²)', worst: 'O(n²)' });
    expect(buildExecution('three-sum', [-1, 0, 1, 2, -1, -4]).status).toBe('ok');
  });
});
