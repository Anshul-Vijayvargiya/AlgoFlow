import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { maxInputLength, validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, PermutationsView, ProgrammingLanguage } from '../../types/algorithm';

const def = getAlgorithmDefinition('backtracking-permutations')!;
const run = (...nums: number[]) => def.generateSteps(nums);
const last = (steps: ExecutionStep[]) => steps.at(-1)!;
const view = (s: ExecutionStep): PermutationsView => s.permutations!;
const result = (...nums: number[]) => view(last(run(...nums))).permutations;
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

/**
 * The reference, sharing nothing with the recursion: the next permutation of the positions 0 .. n - 1, in the classic
 * in-place way (no recursion, no used[]). Starting from the identity, this walks the orderings in lexicographic order.
 */
function reference(nums: readonly number[]): number[][] {
  const p = nums.map((_, k) => k);
  const out: number[][] = [];
  for (;;) {
    out.push(p.map(k => nums[k]));
    let i = p.length - 2;
    while (i >= 0 && p[i] > p[i + 1]) i--;
    if (i < 0) return out;
    let j = p.length - 1;
    while (p[j] < p[i]) j--;
    [p[i], p[j]] = [p[j], p[i]];
    p.splice(i + 1, p.length, ...p.slice(i + 1).reverse());
  }
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

/** distinct values, of every allowed length */
function randomInputs(count: number): number[][] {
  const rnd = random(20261106);
  const next = () => rnd.next().value as number;
  return Array.from({ length: count }, () => {
    const pool = Array.from({ length: 1999 }, (_, k) => k - 999);
    return Array.from({ length: Math.floor(next() * 5) }, () => pool.splice(Math.floor(next() * pool.length), 1)[0]);
  });
}

const INPUTS = [[], [7], [1, 2], [2, 1], [1, 2, 3], [3, 1, 2], [-5, 0, 5], [1, 2, 3, 4], [4, 3, 2, 1], [-999, 999, 0, -1]];
/** the number of calls: one per ordered selection of 0 to n elements */
const callsFor = (n: number) => Array.from({ length: n + 1 }, (_, k) => factorial(n) / factorial(n - k)).reduce((a, b) => a + b, 0);

describe('Find All Permutations — the answer', () => {
  it('your example: [1, 2, 3] in exactly the required order', () => {
    expect(result(1, 2, 3)).toEqual([[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]);
  });

  it.each([
    ['the empty input: one empty permutation', [], [[]]],
    ['one element', [7], [[7]]],
    ['two elements', [1, 2], [[1, 2], [2, 1]]],
    ['the order follows the positions, not the values', [2, 1], [[2, 1], [1, 2]]],
    ['negative values', [-1, -2], [[-1, -2], [-2, -1]]],
    ['the limits of a value', [-999, 999], [[-999, 999], [999, -999]]],
  ] as const)('%s', (_name, nums, expected) => {
    expect(result(...nums)).toEqual(expected);
  });

  it.each(INPUTS.map(x => [x]))('%j: n! permutations, each with every element exactly once, no duplicates', nums => {
    const out = result(...nums);
    expect(out).toHaveLength(factorial(nums.length));
    const sorted = [...nums].sort((a, b) => a - b);
    for (const p of out) {
      expect(p).toHaveLength(nums.length);
      expect([...p].sort((a, b) => a - b)).toEqual(sorted);
    }
    expect(new Set(out.map(p => JSON.stringify(p))).size).toBe(out.length);
    // the first keeps the input's order, the last reverses it
    expect(out[0]).toEqual(nums);
    expect(out.at(-1)).toEqual([...nums].reverse());
  });

  it('agrees with a next-permutation reference, contents and order, on 200 random inputs', () => {
    const lengths = new Set<number>();
    for (const nums of randomInputs(200)) {
      expect(result(...nums), JSON.stringify(nums)).toEqual(reference(nums));
      lengths.add(nums.length);
    }
    expect([...lengths].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('the largest input: 24 permutations from 600 steps', () => {
    const steps = run(1, 2, 3, 4);
    expect(view(last(steps)).permutations).toHaveLength(24);
    expect(steps).toHaveLength(600);
    expect(view(last(steps)).permutations).toEqual(reference([1, 2, 3, 4]));
  });

  it('the result text', () => {
    expect(last(run(1, 2, 3)).outcomeText).toBe('6 permutations of [1, 2, 3] (3! = 6)');
    expect(last(run(7)).outcomeText).toBe('1 permutation of [7] (1! = 1)');
    expect(last(run()).outcomeText).toBe('1 permutation of []: the empty permutation (0! = 1)');
    expect(view(last(run(1, 2))).result).toEqual({ text: last(run(1, 2)).outcomeText });
  });
});

describe('Find All Permutations — the backtracking', () => {
  it('[1, 2]: statement by statement', () => {
    expect(run(1, 2).map(s => s.codeRef)).toEqual([
      'start',
      'call-root',
      'check-full', // position 0
      'check-used', // 1 is free
      'mark',
      'push',
      'recurse',
      'check-full', // position 1, with [1]
      'check-used', // 1 is used: skipped
      'check-used', // 2 is free
      'mark',
      'push',
      'recurse',
      'check-full', // [1, 2] is complete
      'save',
      'return-full',
      'pop',
      'unmark',
      'pop', // back at position 0
      'unmark',
      'check-used', // 2 is free
      'mark',
      'push',
      'recurse',
      'check-full',
      'check-used', // 1 is free
      'mark',
      'push',
      'recurse',
      'check-full', // [2, 1] is complete
      'save',
      'return-full',
      'pop',
      'unmark',
      'check-used', // 2 is used: skipped
      'pop',
      'unmark',
      'done',
    ]);
  });

  it('[1, 2, 3]: the pushes and pops, in order', () => {
    const ops = run(1, 2, 3).flatMap(s => (s.codeRef === 'push' ? [`+${view(s).added}`] : s.codeRef === 'pop' ? [`-${view(s).removed}`] : []));
    expect(ops.join(' ')).toBe('+1 +2 +3 -3 -2 +3 +2 -2 -3 -1 +2 +1 +3 -3 -1 +3 +1 -1 -3 -2 +3 +1 +2 -2 -1 +2 +1 -1 -2 -3');
  });

  it('each push adds the element being looked at, and each pop takes off the last one', () => {
    for (const nums of INPUTS) {
      const steps = def.generateSteps([...nums]);
      for (const s of steps) {
        const v = view(s);
        const before = s.id > 0 ? view(steps[s.id - 1]).current : [];
        if (s.codeRef === 'push') {
          expect(v.added).toBe(nums[v.index!]);
          expect(v.current).toEqual([...before, nums[v.index!]]);
        } else if (s.codeRef === 'pop') {
          expect(v.removed).toBe(nums[v.index!]);
          expect(before.at(-1)).toBe(v.removed);
          expect(v.current).toEqual(before.slice(0, -1));
        } else {
          expect(v.current, s.codeRef).toEqual(before);
          expect(v.added).toBeUndefined();
          expect(v.removed).toBeUndefined();
        }
      }
    }
  });

  it('used[] is restored after backtracking: each unmark leaves used[] and current as they were before the choice', () => {
    for (const nums of INPUTS) {
      const steps = def.generateSteps([...nums]);
      const open: { i: number; used: readonly boolean[]; current: readonly number[] }[] = [];
      for (const s of steps) {
        const v = view(s);
        if (s.codeRef === 'mark') {
          const before = view(steps[s.id - 1]);
          open.push({ i: v.index!, used: before.used, current: before.current });
          expect(before.used[v.index!]).toBe(false);
          expect(v.used[v.index!]).toBe(true);
        }
        if (s.codeRef === 'unmark') {
          const { i, used, current } = open.pop()!;
          expect(v.index).toBe(i);
          expect(v.used, JSON.stringify(nums)).toEqual(used);
          expect(v.current, JSON.stringify(nums)).toEqual(current);
        }
      }
      expect(open).toEqual([]);
      expect(view(last(steps)).used.every(u => !u)).toBe(true);
      expect(view(last(steps)).current).toEqual([]);
    }
  });

  it('an element already used is skipped, and the check says so', () => {
    for (const nums of INPUTS) {
      for (const s of def.generateSteps([...nums]).filter(x => x.codeRef === 'check-used')) {
        const v = view(s);
        const taken = v.used[v.index!];
        expect(s.result).toBe(String(taken));
        expect(v.skipped).toBe(taken ? nums[v.index!] : undefined);
      }
    }
    const steps = run(1, 2);
    expect(steps[8].message).toBe('used[0]?  true: 1 is already in current, skip it');
    expect(steps[9].message).toBe('used[1]?  false: 2 is available');
  });

  it('saved permutations are snapshots: frozen, and never changed by the later steps', () => {
    const steps = run(1, 2, 3);
    const end = view(last(steps)).permutations;
    for (const p of end) expect(Object.isFrozen(p)).toBe(true);
    for (const s of steps) {
      const v = view(s);
      // what a step saw is what the end has, element for element, by identity
      v.permutations.forEach((p, k) => expect(p).toBe(end[k]));
      expect(Object.isFrozen(v.current)).toBe(true);
      expect(Object.isFrozen(v.used)).toBe(true);
    }
    // current is a different array from what was saved
    const save = steps.find(s => s.codeRef === 'save')!;
    expect(view(save).permutations[0]).toEqual(view(save).current);
    expect(view(save).permutations[0]).not.toBe(view(save).current);
  });
});

describe('Find All Permutations — the steps', () => {
  it.each(INPUTS.map(x => [x]))('%j: the trace keeps its invariants', nums => {
    const before = [...nums];
    const input = [...nums];
    const steps = def.generateSteps(input);
    const n = nums.length;
    const calls = callsFor(n);
    const finishedOnes = factorial(n);
    expect(input, 'the input is not changed').toEqual(before);
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'start' });
    expect(last(steps)).toMatchObject({ type: 'complete', codeRef: 'done' });
    // 1 check per call; save and return per complete one; n checks per other one; 5 steps per choice; start, first call, end
    expect(steps).toHaveLength(calls + 2 * finishedOnes + (calls - finishedOnes) * n + (calls - 1) * 5 + 3);
    expect(steps.slice(0, -1).every(s => view(s).result === undefined)).toBe(true);
    expect(JSON.stringify(def.generateSteps([...nums])), 'deterministic').toBe(JSON.stringify(steps));

    let prev: PermutationsView | null = null;
    for (const s of steps) {
      const v = view(s);
      expect(s.state).toEqual([]);
      expect(v.nums).toEqual(nums);
      expect(v.used).toHaveLength(n);
      // what is saved, finished and counted only grows
      if (prev) {
        expect(v.permutations.slice(0, prev.permutations.length)).toEqual(prev.permutations);
        expect(v.finished.slice(0, prev.finished.length)).toEqual(prev.finished);
        expect(v.callsMade).toBeGreaterThanOrEqual(prev.callsMade);
        expect(v.usedChecks).toBeGreaterThanOrEqual(prev.usedChecks);
        expect(v.elementsCopied).toBeGreaterThanOrEqual(prev.elementsCopied);
      }
      prev = v;
      expect(v.savedAt).toHaveLength(v.permutations.length);
      // the calls: one per position, the deepest running; only it can be returning
      v.calls.forEach((c, k) => {
        expect(c.node).toHaveLength(k);
        expect(c.chosen).toBe(k === 0 ? null : Number(c.node.at(-1)));
      });
      expect(v.node).toBe(v.calls.at(-1)?.node ?? null);
      expect(v.calls.slice(0, -1).every(c => !c.returning)).toBe(true);
      if (v.index !== null) expect(v.index >= 0 && v.index < n).toBe(true);
      // used[] says exactly which values are in current, apart from the two steps between it and current changing
      if (s.codeRef !== 'mark' && s.codeRef !== 'pop') expect(nums.filter((_, k) => v.used[k]).sort((a, b) => a - b)).toEqual([...v.current].sort((a, b) => a - b));
      // current is what the running call's name chose, except between the push / pop and the call changing
      if (v.node !== null && !['mark', 'push', 'pop', 'unmark'].includes(s.codeRef ?? '')) {
        expect(v.current).toEqual([...v.node].map(i => nums[Number(i)]));
      }
      for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) expect(resolveCodeRef(def, lang, s.codeRef), `${s.codeRef} ${lang}`).not.toBeNull();
      expect(`${s.message} ${s.explanation}`).not.toMatch(/undefined|NaN/);
    }
    expect(view(last(steps)).calls).toEqual([]);
    expect(view(last(steps)).node).toBeNull();
  });

  it('the costs are counted apart: calls, used[] checks, and n × n! elements copied', () => {
    for (const nums of INPUTS) {
      const n = nums.length;
      const end = view(last(def.generateSteps([...nums])));
      expect(end.callsMade, JSON.stringify(nums)).toBe(callsFor(n));
      expect(end.usedChecks, JSON.stringify(nums)).toBe((callsFor(n) - factorial(n)) * n);
      expect(end.elementsCopied, JSON.stringify(nums)).toBe(n * factorial(n));
      expect(end.permutations.reduce((sum, p) => sum + p.length, 0)).toBe(end.elementsCopied);
      expect(end.finished).toHaveLength(end.callsMade);
    }
    // the figures for the largest input, as the audit gave them
    expect(view(last(run(1, 2, 3, 4)))).toMatchObject({ callsMade: 65, usedChecks: 164, elementsCopied: 96 });
    // only a save moves elements; only a check counts as one; only a call counts as a call
    const steps = run(1, 2, 3);
    for (const s of steps.slice(1)) {
      const before = view(steps[s.id - 1]);
      if (s.codeRef !== 'save') expect(view(s).elementsCopied).toBe(before.elementsCopied);
      if (s.codeRef !== 'check-used') expect(view(s).usedChecks).toBe(before.usedChecks);
      if (s.codeRef !== 'call-root' && s.codeRef !== 'recurse') expect(view(s).callsMade).toBe(before.callsMade);
    }
    expect(last(steps).explanation).toContain('are separate costs');
  });

  it('every line in the map is reached', () => {
    const emitted = new Set(run(1, 2).map(s => s.codeRef));
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) expect([...emitted].sort()).toEqual(Object.keys(def.lineMap[lang]).sort());
  });

  it('the empty input: the first check finds it complete', () => {
    expect(run().map(s => s.codeRef)).toEqual(['start', 'call-root', 'check-full', 'save', 'return-full', 'done']);
  });
});

describe('Find All Permutations — the input', () => {
  it('takes up to 4 distinct values, and the empty array', () => {
    for (const nums of [[], [1], [1, 2, 3, 4], [-999, 999]]) {
      expect(validateAlgorithmInput(def, nums, null).ok, JSON.stringify(nums)).toBe(true);
      expect(buildExecution('backtracking-permutations', nums, getAlgorithmDefinition).status).toBe('ok');
    }
    expect(maxInputLength(def)).toBe(4);
  });

  it('refuses a fifth value and a repeated value, with a clear message, and the generator refuses them too', () => {
    expect(validateAlgorithmInput(def, [1, 2, 3, 4, 5], null)).toMatchObject({ ok: false, message: 'Too many values (5). The visualizer supports at most 4.' });
    expect(validateAlgorithmInput(def, [1, 2, 1], null)).toMatchObject({ ok: false, field: 'array', message: 'Find All Permutations needs distinct values, but 1 appears more than once (values 1 and 3).' });
    expect(validateDraft(def, '4, 5, 5', '')).toMatchObject({ ok: false, field: 'array' });
    expect(validateDraft(def, '1, 2, 3', '')).toMatchObject({ ok: true, array: [1, 2, 3] });
    expect(() => def.generateSteps([1, 2, 3, 4, 5])).toThrow(RangeError);
    expect(() => def.generateSteps([2, 2])).toThrow(RangeError);
    expect(validateDraft(def, '1000', '').ok).toBe(false);
    expect(validateDraft(def, '1.5', '').ok).toBe(false);
  });
});

describe('Find All Permutations — registration and the listings', () => {
  it('registered once, under BACKTRACKING after Subsets, sharing the decision-tree kind, with the documented complexity', () => {
    expect(def).toMatchObject({ id: 'backtracking-permutations', name: 'Find All Permutations', category: 'BACKTRACKING', visual: 'decision-tree' });
    expect(visualKindOf(def)).toBe('decision-tree');
    const nav = ALGORITHM_NAV.filter(a => a.category === 'BACKTRACKING');
    expect(nav.map(a => a.id)).toEqual(['backtracking-n-queens', 'backtracking-subsets', 'backtracking-permutations']);
    expect(nav[2]).toMatchObject({ name: def.name, subtitle: def.subtitle, implemented: true });
    expect(def.complexity).toMatchObject({ best: 'O(n × n!)', average: 'O(n × n!)', worst: 'O(n × n!)', space: 'O(n)' });
    expect(def.description).toContain('O(n) auxiliary space for the recursion and used[], excluding the results');
    expect(def.description).toContain('O(n × n!) to store the permutations');
    expect(def.defaultInput).toEqual([1, 2, 3]);
  });

  it('all four listings make the same statements, in the same order, and the highlighted lines are those statements', () => {
    const statements: Record<string, Record<ProgrammingLanguage, string>> = {
      'check-full': { c: 'if (*size == n)', cpp: 'if (current.size() == nums.size())', java: 'if (current.size() == nums.length)', python: 'if len(current) == len(nums):' },
      save: { c: 'memcpy(result[*count], current, n * sizeof(int));', cpp: 'result.push_back(current);', java: 'result.add(new ArrayList<>(current));', python: 'result.append(current[:])' },
      'return-full': { c: 'return;', cpp: 'return;', java: 'return;', python: 'return' },
      'check-used': { c: 'if (used[i])', cpp: 'if (used[i])', java: 'if (used[i])', python: 'if used[i]:' },
      mark: { c: 'used[i] = true;', cpp: 'used[i] = true;', java: 'used[i] = true;', python: 'used[i] = True' },
      push: { c: 'current[(*size)++] = nums[i];', cpp: 'current.push_back(nums[i]);', java: 'current.add(nums[i]);', python: 'current.append(nums[i])' },
      recurse: { c: 'dfs(nums, n, used, current, size, result, count);', cpp: 'dfs(nums, used, current, result);', java: 'dfs(nums, used, current, result);', python: 'dfs(nums, used, current, result)' },
      pop: { c: '(*size)--;', cpp: 'current.pop_back();', java: 'current.remove(current.size() - 1);', python: 'current.pop()' },
      unmark: { c: 'used[i] = false;', cpp: 'used[i] = false;', java: 'used[i] = false;', python: 'used[i] = False' },
    };
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
      const lines = def.code[lang].split('\n');
      const map = def.lineMap[lang];
      for (const [ref, text] of Object.entries(statements)) expect(lines[map[ref] - 1], `${lang} ${ref}`).toContain(text[lang]);
      const order = ['check-full', 'save', 'return-full', 'check-used', 'mark', 'push', 'recurse', 'pop', 'unmark'].map(r => map[r]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(map.start).toBeLessThan(map['call-root']);
      expect(map['call-root']).toBeLessThan(map.done);
      // the loop goes left to right
      expect(def.code[lang]).toMatch(/for \(?(int|size_t) i = 0; i < (n|nums\.size\(\)|nums\.length); i\+\+\)|for i in range\(len\(nums\)\):/);
    }
    expect(def.code.c).toContain('#define MAX_N 4');
  });
});
