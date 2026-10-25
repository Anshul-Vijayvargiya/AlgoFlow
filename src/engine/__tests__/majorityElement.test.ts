import { describe, it, expect } from 'vitest';
import { majorityElementDefinition as majority } from '../algorithms/majorityElement';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput } from '../inputParsing';
import { deriveOutcome } from '../../components/visualizer/barVisuals';
import { LANGUAGES, codeLines, makeRng } from './testUtils';
import type { ExecutionStep } from '../../types/algorithm';

// Boyer–Moore voting (candidate and count), then the verifying count against ⌊n/2⌋.
const run = (nums: number[]) => majority.generateSteps([...nums]);
const answer = (steps: ExecutionStep[]) => {
  const found = steps.find(s => s.type === 'found');
  return found ? (found.variables!.candidate as number) : null;
};
/** an oracle written differently: the value whose count is greater than ⌊n/2⌋, by counting every value */
function oracle(nums: number[]): number | null {
  const counts = new Map<number, number>();
  for (const x of nums) counts.set(x, (counts.get(x) ?? 0) + 1);
  for (const [x, c] of counts) if (c > Math.floor(nums.length / 2)) return x;
  return null;
}
const cell = (s: ExecutionStep, name: string) => s.tracker?.find(c => c.name === name);

describe('Majority Element — answers', () => {
  it.each([
    ['the example', [2, 2, 1, 1, 1, 2, 2], 2],
    ['a single element', [7], 7],
    ['a single negative element', [-5], -5],
    ['two equal elements', [4, 4], 4],
    ['two different elements: no majority', [1, 2], null],
    ['exactly half is not a majority', [1, 1, 2, 2], null],
    ['all different', [1, 2, 3], null],
    ['negative majority', [-1, -1, -1, 2, 2], -1],
    ['majority at the end', [1, 2, 3, 3, 3], 3],
    ['candidate survives but is not a majority', [1, 2, 3, 3, 4], null],
    ['empty', [], null],
  ])('%s', (_name, nums, expected) => {
    expect(answer(run(nums as number[]))).toBe(expected);
  });

  it('agrees with counting every value on 3,000 random arrays (with and without a majority)', () => {
    const rng = makeRng(11);
    let withMajority = 0;
    for (let k = 0; k < 3000; k++) {
      const spread = 1 + Math.floor(rng() * 4);
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * (2 * spread + 1)) - spread);
      const expected = oracle(nums);
      if (expected !== null) withMajority++;
      expect(answer(run(nums)), JSON.stringify(nums)).toBe(expected);
    }
    // both outcomes are well represented
    expect(withMajority).toBeGreaterThan(300);
    expect(withMajority).toBeLessThan(2700);
  });
});

describe('Majority Element — pass 1: candidate and count', () => {
  it('the example: every candidate and count update, in order', () => {
    const steps = run([2, 2, 1, 1, 1, 2, 2]);
    const pass1 = steps.slice(0, steps.findIndex(s => s.codeRef === 'init-freq'));
    const updates = pass1
      .filter(s => ['set-candidate', 'increment-count', 'decrement-count'].includes(s.codeRef!))
      .map(s => (s.codeRef === 'set-candidate' ? `candidate=${s.variables!.candidate}` : `count=${s.variables!.count}`));
    // i = 0, 1: 2 twice; i = 2, 3: two 1s cancel them; i = 4: 1 takes over; i = 5: a 2 cancels it; i = 6: 2 takes over
    expect(updates).toEqual([
      'candidate=2', 'count=1', 'count=2', 'count=1', 'count=0', 'candidate=1', 'count=1', 'count=0', 'candidate=2', 'count=1',
    ]);
  });

  it('per element: the loop check, count == 0?, (candidate = nums[i]), nums[i] == candidate?, then count++ or count--', () => {
    const refs = run([5, 5, 3]).map(s => s.codeRef);
    expect(refs.slice(0, refs.indexOf('init-freq'))).toEqual([
      'fn-entry', 'init-vars',
      'loop-condition', 'check-zero', 'set-candidate', 'check-match', 'increment-count',
      'loop-condition', 'check-zero', 'check-match', 'increment-count',
      'loop-condition', 'check-zero', 'check-match', 'decrement-count',
      'loop-condition',
    ]);
  });

  it('the cards show the candidate (not set before the first element) and count, marking what each step writes', () => {
    const steps = run([5, 3]);
    expect(cell(steps[1], 'candidate')).toEqual({ name: 'candidate', value: null, role: 'changed' });
    const set = steps.find(s => s.codeRef === 'set-candidate')!;
    expect(cell(set, 'candidate')).toMatchObject({ value: 5, role: 'changed' });
    const dec = steps.find(s => s.codeRef === 'decrement-count')!;
    expect(cell(dec, 'count')).toMatchObject({ value: 0, role: 'changed' });
    expect(dec.explanation).toBe("All of 5's votes so far are cancelled; the next element becomes the candidate.");
    expect(steps.find(s => s.codeRef === 'check-match' && s.variables!.i === 1)!).toMatchObject({ result: 'false', comparedValues: { val1: 3, val2: 5 } });
  });
});

describe('Majority Element — pass 2: verification', () => {
  it('always runs, counts the candidate, and compares freq with ⌊n/2⌋', () => {
    const steps = run([2, 2, 1, 1, 1, 2, 2]);
    const verify = steps.slice(steps.findIndex(s => s.codeRef === 'init-freq'));
    expect(verify.filter(s => s.codeRef === 'increment-freq').map(s => s.variables!.freq)).toEqual([1, 2, 3, 4]);
    expect(verify.find(s => s.codeRef === 'check-majority')).toMatchObject({
      result: 'true', comparedValues: { val1: 4, val2: 3 }, message: 'freq > n / 2?  4 > ⌊7/2⌋ = 3 → true',
    });
  });

  it('a candidate that is not a majority is rejected', () => {
    // pass 1: 1 is cancelled by 2, then 3 gets two votes and loses one to 4, so 3 survives; it occurs twice, not > 2
    const steps = run([1, 2, 3, 3, 4]);
    const check = steps.find(s => s.codeRef === 'check-majority')!;
    expect(check.result).toBe('false');
    expect(steps.at(-2)).toMatchObject({ type: 'not-found', codeRef: 'return-none' });
    expect(deriveOutcome(steps, steps.length - 1)).toBe('not-found');
    expect(steps.at(-1)!.outcomeText).toBe('No majority element: the candidate 3 occurs 2 of 5 times, not more than ⌊5/2⌋ = 2');
  });

  it('a majority: every copy is locked as found and the outcome names it', () => {
    const steps = run([2, 2, 1, 1, 1, 2, 2]);
    expect(steps.at(-2)).toMatchObject({ type: 'found', codeRef: 'return-majority', sortedIndices: [0, 1, 5, 6] });
    expect(deriveOutcome(steps, steps.length - 1)).toBe('found');
    expect(steps.at(-1)!.outcomeText).toBe('Majority element: 2 (4 of 7, more than ⌊7/2⌋ = 3)');
  });

  it('empty: no candidate, nothing to count, no majority', () => {
    const steps = run([]);
    expect(steps.map(s => s.codeRef)).toEqual(['fn-entry', 'init-vars', 'loop-condition', 'init-freq', 'verify-loop', 'check-majority', 'return-none', 'return-none']);
    expect(steps.at(-1)!.outcomeText).toBe('No majority element: the array is empty');
  });
});

describe('Majority Element — complexity', () => {
  it('O(n) time: at most 6 steps per element in pass 1 and 3 in pass 2, plus a constant', () => {
    const rng = makeRng(5);
    for (let k = 0; k < 300; k++) {
      const nums = Array.from({ length: Math.floor(rng() * 17) }, () => Math.floor(rng() * 7) - 3);
      expect(run(nums).length).toBeLessThanOrEqual(9 * nums.length + 8);
    }
  });

  it('O(1) extra space: the trace only ever tracks i, nums[i], candidate, count / freq and ⌊n/2⌋', () => {
    const names = new Set(run([3, 1, 3, 3, 2, -4, 3]).flatMap(s => (s.tracker ?? []).map(c => c.name)));
    expect([...names].sort()).toEqual(['candidate', 'count', 'freq', 'i', 'n / 2', 'nums[i]']);
    expect(majority.complexity).toMatchObject({ average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
  });
});

describe('Majority Element — code lines in C, C++, Java and Python', () => {
  it('each step highlights its statement in every language', () => {
    const expected: Record<string, RegExp> = {
      'fn-entry': /majority_?element\(/i,
      'init-vars': /candidate.*count/,
      'loop-condition': /^\s*for\b/,
      'check-zero': /count == 0/,
      'set-candidate': /candidate = nums\[i\]/,
      'check-match': /nums\[i\] == candidate/,
      'increment-count': /count(\+\+| \+= 1)/,
      'decrement-count': /count(--| -= 1)/,
      'init-freq': /freq = 0/,
      'verify-loop': /^\s*for\b/,
      'verify-match': /nums\[i\] == candidate/,
      'increment-freq': /freq(\+\+| \+= 1)/,
      'check-majority': /freq > .*2/,
      'return-majority': /return (candidate|true)/,
      'return-none': /return (false|null|None)/,
    };
    const refs = new Set([...run([2, 2, 1, 1, 1, 2, 2]), ...run([1, 2])].map(s => s.codeRef!));
    expect([...refs].sort()).toEqual(Object.keys(expected).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(majority, lang);
      for (const ref of refs) expect(lines[resolveCodeRef(majority, lang, ref)! - 1], `${lang} ${ref}`).toMatch(expected[ref]);
    }
  });

  it('the "no majority" answer is never a value the array could hold (negatives are valid elements)', () => {
    expect(majority.code.c).toMatch(/bool majorityElement\(const int nums\[\], int n, int \*majority\)/);
    expect(majority.code.cpp).toMatch(/bool majorityElement\(const vector<int>& nums, int& majority\)/);
    expect(majority.code.java).toMatch(/public static Integer majorityElement\(int\[\] nums\)[\s\S]*return null;/);
    expect(majority.code.python).toMatch(/return None/);
  });
});

describe('Majority Element — input', () => {
  it('takes any array up to the size limit, with no target', () => {
    expect(validateAlgorithmInput(majority, [1, -1, 1], null).ok).toBe(true);
    expect(validateAlgorithmInput(majority, [], null).ok).toBe(true);
    expect(majority.inputSpec).toBeUndefined();
  });
});
