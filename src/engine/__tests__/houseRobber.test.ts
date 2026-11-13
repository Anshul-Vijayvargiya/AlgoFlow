import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { MAX_HOUSES, MAX_MONEY, selectedHouses } from '../algorithms/dp/houseRobber';
import { LANGUAGES, makeRng } from './testUtils';
import type { ExecutionStep, HouseRobberView } from '../../types/algorithm';

const ID = 'dp-house-robber' as const;
const def = getAlgorithmDefinition(ID)!;
const run = (nums: readonly number[]) => def.generateSteps([...nums]);
const view = (s: ExecutionStep) => s.houseRobber!;
const last = (steps: ExecutionStep[]) => view(steps.at(-1)!);
const refs = (steps: ExecutionStep[]) => steps.map(s => s.codeRef);
const sum = (nums: readonly number[], houses: readonly number[]) => houses.reduce((total, k) => total + nums[k], 0);
const noNeighbours = (houses: readonly number[]) => houses.every((k, j) => j === 0 || k - houses[j - 1] >= 2);

/**
 * An independent reference: every set of houses with no two next to each other (a bit mask with no two adjacent bits),
 * and the largest total among them. Nothing here is shared with the algorithm under test.
 */
function bruteForce(nums: readonly number[]): number {
  let best = 0;
  for (let mask = 0; mask < 1 << nums.length; mask++) {
    if (mask & (mask << 1)) continue;
    let total = 0;
    for (let k = 0; k < nums.length; k++) if (mask & (1 << k)) total += nums[k];
    best = Math.max(best, total);
  }
  return best;
}

/** seeded random arrays within the limits: 1 to 10 houses; a third of them from a small range, so ties are common */
function randomArrays(count: number, seed: number): number[][] {
  const rng = makeRng(seed);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  return Array.from({ length: count }, (_, c) => {
    const [low, high] = c % 3 === 0 ? [0, 3] : c % 3 === 1 ? [0, MAX_MONEY] : [0, 20];
    return Array.from({ length: int(1, MAX_HOUSES) }, () => int(low, high));
  });
}
const RANDOM = randomArrays(300, 198);
const FIXED: number[][] = [
  [2, 7, 9, 3, 1],
  [1, 2, 3, 1],
  [5],
  [0],
  [3, 8],
  [8, 3],
  [4, 4],
  [0, 0, 0, 0],
  [1, 2, 3, 4, 5, 6],
  [6, 5, 4, 3, 2, 1],
  [7, 7, 7, 7, 7],
  [9, 1, 9, 1, 9, 1],
  [1, 9, 1, 9, 1, 9],
  [2, 1, 1, 2],
  [0, 5, 0, 0, 5, 0],
  [400, 400, 400, 400, 400, 400, 400, 400, 400, 400],
  [1, 3, 1, 3, 100],
  [10, 1, 1, 10, 1, 1, 10],
];
const ALL_INPUTS = [...FIXED, ...RANDOM];

describe('House Robber: where it is listed and how it is drawn', () => {
  it('a DP algorithm right after Climbing Stairs and before Fibonacci; not Coming Soon', () => {
    const dp = ALGORITHM_NAV.filter(a => a.category === 'DP').map(a => a.id);
    expect(dp.indexOf(ID)).toBe(dp.indexOf('dp-climbing-stairs') + 1);
    expect(dp.indexOf('fibonacci')).toBe(dp.indexOf(ID) + 1);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'House Robber', category: 'DP', implemented: true, subtitle: def.subtitle });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it('drawn as houses, taking 1 to 10 amounts from 0 to 400 through the array form; O(n) time and O(1) space', () => {
    expect(def).toMatchObject({ id: ID, name: 'House Robber', category: 'DP', visual: 'houses', defaultInput: [2, 7, 9, 3, 1] });
    expect(visualKindOf(def)).toBe('houses');
    expect(def.inputSpec).toEqual({ minLength: 1, maxLength: 10, minValue: 0, maxValue: 400, randomValues: [1, 20] });
    expect([MAX_HOUSES, MAX_MONEY]).toEqual([10, 400]);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    // only this algorithm is drawn as houses
    expect(getAllAlgorithms().filter(d => visualKindOf(d) === 'houses').map(d => d.id)).toEqual([ID]);
  });

  it('the listings keep two rolling variables: no recursion, no array of answers, the same recurrence in all four', () => {
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      expect(code, lang).toMatch(/current = (maxOf|max|Math\.max)\(prev1, nums\[i\] \+ prev2\)/);
      expect(code, lang).toMatch(/prev2 = prev1;?\n\s*prev1 = current;?/);
      expect(code, lang).not.toMatch(/dp\b|memo|malloc|new int|vector<int> \w+[;(]|\[\]\s*=|= \[/);
      // rob is defined once and never calls itself
      expect(code.match(/\brob\(/g), lang).toHaveLength(1);
    }
    expect(def.code.c).toContain('int maxOf(int a, int b) {');
    expect(def.code.c).toContain('for (int i = 0; i < numsSize; i++) {');
    expect(def.code.python).toContain('for i in range(len(nums)):');
  });
});

describe('House Robber: results', () => {
  it('the example: [2, 7, 9, 3, 1] → 12, by robbing houses 0, 2 and 4', () => {
    const steps = run([2, 7, 9, 3, 1]);
    expect(def.generateSteps([...def.defaultInput])).toEqual(steps);
    expect(steps).toHaveLength(40);
    expect(last(steps).result).toEqual({ amount: 12, houses: [0, 2, 4], text: 'Maximum 12: rob houses 0, 2 and 4 (2 + 9 + 1 = 12)' });
    expect(steps.at(-1)!.outcomeText).toBe('Maximum 12: rob houses 0, 2 and 4 (2 + 9 + 1 = 12)');
    expect(steps.at(-1)!.type).toBe('complete');
    expect(last(steps).best).toEqual([2, 7, 11, 11, 12]);
  });

  it('one house, two houses, zeros, increasing, decreasing, equal and alternating values', () => {
    for (const [nums, amount, houses] of [
      [[5], 5, [0]],
      [[0], 0, []],
      [[3, 8], 8, [1]],
      [[8, 3], 8, [0]],
      [[0, 0, 0, 0], 0, []],
      [[1, 2, 3, 4, 5, 6], 12, [1, 3, 5]],
      [[6, 5, 4, 3, 2, 1], 12, [0, 2, 4]],
      [[7, 7, 7, 7, 7], 21, [0, 2, 4]],
      [[9, 1, 9, 1, 9, 1], 27, [0, 2, 4]],
      [[1, 9, 1, 9, 1, 9], 27, [1, 3, 5]],
      [[1, 2, 3, 1], 4, [0, 2]],
      // the best plan leaves two houses in a row
      [[2, 1, 1, 2], 4, [0, 3]],
      [[10, 1, 1, 10, 1, 1, 10], 30, [0, 3, 6]],
      [[0, 5, 0, 0, 5, 0], 10, [1, 4]],
      [[1, 3, 1, 3, 100], 103, [1, 4]],
      [Array(10).fill(400), 2000, [0, 2, 4, 6, 8]],
    ] as [number[], number, number[]][]) {
      const result = last(run(nums)).result!;
      expect([result.amount, result.houses], JSON.stringify(nums)).toEqual([amount, houses]);
    }
    expect(last(run([5])).result!.text).toBe('Maximum 5: rob house 0 (5)');
    expect(last(run([3, 8])).result!.text).toBe('Maximum 8: rob house 1 (8)');
    expect(last(run([0, 0, 0, 0])).result!.text).toBe('Maximum 0: no house holds any money');
    expect(last(run([2, 1, 1, 2])).result!.text).toBe('Maximum 4: rob houses 0 and 3 (2 + 2 = 4)');
  });

  it('300 seeded random arrays (many with ties) and the fixed ones: the amount is the best over every set of non-adjacent houses', () => {
    expect(RANDOM.some(a => a.length === 1) && RANDOM.some(a => a.length === MAX_HOUSES)).toBe(true);
    for (const nums of ALL_INPUTS) {
      const v = last(run(nums));
      expect(v.result!.amount, JSON.stringify(nums)).toBe(bruteForce(nums));
      expect(v.prev1, JSON.stringify(nums)).toBe(v.result!.amount);
    }
  });
});

describe('House Robber: the houses shown as robbed (display only)', () => {
  it('on every step: valid indexes in ascending order, never two neighbours, and they add up to the best amount so far', () => {
    for (const nums of ALL_INPUTS) {
      for (const s of run(nums)) {
        const v = view(s);
        const where = `${JSON.stringify(nums)} step ${s.id} (${s.codeRef})`;
        const decided = v.best.length;
        expect(v.selected.every((k, j) => Number.isInteger(k) && k >= 0 && k < decided && (j === 0 || k > v.selected[j - 1])), where).toBe(true);
        expect(noNeighbours(v.selected), where).toBe(true);
        expect(sum(nums, v.selected), where).toBe(decided ? v.best[decided - 1] : 0);
      }
    }
  });

  it('the best amounts are the best of each prefix, never go down, and the final set is the result', () => {
    for (const nums of ALL_INPUTS) {
      const v = last(run(nums));
      expect(v.best, JSON.stringify(nums)).toEqual(nums.map((_, k) => bruteForce(nums.slice(0, k + 1))));
      expect(v.best.every((b, k) => k === 0 || b >= v.best[k - 1])).toBe(true);
      expect(v.selected).toEqual(v.result!.houses);
      expect(sum(nums, v.result!.houses), JSON.stringify(nums)).toBe(v.result!.amount);
    }
  });

  it('the set is read back from the best amounts alone, and follows the run as it changes', () => {
    expect(selectedHouses([])).toEqual([]);
    expect(selectedHouses([2])).toEqual([0]);
    expect(selectedHouses([0])).toEqual([]);
    expect(selectedHouses([2, 7, 11, 11, 12])).toEqual([0, 2, 4]);
    const steps = run([2, 7, 9, 3, 1]);
    const afterEachHouse = steps.filter(s => s.codeRef === 'take-max').map(s => view(s).selected);
    // house 1 is in the plan after two houses, and out of it again once house 2 is decided
    expect(afterEachHouse).toEqual([[0], [1], [0, 2], [0, 2], [0, 2, 4]]);
    expect(view(steps[0]).selected).toEqual([]);
    expect(steps.slice(0, 6).every(s => view(s).best.length === 0)).toBe(true);
  });

  it('a tie skips the house, as max keeps prev1: [5, 5] robs house 0, [0] robs none, [1, 1, 1] robs houses 0 and 2', () => {
    const tie = run([5, 5]);
    const max = tie.filter(s => s.codeRef === 'take-max')[1];
    expect(view(max).choice).toEqual({ rob: 5, skip: 5, winner: 'skip' });
    expect(max.message).toBe('current = max(5, 5) = 5 — equal: skip');
    expect(max.actionLabel).toBe('Equal: skip');
    expect(last(tie).result!.houses).toEqual([0]);
    expect(view(run([0]).find(s => s.codeRef === 'take-max')!).choice).toEqual({ rob: 0, skip: 0, winner: 'skip' });
    expect(last(run([0])).result!.houses).toEqual([]);
    expect(last(run([1, 1, 1])).result!.houses).toEqual([0, 2]);
    expect(last(run([4, 4])).result!.houses).toEqual([0]);
    // on every step of every input: the winner is rob exactly when robbing gives strictly more
    for (const nums of ALL_INPUTS) {
      for (const s of run(nums)) {
        const c = view(s).choice;
        if (c?.winner) expect(c.winner, `${JSON.stringify(nums)} step ${s.id}`).toBe(c.rob > c.skip! ? 'rob' : 'skip');
      }
    }
  });
});

describe('House Robber: the steps', () => {
  it('[2, 7] step by step: two variables set, then for each house the rob choice, the skip choice, the max and the two shifts', () => {
    const steps = run([2, 7]);
    const pass = ['loop-condition', 'rob-choice', 'skip-choice', 'take-max', 'shift-prev2', 'shift-prev1', 'loop-condition'];
    expect(refs(steps)).toEqual(['fn-entry', 'init-prev2', 'init-prev1', ...pass, ...pass, 'loop-condition', 'return-result']);
    expect(steps.map(s => s.message)).toEqual([
      'rob([2, 7]): the most money from houses that are not next to each other',
      'prev2 = 0',
      'prev1 = 0',
      'i=0 < n=2 → true',
      'rob house 0: nums[0] + prev2 = 2 + 0 = 2',
      'skip house 0: prev1 = 0',
      'current = max(0, 2) = 2 — rob wins',
      'prev2 = prev1 = 0',
      'prev1 = current = 2',
      'i++ → i=1',
      'i=1 < n=2 → true',
      'rob house 1: nums[1] + prev2 = 7 + 0 = 7',
      'skip house 1: prev1 = 2',
      'current = max(2, 7) = 7 — rob wins',
      'prev2 = prev1 = 2',
      'prev1 = current = 7',
      'i++ → i=2',
      'i=2 < n=2 → false — loop ends',
      'return prev1 = 7',
    ]);
    expect(steps.map(s => view(s).operation)).toEqual(['start', 'init', 'init', 'loop', 'rob', 'skip', 'max', 'shift', 'shift', 'loop', 'loop', 'rob', 'skip', 'max', 'shift', 'shift', 'loop', 'loop', 'done']);
    expect(steps.map(s => [view(s).prev2, view(s).prev1, view(s).current])).toEqual([
      [null, null, null],
      [0, null, null],
      [0, 0, null],
      [0, 0, null],
      [0, 0, null],
      [0, 0, null],
      [0, 0, 2],
      [0, 0, 2],
      [0, 2, 2],
      [0, 2, null],
      [0, 2, null],
      [0, 2, null],
      [0, 2, null],
      [0, 2, 7],
      [2, 2, 7],
      [2, 7, 7],
      [2, 7, null],
      [2, 7, null],
      [2, 7, null],
    ]);
    expect(last(steps).result!.text).toBe('Maximum 7: rob house 1 (7)');
  });

  it('the choice fills in over the three steps of the max line, stays for the shifts and is gone on the next house', () => {
    const steps = run([2, 7, 9, 3, 1]);
    const at = (ref: string, k: number) => steps.filter(s => s.codeRef === ref)[k];
    expect(view(at('rob-choice', 2))).toMatchObject({ i: 2, choice: { rob: 11 }, blocked: 1, current: null });
    expect(view(at('skip-choice', 2))).toMatchObject({ i: 2, choice: { rob: 11, skip: 7 }, current: null });
    expect(view(at('skip-choice', 2)).blocked).toBeUndefined();
    expect(view(at('take-max', 2))).toMatchObject({ i: 2, choice: { rob: 11, skip: 7, winner: 'rob' }, current: 11, best: [2, 7, 11] });
    expect(view(at('shift-prev2', 2))).toMatchObject({ choice: { rob: 11, skip: 7, winner: 'rob' }, prev2: 7, prev1: 7, moved: 'prev2' });
    expect(view(at('shift-prev1', 2))).toMatchObject({ choice: { rob: 11, skip: 7, winner: 'rob' }, prev2: 7, prev1: 11, moved: 'prev1' });
    // house 3: skipping keeps more
    expect(view(at('take-max', 3))).toMatchObject({ choice: { rob: 10, skip: 11, winner: 'skip' }, current: 11 });
    expect(at('take-max', 3).message).toBe('current = max(11, 10) = 11 — skip wins');
    // the first house has no neighbour before it to block
    expect(view(at('rob-choice', 0)).blocked).toBeUndefined();
    for (const s of steps) {
      const v = view(s);
      expect(v.choice !== undefined, `step ${s.id}`).toBe(['rob', 'skip', 'max', 'shift'].includes(v.operation));
      expect(v.blocked !== undefined, `step ${s.id}`).toBe(v.operation === 'rob' && v.i! > 0);
      if (v.blocked !== undefined) expect(v.blocked).toBe(v.i! - 1);
    }
  });

  it('on every input: 5 + 7n steps, ids from 0, the state is the houses, and the variables follow the recurrence', () => {
    for (const nums of ALL_INPUTS) {
      const steps = run(nums);
      const where = JSON.stringify(nums);
      expect(steps, where).toHaveLength(5 + 7 * nums.length);
      expect(steps.every((s, k) => s.id === k && s.message.length > 0 && (s.explanation ?? '').length > 0), where).toBe(true);
      expect(steps.every(s => JSON.stringify(s.state) === JSON.stringify(nums) && JSON.stringify(view(s).nums) === JSON.stringify(nums)), where).toBe(true);
      for (const s of steps) {
        const v = view(s);
        if (s.type !== 'loop-condition') continue;
        // at each check of the loop: prev1 is the best of the houses before i, prev2 the best of those before i - 1
        const i = v.i!;
        expect([v.prev2, v.prev1], `${where} i=${i}`).toEqual([i >= 2 ? v.best[i - 2] : 0, i >= 1 ? v.best[i - 1] : 0]);
        expect(v.best.length, `${where} i=${i}`).toBe(i);
      }
      for (const s of steps.filter(x => x.codeRef === 'take-max')) {
        const v = view(s);
        expect(v.current, where).toBe(Math.max(v.prev1!, nums[v.i!] + v.prev2!));
        expect(v.choice, where).toMatchObject({ rob: nums[v.i!] + v.prev2!, skip: v.prev1! });
      }
    }
  });
});

describe('House Robber: snapshots are immutable', () => {
  const frozenDeep = (value: unknown): boolean =>
    value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value as object).every(frozenDeep));

  it('every view is frozen all the way down: the view, its arrays, the choice and the result', () => {
    for (const nums of ALL_INPUTS.slice(0, 80)) {
      for (const s of run(nums)) {
        const v = view(s);
        expect(frozenDeep(v), `${JSON.stringify(nums)} step ${s.id}`).toBe(true);
        for (const part of [v.nums, v.best, v.selected, ...(v.choice ? [v.choice] : []), ...(v.result ? [v.result, v.result.houses] : [])]) expect(Object.isFrozen(part)).toBe(true);
      }
    }
  });

  it('a snapshot cannot be changed, later steps never change an earlier one, and the input array is not touched', () => {
    const input = [2, 7, 9, 3, 1];
    const steps = def.generateSteps(input);
    expect(input).toEqual([2, 7, 9, 3, 1]);
    const v: HouseRobberView = view(steps[20]);
    expect(() => (v.best as number[]).push(99)).toThrow(TypeError);
    expect(() => (v.selected as number[]).pop()).toThrow(TypeError);
    expect(() => (v.nums as number[]).reverse()).toThrow(TypeError);
    expect(() => ((v as { prev1: number | null }).prev1 = 99)).toThrow(TypeError);
    expect(() => ((v.choice as { rob: number }).rob = 99)).toThrow(TypeError);
    // each step keeps its own history: early steps still show none, although the run went on
    expect(view(steps[3]).best).toEqual([]);
    expect(view(steps[6]).best).toEqual([2]);
    expect(view(steps.at(-1)!).best).toEqual([2, 7, 11, 11, 12]);
    expect(view(steps[6]).best).not.toBe(view(steps[7]).best);
    const again = def.generateSteps([2, 7, 9, 3, 1]);
    expect(again).toEqual(steps);
    expect(view(again[20])).not.toBe(v);
    // the state array of a step is its own copy
    steps[0].state.push(1);
    expect(view(steps[0]).nums).toEqual([2, 7, 9, 3, 1]);
    expect(steps[1].state).toEqual([2, 7, 9, 3, 1]);
  });
});

describe('House Robber: code references', () => {
  it('every step names a line in all four listings, and every mapped reference is reached', () => {
    const seen = new Set<string>();
    for (const nums of ALL_INPUTS) for (const s of run(nums)) seen.add(s.codeRef ?? '(none)');
    for (const ref of seen) for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, ref), `${lang} ${ref}`).not.toBeNull();
    expect([...seen].sort()).toEqual(Object.keys(def.lineMap.c).sort());
    for (const lang of LANGUAGES) expect(Object.keys(def.lineMap[lang]).sort(), lang).toEqual(Object.keys(def.lineMap.c).sort());
  });

  it('the rob choice, the skip choice and the comparison are the same line: the max statement', () => {
    const line = (lang: (typeof LANGUAGES)[number], ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();
    const MAX = {
      c: 'int current = maxOf(prev1, nums[i] + prev2);',
      cpp: 'int current = max(prev1, nums[i] + prev2);',
      java: 'int current = Math.max(prev1, nums[i] + prev2);',
      python: 'current = max(prev1, nums[i] + prev2)',
    };
    for (const lang of LANGUAGES) {
      for (const ref of ['rob-choice', 'skip-choice', 'take-max']) expect(line(lang, ref), `${lang} ${ref}`).toBe(MAX[lang]);
      expect(def.lineMap[lang]['rob-choice']).toBe(def.lineMap[lang]['take-max']);
      expect(def.lineMap[lang]['skip-choice']).toBe(def.lineMap[lang]['take-max']);
      expect(line(lang, 'init-prev2')).toMatch(/^(int )?prev2 = 0;?$/);
      expect(line(lang, 'init-prev1')).toMatch(/^(int )?prev1 = 0;?$/);
      expect(line(lang, 'shift-prev2')).toMatch(/^prev2 = prev1;?$/);
      expect(line(lang, 'shift-prev1')).toMatch(/^prev1 = current;?$/);
      expect(line(lang, 'return-result')).toMatch(/^return prev1;?$/);
      expect(line(lang, 'loop-condition')).toMatch(/^for /);
      expect(line(lang, 'fn-entry')).toMatch(/\brob\(/);
    }
    expect(def.lineSpans).toBeUndefined();
    expect(def.lineLeads).toBeUndefined();
  });
});

describe('House Robber: input', () => {
  it('1 to 10 whole amounts from 0 to 400 are accepted; anything else is refused in words, and nothing is changed', () => {
    expect(validateAlgorithmInput(def, [2, 7, 9, 3, 1], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [0], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, Array(10).fill(400), null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [], null)).toMatchObject({ ok: false, field: 'array', message: 'House Robber needs at least 1 values; the array is empty.' });
    expect(validateAlgorithmInput(def, Array(11).fill(1), null)).toMatchObject({ ok: false, message: 'Too many values (11). The visualizer supports at most 10.' });
    expect(validateAlgorithmInput(def, [3, -1], null)).toMatchObject({ ok: false, field: 'array', message: 'Value 2 (-1) is below 0: House Robber takes values from 0 to 400.' });
    expect(validateAlgorithmInput(def, [401], null)).toMatchObject({ ok: false, field: 'array', message: 'Value 1 (401) is above 400: House Robber takes values from 0 to 400.' });
    expect(validateDraft(def, '2, 7, 9, 3, 1', '')).toMatchObject({ ok: true, array: [2, 7, 9, 3, 1] });
    expect(validateDraft(def, '[2,7,9,3,1]', '')).toMatchObject({ ok: true, array: [2, 7, 9, 3, 1] });
    expect(validateDraft(def, '2, 7.5', '')).toMatchObject({ ok: false, field: 'array', message: expect.stringContaining('is a decimal') });
    expect(validateDraft(def, '2, x', '')).toMatchObject({ ok: false, field: 'array', message: expect.stringContaining('is not a whole number') });
    expect(validateDraft(def, '', '')).toMatchObject({ ok: false, message: expect.stringContaining('needs at least 1') });
  });

  it('the generator refuses input the app would refuse, and the app reports it without a trace', () => {
    for (const bad of [[], [-1], [401], Array(11).fill(1)]) expect(() => run(bad), JSON.stringify(bad)).toThrow(RangeError);
    expect(buildExecution(ID, [401], getAlgorithmDefinition).status).toBe('generator-error');
    expect(buildExecution(ID, [2, 7, 9, 3, 1], getAlgorithmDefinition).status).toBe('ok');
  });

  it('other array algorithms keep their own limits', () => {
    expect(validateAlgorithmInput(getAlgorithmDefinition('bubble-sort')!, [-999, 999, 500], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(getAlgorithmDefinition('array-move-zeroes')!, [-999, 0, 999], null)).toEqual({ ok: true });
    expect(validateAlgorithmInput(getAlgorithmDefinition('array-sort-colors')!, [3], null).ok).toBe(false);
    expect(validateAlgorithmInput(getAlgorithmDefinition('dp-climbing-stairs')!, [5], null)).toEqual({ ok: true });
  });
});
