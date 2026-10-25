import { describe, it, expect } from 'vitest';
import { twoSumDefinition as twoSum } from '../algorithms/twoSum';
import { buildExecution } from '../buildExecution';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { deriveOutcome } from '../../components/visualizer/barVisuals';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Two Sum with a hash map: every iteration, the complement, each lookup and map write, and the returned pair.
const run = (nums: number[], target: number) => twoSum.generateSteps([...nums], { target });
const answer = (steps: ExecutionStep[]) => {
  const found = steps.find(s => s.type === 'found');
  return found ? [found.pointers!.j, found.pointers!.i] : null;
};
/**
 * An oracle written differently from the generator: the pair (j, i) with the smallest i, and for that i the LATEST
 * j < i (a repeated value maps to its latest index), with nums[j] + nums[i] = target; null when none.
 */
function oracle(nums: number[], target: number): [number, number] | null {
  for (let i = 0; i < nums.length; i++) for (let j = i - 1; j >= 0; j--) if (nums[j] + nums[i] === target) return [j, i];
  return null;
}

describe('Two Sum — answers', () => {
  it.each([
    ['the example', [3, 8, 11, 5, 2, 7, 4], 9, [4, 5]],
    ['a duplicate pair', [3, 3], 6, [0, 1]],
    ['never the same element twice', [3, 2, 4], 6, [1, 2]],
    ['negative values', [-3, 4, 3, 90], 0, [0, 2]],
    ['a negative target', [5, -7, 1, -2], -9, [1, 3]],
    ['the extremes', [-999, 999], 0, [0, 1]],
    ['repeated values: the latest earlier index', [5, 5, 5], 10, [0, 1]],
    ['no solution', [1, 2, 3], 7, null],
    ['one element', [4], 8, null],
    ['empty', [], 5, null],
  ])('%s', (_name, nums, target, expected) => {
    expect(answer(run(nums as number[], target as number))).toEqual(expected);
  });

  it('agrees with an independent search on 2,000 random arrays (duplicates, negatives, no solution)', () => {
    const rng = makeRng(42);
    for (let k = 0; k < 2000; k++) {
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 41) - 20);
      const target = Math.floor(rng() * 61) - 30;
      const got = answer(run(nums, target));
      expect(got, JSON.stringify({ nums, target })).toEqual(oracle(nums, target));
      if (got) {
        expect(got[0]).toBeLessThan(got[1]);
        expect(nums[got[0]] + nums[got[1]]).toBe(target);
      }
    }
  });

  it('several valid pairs: returns the first the scan completes and says how many others exist', () => {
    const steps = run([1, 8, 2, 7, 3, 6], 9); // [0,1], [2,3], [4,5]
    expect(answer(steps)).toEqual([0, 1]);
    expect(steps.find(s => s.type === 'found')!.explanation).toBe(
      'The first pair the scan completes. 2 other pairs also sum to 9 (e.g. [2, 3]); one answer is enough, so the search stops here.'
    );
  });
});

describe('Two Sum — steps', () => {
  it('the example: each iteration computes the complement, looks it up, then stores nums[i]; the 6th lookup hits', () => {
    const steps = run([3, 8, 11, 5, 2, 7, 4], 9);
    const refs = steps.map(s => s.codeRef);
    const iteration = ['loop-condition', 'calc-complement', 'lookup', 'store'];
    expect(refs).toEqual([
      'fn-entry', 'init-map',
      ...Array(5).fill(iteration).flat(),
      'loop-condition', 'calc-complement', 'lookup', 'return-pair',
      'return-pair',
    ]);
    expect(steps.filter(s => s.codeRef === 'calc-complement').map(s => s.variables!.complement)).toEqual([6, 1, -2, 4, 7, 2]);
    expect(steps.filter(s => s.codeRef === 'lookup').map(s => s.result)).toEqual(['false', 'false', 'false', 'false', 'false', 'true']);
  });

  it('the map: empty after creation, one entry per store in insertion order; lookups and writes are marked', () => {
    const steps = run([3, 8, 11, 5, 2, 7, 4], 9);
    expect(steps[0].hashMap).toBeUndefined();
    expect(steps[1].hashMap).toMatchObject({ name: 'seen', keyLabel: 'value', valueLabel: 'index', entries: [] });
    const stores = steps.filter(s => s.codeRef === 'store');
    expect(stores.map(s => s.hashMap!.write)).toEqual([3, 8, 11, 5, 2].map(key => ({ key, kind: 'insert' })));
    expect(stores.at(-1)!.hashMap!.entries).toEqual([
      { key: 3, value: 0 }, { key: 8, value: 1 }, { key: 11, value: 2 }, { key: 5, value: 3 }, { key: 2, value: 4 },
    ]);
    const lookups = steps.filter(s => s.codeRef === 'lookup').map(s => s.hashMap!.lookup);
    expect(lookups.at(0)).toEqual({ key: 6, found: false });
    expect(lookups.at(-1)).toEqual({ key: 2, found: true });
  });

  it('a repeated value that does not complete a pair updates its index', () => {
    const steps = run([4, 1, 4], 100);
    const writes = steps.filter(s => s.codeRef === 'store').map(s => s.hashMap!.write);
    expect(writes).toEqual([{ key: 4, kind: 'insert' }, { key: 1, kind: 'insert' }, { key: 4, kind: 'update' }]);
    const update = steps.filter(s => s.codeRef === 'store').at(-1)!;
    expect(update.type).toBe('update');
    expect(update.hashMap!.entries).toEqual([{ key: 4, value: 2 }, { key: 1, value: 1 }]);
    expect(update.explanation).toContain('now maps to the later index 2');
  });

  it('a value whose complement is itself is not paired with itself', () => {
    const lookup = run([3, 2, 4], 6).find(s => s.codeRef === 'lookup')!;
    expect(lookup.result).toBe('false');
    expect(lookup.explanation).toContain('never used twice');
  });

  it('the bars: i on the current element; on a hit the pair (j, i) is highlighted and locked as found', () => {
    const steps = run([3, 8, 11, 5, 2, 7, 4], 9);
    const hit = steps.find(s => s.codeRef === 'lookup' && s.result === 'true')!;
    expect(hit).toMatchObject({ pointers: { i: 5, j: 4 }, indices: [4, 5] });
    const end = steps.at(-1)!;
    expect(end).toMatchObject({ type: 'complete', sortedIndices: [4, 5] });
    expect(deriveOutcome(steps, steps.length - 1)).toBe('found');
    expect(end.outcomeText).toBe('Pair found: indices [4, 5] — 2 + 7 = 9');
    expect(twoSum.positionPointers).toEqual(['i', 'j']);
  });

  it('the tracker cards: target, i, nums[i] and complement, with the value being written marked', () => {
    const calc = run([3, 8], 9).find(s => s.codeRef === 'calc-complement')!;
    expect(calc.tracker).toEqual([
      { name: 'target', value: 9 },
      { name: 'i', value: 0 },
      { name: 'nums[i]', value: 3, role: 'current' },
      { name: 'complement', value: 6, role: 'changed' },
    ]);
  });

  it('no solution: the loop ends, "not found", and the outcome says so', () => {
    const steps = run([1, 2, 3], 7);
    expect(steps.at(-3)).toMatchObject({ codeRef: 'loop-condition', result: 'false' });
    expect(steps.at(-2)).toMatchObject({ type: 'not-found', codeRef: 'return-none', explanation: 'None of the 3 pairs sums to 7.' });
    expect(deriveOutcome(steps, steps.length - 1)).toBe('not-found');
    expect(steps.at(-1)!.outcomeText).toBe('No pair sums to 7');
    expect(run([], 1).at(-2)!.explanation).toBe('A pair needs two elements; this array has 0.');
  });

  it('O(n): with no solution, exactly 4 steps per element plus 5, and the map never holds more than n entries', () => {
    const rng = makeRng(3);
    for (let k = 0; k < 200; k++) {
      const nums = Array.from({ length: 16 }, () => Math.floor(rng() * 2000) - 999);
      const steps = run(nums, 5000); // out of reach: every element is visited
      // create the map (2 steps), then per element: loop check, complement, lookup, store; then the last loop check,
      // "not found" and "complete"
      expect(steps.length).toBe(4 * nums.length + 5);
      expect(Math.max(...steps.map(s => s.hashMap?.entries.length ?? 0))).toBeLessThanOrEqual(nums.length);
    }
  });

  it('every step keeps the array unchanged and is numbered from 0', () => {
    run([3, 8, 11, 5, 2, 7, 4], 9).forEach((s, k) => {
      expect(s.id).toBe(k);
      expect(s.state).toEqual([3, 8, 11, 5, 2, 7, 4]);
    });
  });
});

describe('Two Sum — code lines in C, C++, Java and Python', () => {
  it('each step highlights its statement in every language', () => {
    const expected: Record<string, RegExp> = {
      'fn-entry': /two_?sum\(/i,
      'init-map': /seen/,
      'loop-condition': /^\s*for\b/,
      'calc-complement': /complement = target - nums\[i\]/,
      lookup: /^\s*if\b/,
      'return-pair': /return/,
      store: /i\)?;?$/,
      'return-none': /return/,
    };
    const refs = new Set([...run([3, 8, 11, 5, 2, 7, 4], 9), ...run([1, 2], 9)].map(s => s.codeRef!));
    expect([...refs].sort()).toEqual(Object.keys(expected).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(twoSum, lang);
      for (const ref of refs) expect(lines[resolveCodeRef(twoSum, lang, ref)! - 1], `${lang} ${ref}`).toMatch(expected[ref]);
    }
  });

  it('C has no built-in map: the open-addressing table is created, probed and freed around the same steps', () => {
    expect(twoSum.code.c).toMatch(/static unsigned slot\(const Map \*m, int key\)/);
    expect(twoSum.lineLeads?.c).toEqual({ 'init-map': 2, lookup: 1, 'return-pair': 2, store: 1, 'return-none': 1 });
  });
});

describe('Two Sum — input', () => {
  it('takes any array up to the size limit (unsorted is fine) and a whole-number target', () => {
    expect(validateAlgorithmInput(twoSum, [9, 1, 5], 6).ok).toBe(true);
    expect(validateAlgorithmInput(twoSum, [], 6).ok).toBe(true);
    expect(validateAlgorithmInput(twoSum, [9, 1, 5], null)).toMatchObject({ ok: false, message: 'Enter a value for "Target sum".' });
  });

  it('a direct call: no target uses the example target; null or a fraction is refused', () => {
    expect(answer(twoSum.generateSteps([3, 8, 11, 5, 2, 7, 4]))).toEqual([4, 5]);
    expect(() => twoSum.generateSteps([1, 2], { target: null })).toThrow(TypeError);
    expect(() => twoSum.generateSteps([1, 2], { target: 1.5 })).toThrow(TypeError);
    expect(buildExecution('two-sum', [3, 8, 11, 5, 2, 7, 4]).status).toBe('ok');
  });
});
