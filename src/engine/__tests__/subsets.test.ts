import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { maxInputLength, validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, ProgrammingLanguage, SubsetsView } from '../../types/algorithm';

const def = getAlgorithmDefinition('backtracking-subsets')!;
const run = (...nums: number[]) => def.generateSteps(nums);
const last = (steps: ExecutionStep[]) => steps.at(-1)!;
const view = (s: ExecutionStep): SubsetsView => s.subsets!;
const result = (...nums: number[]) => view(last(run(...nums))).subsets;

/**
 * The reference, sharing nothing with the recursion: each subset is a bitmask over the positions, and the expected order
 * compares two subsets position by position, a prefix coming first.
 */
function reference(nums: readonly number[]): number[][] {
  const masks = Array.from({ length: 2 ** nums.length }, (_, mask) => nums.flatMap((_v, p) => ((mask >> p) & 1 ? [p] : [])));
  masks.sort((a, b) => {
    for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) return a[k] - b[k];
    return a.length - b.length;
  });
  return masks.map(ps => ps.map(p => nums[p]));
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
    return Array.from({ length: Math.floor(next() * 6) }, () => pool.splice(Math.floor(next() * pool.length), 1)[0]);
  });
}

const INPUTS = [[], [7], [1, 2], [1, 2, 3], [3, 1, 2], [-5, 0, 5], [1, 2, 3, 4], [1, 2, 3, 4, 5], [5, 4, 3, 2, 1], [-999, 999, 0, -1, 1]];

describe('Subsets — the answer', () => {
  it('your example: [1, 2, 3] in exactly the required order', () => {
    expect(result(1, 2, 3)).toEqual([[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]);
  });

  it.each([
    ['the empty input: only the empty subset', [], [[]]],
    ['one element', [7], [[], [7]]],
    ['two elements', [1, 2], [[], [1], [1, 2], [2]]],
    ['the order follows the positions, not the values', [3, 1], [[], [3], [3, 1], [1]]],
    ['negative values', [-1, -2], [[], [-1], [-1, -2], [-2]]],
    ['the limits of a value', [-999, 999], [[], [-999], [-999, 999], [999]]],
  ] as const)('%s', (_name, nums, expected) => {
    expect(result(...nums)).toEqual(expected);
  });

  it.each(INPUTS.map(x => [x]))('%j: 2^n subsets, the empty and the complete one included, no duplicates, each in input order', nums => {
    const out = result(...nums);
    expect(out).toHaveLength(2 ** nums.length);
    expect(out[0]).toEqual([]);
    expect(out).toContainEqual(nums);
    expect(new Set(out.map(s => JSON.stringify(s))).size).toBe(out.length);
    for (const s of out) {
      const positions = s.map(v => nums.indexOf(v));
      expect(positions.every(p => p >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('agrees with a bitmask reference, contents and order, on 200 random inputs', () => {
    const lengths = new Set<number>();
    for (const nums of randomInputs(200)) {
      expect(result(...nums), JSON.stringify(nums)).toEqual(reference(nums));
      lengths.add(nums.length);
    }
    expect([...lengths].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('the largest input: 32 subsets from 253 steps', () => {
    const steps = run(1, 2, 3, 4, 5);
    expect(view(last(steps)).subsets).toHaveLength(32);
    expect(steps).toHaveLength(253);
    expect(view(last(steps)).subsets).toEqual(reference([1, 2, 3, 4, 5]));
  });

  it('the result text', () => {
    expect(last(run(1, 2, 3)).outcomeText).toBe('8 subsets of [1, 2, 3] (2^3 = 8)');
    expect(last(run()).outcomeText).toBe('1 subset of []: only the empty subset (2^0 = 1)');
    expect(view(last(run(1, 2))).result).toEqual({ text: last(run(1, 2)).outcomeText });
  });
});

describe('Subsets — the include / exclude traversal', () => {
  it('[1, 2]: include before exclude, statement by statement', () => {
    expect(run(1, 2).map(s => s.codeRef)).toEqual([
      'start',
      'call-root',
      'check-end', // dfs(0)
      'include',
      'save',
      'recurse-include',
      'check-end', // dfs(1), with 1
      'include',
      'save',
      'recurse-include',
      'check-end', // dfs(2), with 1 and 2
      'return-end',
      'pop',
      'recurse-exclude',
      'check-end', // dfs(2), with 1
      'return-end',
      'pop', // back in dfs(0)
      'recurse-exclude',
      'check-end', // dfs(1), without 1
      'include',
      'save',
      'recurse-include',
      'check-end',
      'return-end',
      'pop',
      'recurse-exclude',
      'check-end',
      'return-end',
      'done',
    ]);
  });

  it('every step of [1, 2, 3]: the current subset, as each statement leaves it', () => {
    const currents = run(1, 2, 3).filter(s => ['include', 'pop'].includes(s.codeRef ?? '')).map(s => `${s.codeRef} ${JSON.stringify(view(s).current)}`);
    expect(currents).toEqual([
      'include [1]',
      'include [1,2]',
      'include [1,2,3]',
      'pop [1,2]',
      'pop [1]',
      'include [1,3]',
      'pop [1]',
      'pop []',
      'include [2]',
      'include [2,3]',
      'pop [2]',
      'pop []',
      'include [3]',
      'pop []',
    ]);
  });

  it('nothing is saved on the exclude branch: each subset is saved once, when its last element is included', () => {
    for (const nums of INPUTS) {
      const steps = def.generateSteps([...nums]);
      for (const s of steps.filter(x => x.codeRef === 'recurse-exclude')) {
        const before = view(steps[s.id - 1]).subsets.length;
        expect(view(s).subsets).toHaveLength(before);
      }
      for (const [k, s] of view(last(steps)).subsets.entries()) {
        const at = view(last(steps)).savedAt[k];
        // a node's path says which elements were included, and it ends with an include
        expect(s).toEqual([...at].flatMap((d, p) => (d === 'I' ? [nums[p]] : [])));
        if (k > 0) expect(at.endsWith('I')).toBe(true);
      }
    }
  });

  it('backtracking restores the current subset to what it was before the include', () => {
    for (const nums of INPUTS) {
      const steps = def.generateSteps([...nums]);
      const open: { i: number; before: readonly number[] }[] = [];
      for (const s of steps) {
        const v = view(s);
        if (s.codeRef === 'include') {
          open.push({ i: v.index!, before: view(steps[s.id - 1]).current });
          expect(v.added).toBe(nums[v.index!]);
          expect(v.current).toEqual([...view(steps[s.id - 1]).current, nums[v.index!]]);
        }
        if (s.codeRef === 'pop') {
          const { i, before } = open.pop()!;
          expect(v.current, JSON.stringify(nums)).toEqual(before);
          expect(v.index).toBe(i);
          expect(v.removed).toBe(nums[i]);
        }
      }
      expect(open).toEqual([]);
      expect(view(last(steps)).current).toEqual([]);
    }
  });
});

describe('Subsets — the steps', () => {
  it.each(INPUTS.map(x => [x]))('%j: the trace keeps its invariants', nums => {
    const before = [...nums];
    const input = [...nums];
    const steps = def.generateSteps(input);
    const n = nums.length;
    expect(input, 'the input is not changed').toEqual(before);
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'start' });
    expect(last(steps)).toMatchObject({ type: 'complete', codeRef: 'done' });
    // 2^n - 1 calls that decide, 6 steps each; 2^n that find nothing left, 2 steps each; the start, the first call and the end
    expect(steps).toHaveLength((2 ** n - 1) * 6 + 2 ** n * 2 + 3);
    expect(steps.slice(0, -1).every(s => view(s).result === undefined)).toBe(true);
    expect(JSON.stringify(def.generateSteps([...nums])), 'deterministic').toBe(JSON.stringify(steps));

    let prev: SubsetsView | null = null;
    for (const s of steps) {
      const v = view(s);
      expect(s.state).toEqual([]);
      expect(v.nums).toEqual(nums);
      // what is saved, finished and counted only grows; a saved subset never changes
      if (prev) {
        expect(v.subsets.slice(0, prev.subsets.length)).toEqual(prev.subsets);
        expect(v.finished.slice(0, prev.finished.length)).toEqual(prev.finished);
        expect(v.callsMade).toBeGreaterThanOrEqual(prev.callsMade);
        expect(v.elementsCopied).toBeGreaterThanOrEqual(prev.elementsCopied);
      }
      prev = v;
      expect(v.savedAt).toHaveLength(v.subsets.length);
      // the calls: one per decided element, the deepest running; only it can be returning
      v.calls.forEach((c, k) => {
        expect(c.i).toBe(k);
        expect(c.node).toHaveLength(k);
      });
      expect(v.node).toBe(v.calls.at(-1)?.node ?? null);
      expect(v.calls.slice(0, -1).every(c => !c.returning)).toBe(true);
      // the current subset is exactly what the running call's path included (until the include or pop on this very step)
      if (v.node !== null && !['include', 'save'].includes(s.codeRef ?? '') && !(s.codeRef === 'recurse-include')) {
        expect(v.current).toEqual([...v.node].flatMap((d, p) => (d === 'I' ? [nums[p]] : [])));
      }
      if (v.index !== null) expect(v.index >= 0 && v.index < n).toBe(true);
      for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) expect(resolveCodeRef(def, lang, s.codeRef), `${s.codeRef} ${lang}`).not.toBeNull();
      expect(`${s.message} ${s.explanation}`).not.toMatch(/undefined|NaN/);
    }
    expect(view(last(steps)).calls).toEqual([]);
    expect(view(last(steps)).node).toBeNull();
  });

  it('the two costs are counted apart: 2^(n+1) - 1 calls, and n × 2^(n-1) elements copied', () => {
    for (const nums of INPUTS) {
      const n = nums.length;
      const end = view(last(def.generateSteps([...nums])));
      expect(end.callsMade, JSON.stringify(nums)).toBe(2 ** (n + 1) - 1);
      expect(end.elementsCopied, JSON.stringify(nums)).toBe(n === 0 ? 0 : n * 2 ** (n - 1));
      expect(end.subsets.reduce((sum, s) => sum + s.length, 0)).toBe(end.elementsCopied);
      expect(end.finished).toHaveLength(end.callsMade);
    }
    // only a save moves elements; only a call counts as a call
    const steps = run(1, 2, 3);
    for (const s of steps.slice(1)) {
      const before = view(steps[s.id - 1]);
      if (s.codeRef !== 'save') expect(view(s).elementsCopied).toBe(before.elementsCopied);
      if (!['call-root', 'recurse-include', 'recurse-exclude'].includes(s.codeRef ?? '')) expect(view(s).callsMade).toBe(before.callsMade);
    }
    expect(last(steps).explanation).toContain('These are separate costs');
  });

  it('every line in the map is reached', () => {
    const emitted = new Set(run(1, 2).map(s => s.codeRef));
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) expect([...emitted].sort()).toEqual(Object.keys(def.lineMap[lang]).sort());
  });
});

describe('Subsets — the input', () => {
  it('takes up to 5 distinct values, and the empty array', () => {
    for (const nums of [[], [1], [1, 2, 3, 4, 5], [-999, 999]]) {
      expect(validateAlgorithmInput(def, nums, null).ok, JSON.stringify(nums)).toBe(true);
      expect(buildExecution('backtracking-subsets', nums, getAlgorithmDefinition).status).toBe('ok');
    }
    expect(maxInputLength(def)).toBe(5);
  });

  it('refuses a sixth value and a repeated value, with a clear message, and the generator refuses them too', () => {
    expect(validateAlgorithmInput(def, [1, 2, 3, 4, 5, 6], null)).toMatchObject({ ok: false, message: 'Too many values (6). The visualizer supports at most 5.' });
    expect(validateAlgorithmInput(def, [1, 2, 1], null)).toMatchObject({ ok: false, field: 'array', message: 'Subsets (Power Set) needs distinct values, but 1 appears more than once (values 1 and 3).' });
    expect(validateDraft(def, '4, 5, 5', '')).toMatchObject({ ok: false, field: 'array', message: 'Subsets (Power Set) needs distinct values, but 5 appears more than once (values 2 and 3).' });
    expect(validateDraft(def, '1, 2, 3', '')).toMatchObject({ ok: true, array: [1, 2, 3] });
    expect(() => def.generateSteps([1, 2, 3, 4, 5, 6])).toThrow(RangeError);
    expect(() => def.generateSteps([2, 2])).toThrow(RangeError);
    expect(validateDraft(def, '1000', '').ok).toBe(false);
    expect(validateDraft(def, '1.5', '').ok).toBe(false);
  });

  it('other array algorithms keep the visualizer\'s own limit, and may repeat values', () => {
    const bubble = getAlgorithmDefinition('bubble-sort')!;
    expect(maxInputLength(bubble)).toBe(16);
    expect(validateAlgorithmInput(bubble, [2, 2, 1], null).ok).toBe(true);
    expect(validateAlgorithmInput(bubble, Array.from({ length: 16 }, (_, k) => k), null).ok).toBe(true);
    expect(validateAlgorithmInput(bubble, Array.from({ length: 17 }, (_, k) => k), null)).toMatchObject({ ok: false, message: 'Too many values (17). The visualizer supports at most 16.' });
  });
});

describe('Subsets — registration and the listings', () => {
  it('registered once, under BACKTRACKING after N-Queens, drawn as a decision tree, with the documented complexity', () => {
    expect(def).toMatchObject({ id: 'backtracking-subsets', name: 'Subsets (Power Set)', category: 'BACKTRACKING', visual: 'decision-tree' });
    expect(visualKindOf(def)).toBe('decision-tree');
    const nav = ALGORITHM_NAV.filter(a => a.category === 'BACKTRACKING');
    expect(nav.map(a => a.id)).toEqual(['backtracking-n-queens', 'backtracking-subsets', 'backtracking-permutations']);
    expect(nav[1]).toMatchObject({ name: def.name, subtitle: def.subtitle, implemented: true });
    expect(def.complexity).toMatchObject({ best: 'O(n × 2^n)', average: 'O(n × 2^n)', worst: 'O(n × 2^n)', space: 'O(n)' });
    expect(def.description).toContain('2^(n+1) - 1 recursive calls');
    expect(def.description).toContain('n × 2^(n-1) elements');
    expect(def.description).toContain('O(n) auxiliary space for the recursion, excluding the results');
    expect(def.description).toContain('O(n × 2^n) to store the subsets');
    expect(def.defaultInput).toEqual([1, 2, 3]);
  });

  it('all four listings make the same statements, in the same order, and the highlighted lines are those statements', () => {
    const statements: Record<string, Record<ProgrammingLanguage, string>> = {
      'check-end': { c: 'if (i == n)', cpp: 'if (i == (int)nums.size())', java: 'if (i == nums.length)', python: 'if i == len(nums):' },
      'return-end': { c: 'return;', cpp: 'return;', java: 'return;', python: 'return' },
      include: { c: 'current[(*size)++] = nums[i];', cpp: 'current.push_back(nums[i]);', java: 'current.add(nums[i]);', python: 'current.append(nums[i])' },
      save: { c: 'memcpy(result[*count], current, *size * sizeof(int));', cpp: 'result.push_back(current);', java: 'result.add(new ArrayList<>(current));', python: 'result.append(current[:])' },
      'recurse-include': { c: 'dfs(nums, n, i + 1, current, size, result, sizes, count);', cpp: 'dfs(nums, i + 1, current, result);', java: 'dfs(nums, i + 1, current, result);', python: 'dfs(nums, i + 1, current, result)' },
      pop: { c: '(*size)--;', cpp: 'current.pop_back();', java: 'current.remove(current.size() - 1);', python: 'current.pop()' },
      'recurse-exclude': { c: 'dfs(nums, n, i + 1, current, size, result, sizes, count);', cpp: 'dfs(nums, i + 1, current, result);', java: 'dfs(nums, i + 1, current, result);', python: 'dfs(nums, i + 1, current, result)' },
    };
    for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
      const lines = def.code[lang].split('\n');
      const map = def.lineMap[lang];
      for (const [ref, text] of Object.entries(statements)) expect(lines[map[ref] - 1], `${lang} ${ref}`).toContain(text[lang]);
      expect(lines[map['recurse-exclude'] - 1]).toMatch(/exclude nums\[i\]$/);
      expect(lines[map.start - 1]).toMatch(/empty subset$/);
      // the order of the statements in the recursion
      const order = ['check-end', 'return-end', 'include', 'save', 'recurse-include', 'pop', 'recurse-exclude'].map(r => map[r]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(map.start).toBeLessThan(map['call-root']);
      expect(map['call-root']).toBeLessThan(map.done);
    }
    // C has a bound for the fixed arrays, equal to what the input allows
    expect(def.code.c).toContain('#define MAX_N 5');
  });
});
