import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRange, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { MAX_VALUE, MIN_VALUE, validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, ProgrammingLanguage, SortColorsView } from '../../types/algorithm';

const ID = 'array-sort-colors';
const def = getAlgorithmDefinition(ID)!;
const run = (...nums: number[]) => def.generateSteps(nums);
const view = (s: ExecutionStep): SortColorsView => s.sortColors!;
const result = (...nums: number[]) => view(run(...nums).at(-1)!).result!;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** the reference, sharing nothing with the three pointers: count each value, then write the counts out */
const reference = (nums: readonly number[]) => [0, 1, 2].flatMap(v => nums.filter(x => x === v));

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
/** arrays of 0s, 1s and 2s of every allowed length */
function randomInputs(count: number): number[][] {
  const rnd = random(75);
  const next = () => rnd.next().value as number;
  return Array.from({ length: count }, () => Array.from({ length: 1 + Math.floor(next() * 10) }, () => Math.floor(next() * 3)));
}

const EDGE: [string, number[]][] = [
  ['the example', [2, 0, 2, 1, 1, 0]],
  ['a single 0', [0]],
  ['a single 1', [1]],
  ['a single 2', [2]],
  ['all 0s', [0, 0, 0]],
  ['all 1s', [1, 1, 1]],
  ['all 2s', [2, 2, 2]],
  ['already sorted', [0, 1, 2]],
  ['reversed', [2, 1, 0]],
  ['1, 0, 2', [1, 0, 2]],
  ['mixed repeats, ten values', [2, 2, 1, 0, 0, 1, 2, 0, 1, 1]],
  ['no 1s', [2, 0, 2, 0]],
  ['no 0s', [2, 1, 2, 1]],
  ['no 2s', [1, 0, 1, 0]],
];
const ALL = [...EDGE.map(([, n]) => n), ...randomInputs(300)];

describe('Sort Colors: where it is listed and how it is drawn', () => {
  it('an ARRAYS algorithm right after Move Zeroes, the last of ARRAYS; not Coming Soon', () => {
    const arrays = ALGORITHM_NAV.filter(a => a.category === 'ARRAYS').map(a => a.id);
    expect(arrays.indexOf(ID)).toBe(arrays.indexOf('array-move-zeroes') + 1);
    expect(arrays.at(-1)).toBe(ID);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Sort Colors', category: 'ARRAYS', implemented: true });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it("drawn as its own indexed cells ('flag-cells'), not bars and not Move Zeroes' cells; 1 to 10 values from 0 to 2; O(n) time, O(1) space", () => {
    expect(def).toMatchObject({ id: ID, category: 'ARRAYS', visual: 'flag-cells', defaultInput: [2, 0, 2, 1, 1, 0] });
    expect(visualKindOf(def)).toBe('flag-cells');
    expect(def.inputSpec).toEqual({ minLength: 1, maxLength: 10, minValue: 0, maxValue: 2, randomValues: [0, 2] });
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    expect(buildExecution(ID, [2, 0, 2, 1, 1, 0]).status).toBe('ok');
    expect(visualKindOf(getAlgorithmDefinition('array-move-zeroes'))).toBe('cells');
  });
});

describe('Sort Colors: the result', () => {
  it.each([
    [[2, 0, 2, 1, 1, 0], [0, 0, 1, 1, 2, 2]],
    [[0], [0]],
    [[1], [1]],
    [[2], [2]],
    [[0, 0, 0], [0, 0, 0]],
    [[1, 1, 1], [1, 1, 1]],
    [[2, 2, 2], [2, 2, 2]],
    [[0, 1, 2], [0, 1, 2]],
    [[2, 1, 0], [0, 1, 2]],
    [[1, 0, 2], [0, 1, 2]],
    [[2, 2, 1, 0, 0, 1, 2, 0, 1, 1], [0, 0, 0, 1, 1, 1, 1, 2, 2, 2]],
  ])('%j → %j', (input, output) => {
    expect(result(...input)).toEqual(output);
    expect(run(...input).at(-1)!.state).toEqual(output);
    expect(run(...input).at(-1)!.outcomeText).toBe(`Sorted in one pass: [${output.join(', ')}]`);
  });

  it('300 random arrays of every allowed length agree with counting the values', () => {
    const lengths = new Set<number>();
    for (const nums of randomInputs(300)) {
      expect(result(...nums), JSON.stringify(nums)).toEqual(reference(nums));
      lengths.add(nums.length);
    }
    expect([...lengths].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('the input array passed in is not changed: the engine works on its own copy', () => {
    const nums = [2, 0, 2, 1, 1, 0];
    def.generateSteps(nums);
    expect(nums).toEqual([2, 0, 2, 1, 1, 0]);
  });
});

describe('Sort Colors: the three pointers', () => {
  it('in place: each step changes the array only by the swap it shows, and a swap exchanges exactly those two positions', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const [k, s] of steps.entries()) {
        const v = view(s);
        expect(v.nums).toHaveLength(nums.length);
        expect(s.state).toEqual([...v.nums]);
        expect(v.input).toEqual(nums);
        if (k === 0) continue;
        const before = view(steps[k - 1]).nums;
        const where = `${JSON.stringify(nums)} step ${k}`;
        if (v.swapped) {
          const [a, b] = v.swapped;
          expect(s.type, where).toBe('swap');
          expect([v.nums[a], v.nums[b]], where).toEqual([before[b], before[a]]);
          expect(v.nums.filter((_, i) => i !== a && i !== b)).toEqual(before.filter((_, i) => i !== a && i !== b));
        } else expect(v.nums, where).toEqual(before);
      }
    }
  });

  it('a 0: swapped with low, then low and mid both move right by one', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const [k, s] of steps.entries()) {
        if (s.codeRef !== 'swap-low') continue;
        const before = view(steps[k - 1]);
        expect(before.current).toEqual({ index: before.mid, value: 0 });
        expect(view(s).swapped).toEqual([before.low, before.mid]);
        expect(view(s).nums[before.low!]).toBe(0);
        expect(steps.slice(k + 1, k + 4).map(x => x.codeRef)).toEqual(['advance-low', 'advance-mid-zero', 'loop-condition']);
        const after = view(steps[k + 3]);
        expect([after.low, after.mid, after.high]).toEqual([before.low! + 1, before.mid! + 1, before.high]);
      }
    }
  });

  it('a 1: nothing is swapped, only mid moves right by one', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const [k, s] of steps.entries()) {
        if (s.codeRef !== 'check-one' || s.result !== 'true') continue;
        const before = view(s);
        expect(before.current).toEqual({ index: before.mid, value: 1 });
        expect(steps.slice(k + 1, k + 3).map(x => x.codeRef)).toEqual(['advance-mid-one', 'loop-condition']);
        const after = view(steps[k + 2]);
        expect([after.low, after.mid, after.high]).toEqual([before.low, before.mid! + 1, before.high]);
        expect(after.nums).toEqual(before.nums);
      }
    }
  });

  it('a 2: swapped with high, high moves left by one, and mid is NOT incremented', () => {
    let twoSwaps = 0;
    let recheckedAfterSwap = 0;
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const [k, s] of steps.entries()) {
        if (s.codeRef !== 'swap-high') continue;
        twoSwaps++;
        const before = view(steps[k - 1]);
        expect(before.current).toEqual({ index: before.mid, value: 2 });
        expect(view(s).swapped).toEqual([before.mid, before.high]);
        expect(view(s).nums[before.high!]).toBe(2);
        // after the swap: high--, then straight back to the loop condition. No step moves mid.
        expect(steps.slice(k + 1, k + 3).map(x => x.codeRef)).toEqual(['retreat-high', 'loop-condition']);
        expect(view(steps[k + 1]).moved).toEqual(['high']);
        const after = view(steps[k + 2]);
        expect([after.low, after.mid, after.high], JSON.stringify(nums)).toEqual([before.low, before.mid, before.high! - 1]);
        // when the loop goes on, the next value read is the one that came from high, at the same mid
        if (steps[k + 2].result === 'true') {
          recheckedAfterSwap++;
          expect(view(steps[k + 3]).current).toEqual({ index: before.mid, value: view(s).nums[before.mid!] });
        }
      }
    }
    expect(twoSwaps).toBeGreaterThan(100);
    expect(recheckedAfterSwap).toBeGreaterThan(50);
  });

  it('[1, 2, 0]: the 0 that comes from the back is checked at the same mid', () => {
    // with a wrong mid++ after the 2-swap, mid would pass high at once and [1, 2, 0] would end as [1, 0, 2]
    expect(result(1, 2, 0)).toEqual([0, 1, 2]);
    const refs = run(1, 2, 0).map(s => `${s.codeRef}@${view(s).mid}`);
    const at = refs.indexOf('swap-high@1');
    expect(refs.slice(at, at + 5)).toEqual(['swap-high@1', 'retreat-high@1', 'loop-condition@1', 'check-zero@1', 'swap-low@1']);
  });

  it('the regions are true on every step: 0s, then 1s, then unchecked, then 2s; together they cover the array once', () => {
    for (const nums of ALL) {
      for (const s of run(...nums)) {
        const v = view(s);
        const where = `${JSON.stringify(nums)} step ${s.id} ${s.codeRef}`;
        const { zeros, ones, unknown, twos } = v.regions;
        expect([zeros[0], zeros[1], ones[1], unknown[1], twos[1]], where).toEqual([0, ones[0], unknown[0], twos[0], nums.length]);
        for (const r of [zeros, ones, unknown, twos]) expect(r[0], where).toBeLessThanOrEqual(r[1]);
        expect(v.nums.slice(...zeros).every(x => x === 0), where).toBe(true);
        expect(v.nums.slice(...ones).every(x => x === 1), where).toBe(true);
        expect(v.nums.slice(...twos).every(x => x === 2), where).toBe(true);
      }
    }
  });

  it('at every check of the loop condition the regions are exactly what the pointers say; at the end nothing is unchecked', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const s of steps.filter(x => x.codeRef === 'loop-condition')) {
        const v = view(s);
        expect(v.regions, `${JSON.stringify(nums)} step ${s.id}`).toEqual({ zeros: [0, v.low], ones: [v.low, v.mid], unknown: [v.mid, v.high! + 1], twos: [v.high! + 1, nums.length] });
      }
      const last = view(steps.at(-1)!);
      expect(last.regions.unknown[0]).toBe(last.regions.unknown[1]);
      expect(last.mid).toBe(last.high! + 1);
    }
  });

  it('before the pointers are set nothing is known; each is set on its own step', () => {
    const steps = run(2, 0, 2, 1, 1, 0);
    expect(steps.slice(0, 4).map(s => [s.codeRef, view(s).low, view(s).mid, view(s).high, view(s).moved])).toEqual([
      ['fn-entry', null, null, null, undefined],
      ['init-low', 0, null, null, ['low']],
      ['init-mid', 0, 0, null, ['mid']],
      ['init-high', 0, 0, 5, ['high']],
    ]);
    expect(view(steps[0]).regions).toEqual({ zeros: [0, 0], ones: [0, 0], unknown: [0, 6], twos: [6, 6] });
  });

  it('[2, 0, 2, 1, 1, 0]: the swaps and the arrays after them are those of the trace', () => {
    const swaps = run(2, 0, 2, 1, 1, 0).filter(s => view(s).swapped).map(s => [s.codeRef, view(s).swapped, view(s).nums]);
    expect(swaps).toEqual([
      ['swap-high', [0, 5], [0, 0, 2, 1, 1, 2]],
      ['swap-low', [0, 0], [0, 0, 2, 1, 1, 2]],
      ['swap-low', [1, 1], [0, 0, 2, 1, 1, 2]],
      ['swap-high', [2, 4], [0, 0, 1, 1, 2, 2]],
    ]);
  });

  it('pointers off the array: [2] ends with high = -1, [1] with mid = 1', () => {
    expect([view(run(2).at(-1)!).low, view(run(2).at(-1)!).mid, view(run(2).at(-1)!).high]).toEqual([0, 0, -1]);
    expect([view(run(1).at(-1)!).low, view(run(1).at(-1)!).mid, view(run(1).at(-1)!).high]).toEqual([0, 1, 0]);
    expect([view(run(0).at(-1)!).low, view(run(0).at(-1)!).mid, view(run(0).at(-1)!).high]).toEqual([1, 1, 0]);
  });
});

describe('Sort Colors: the steps', () => {
  it('[1, 0, 2]: the exact order of statements', () => {
    expect(run(1, 0, 2).map(s => s.codeRef)).toEqual([
      'fn-entry', 'init-low', 'init-mid', 'init-high',
      'loop-condition', 'check-zero', 'check-one', 'advance-mid-one',
      'loop-condition', 'check-zero', 'swap-low', 'advance-low', 'advance-mid-zero',
      'loop-condition', 'check-zero', 'check-one', 'swap-high', 'retreat-high',
      'loop-condition', 'fn-exit',
    ]);
  });

  it('every step says what it did: the operation matches the statement', () => {
    const OPERATION: Record<string, string> = {
      'fn-entry': 'start', 'init-low': 'init', 'init-mid': 'init', 'init-high': 'init', 'loop-condition': 'loop', 'check-zero': 'check', 'check-one': 'check',
      'swap-low': 'swap-low', 'advance-low': 'advance-low', 'advance-mid-zero': 'advance-mid', 'advance-mid-one': 'advance-mid', 'swap-high': 'swap-high',
      'retreat-high': 'retreat-high', 'fn-exit': 'done',
    };
    for (const nums of ALL.slice(0, 60)) for (const s of run(...nums)) expect(view(s).operation, s.codeRef).toBe(OPERATION[s.codeRef!]);
  });

  it('snapshots are immutable: every view and everything in it is frozen, and a later step never changes an earlier one', () => {
    const steps = run(2, 0, 2, 1, 1, 0);
    const before = JSON.stringify(steps.map(s => s.sortColors));
    for (const s of steps) {
      const v = view(s);
      expect(Object.isFrozen(v)).toBe(true);
      for (const part of [v.nums, v.input, v.regions, v.regions.zeros, v.regions.ones, v.regions.unknown, v.regions.twos]) expect(Object.isFrozen(part)).toBe(true);
      for (const part of [v.current, v.swapped, v.moved, v.result]) if (part) expect(Object.isFrozen(part)).toBe(true);
      expect(() => ((v.nums as number[])[0] = 9)).toThrow(TypeError);
      expect(() => ((v as { mid: number | null }).mid = 9)).toThrow(TypeError);
    }
    expect(JSON.stringify(steps.map(s => s.sortColors))).toBe(before);
    expect(view(steps[0]).nums).toEqual([2, 0, 2, 1, 1, 0]);
    // no two steps share an array, and the bar state is a copy too
    expect(new Set(steps.map(s => view(s).nums)).size).toBe(steps.length);
    for (const s of steps) expect(s.state).not.toBe(view(s).nums);
  });

  it('ids are contiguous, init first and complete last; the result is on the last step only', () => {
    for (const nums of EDGE.map(([, n]) => n)) {
      const steps = run(...nums);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
      expect(steps[0].type).toBe('init');
      expect(steps.at(-1)!.type).toBe('complete');
      expect(steps.filter(s => view(s).result)).toEqual([steps.at(-1)]);
    }
  });

  it('O(n): at most n passes of the loop, each of at most 5 steps', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      expect(steps.filter(s => s.codeRef === 'check-zero')).toHaveLength(nums.length);
      expect(steps.length).toBeLessThanOrEqual(4 + 5 * nums.length + 2);
    }
  });

  it('every codeRef is reached, and every step highlights a line in every language', () => {
    const reached = new Set<string>();
    for (const nums of ALL.slice(0, 80)) {
      for (const s of run(...nums)) {
        reached.add(s.codeRef!);
        for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, s.codeRef), `${lang} ${s.codeRef}`).not.toBeNull();
      }
    }
    for (const lang of LANGUAGES) expect([...reached].sort(), lang).toEqual(Object.keys(def.lineMap[lang]).sort());
  });

  it('no message or explanation shows undefined, null or NaN', () => {
    for (const nums of ALL.slice(0, 80)) {
      for (const s of run(...nums)) expect(`${s.message} ${s.explanation ?? ''} ${s.actionLabel ?? ''} ${s.outcomeText ?? ''}`, `${JSON.stringify(nums)} step ${s.id}`).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe('Sort Colors: the input', () => {
  it('1 to 10 values, each 0, 1 or 2, are accepted', () => {
    for (const text of ['0', '1', '2', '2, 0, 2, 1, 1, 0', '[0, 1, 2]', '2, 2, 1, 0, 0, 1, 2, 0, 1, 1']) expect(validateDraft(def, text, '').ok, text).toBe(true);
  });

  it.each([
    ['', 'Sort Colors needs at least 1 values; the array is empty.'],
    ['0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1', 'Too many values (11). The visualizer supports at most 10.'],
    ['3', 'Value 1 (3) is above 2: Sort Colors takes values from 0 to 2.'],
    ['0, 1, 5, 2', 'Value 3 (5) is above 2: Sort Colors takes values from 0 to 2.'],
    ['999', 'Value 1 (999) is above 2: Sort Colors takes values from 0 to 2.'],
    ['-1', 'Value 1 (-1) is below 0: Sort Colors takes values from 0 to 2.'],
    ['1, -2', 'Value 2 (-2) is below 0: Sort Colors takes values from 0 to 2.'],
    ['1000', 'Value 1 (1000) is out of range — use values from -999 to 999.'],
    ['1.5', 'Value 1 ("1.5") is a decimal — only whole numbers are supported.'],
    ['0, x', 'Value 2 ("x") is not a whole number.'],
  ])('%j is refused: %s', (text, message) => {
    expect(validateDraft(def, text, '')).toMatchObject({ ok: false, message });
  });

  it('the engine refuses what the form refuses, and never runs on it', () => {
    for (const bad of [[], [3], [-1], [0, 1, 2, 3], [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1]]) {
      expect(validateAlgorithmInput(def, bad, null).ok, JSON.stringify(bad)).toBe(false);
      expect(() => def.generateSteps(bad), JSON.stringify(bad)).toThrow(RangeError);
      // run directly (past the form), the generator's own refusal is reported, never a trace
      expect(buildExecution(ID, bad).status).toBe('generator-error');
    }
  });

  it('a value out of the range is never offered to be sorted away: no "Sort a copy"', () => {
    expect(validateAlgorithmInput(def, [3], null)).toMatchObject({ ok: false, canSortCopy: false, field: 'array' });
  });
});

describe('maxValue is optional: algorithms without it are unaffected', () => {
  it('Sort Colors is the only algorithm that declares maxValue', () => {
    expect(getAllAlgorithms().filter(d => d.inputSpec?.maxValue !== undefined).map(d => d.id)).toEqual([ID]);
  });

  it('Move Zeroes still takes the whole global range, -999 to 999', () => {
    const zeroes = getAlgorithmDefinition('array-move-zeroes')!;
    expect(zeroes.inputSpec).toEqual({ minLength: 1, maxLength: 10, randomValues: [0, 4] });
    expect([MIN_VALUE, MAX_VALUE]).toEqual([-999, 999]);
    for (const nums of [[-999, 999], [3, 0, 500, -500], [999, 999, 999], [-999]]) {
      expect(validateAlgorithmInput(zeroes, nums, null).ok, JSON.stringify(nums)).toBe(true);
      expect(buildExecution('array-move-zeroes', nums).status).toBe('ok');
    }
    expect(validateDraft(zeroes, '-999, 0, 999, 3', '').ok).toBe(true);
    expect(zeroes.generateSteps([0, -999, 0, 999]).at(-1)!.cells!.result).toEqual([-999, 999, 0, 0]);
  });

  it('values above 2, up to 999, are accepted everywhere else as before', () => {
    // a plain array algorithm, and the algorithms with a minimum (heights from 0, weights from 1) or a length limit
    for (const id of ['bubble-sort', 'container-most-water', 'trapping-rain-water', 'heap-last-stone-weight', 'maximum-subarray'] as const) {
      const d = getAlgorithmDefinition(id)!;
      expect(validateAlgorithmInput(d, [999, 3, 500], null), id).toMatchObject({ ok: true });
    }
  });

  it('the "below the minimum" message of the other algorithms is unchanged: it still names 999 as the top', () => {
    expect(validateAlgorithmInput(getAlgorithmDefinition('container-most-water')!, [1, -1], null)).toMatchObject({
      ok: false,
      message: 'Value 2 (-1) is below 0: Container With Most Water takes values from 0 to 999.',
    });
  });
});

describe('Sort Colors: the four listings', () => {
  const line = (lang: ProgrammingLanguage, ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();

  it('the same statements in the same order in every language', () => {
    const EXPECTED: Record<string, Record<ProgrammingLanguage, string>> = {
      'init-low': { c: 'int low = 0;', cpp: 'int low = 0;', java: 'int low = 0;', python: 'low = 0' },
      'init-mid': { c: 'int mid = 0;', cpp: 'int mid = 0;', java: 'int mid = 0;', python: 'mid = 0' },
      'init-high': { c: 'int high = numsSize - 1;', cpp: 'int high = (int)nums.size() - 1;', java: 'int high = nums.length - 1;', python: 'high = len(nums) - 1' },
      'loop-condition': { c: 'while (mid <= high) {', cpp: 'while (mid <= high) {', java: 'while (mid <= high) {', python: 'while mid <= high:' },
      'check-zero': { c: 'if (nums[mid] == 0) {', cpp: 'if (nums[mid] == 0) {', java: 'if (nums[mid] == 0) {', python: 'if nums[mid] == 0:' },
      'swap-low': { c: 'int temp = nums[low];', cpp: 'swap(nums[low], nums[mid]);', java: 'int temp = nums[low];', python: 'nums[low], nums[mid] = nums[mid], nums[low]' },
      'advance-low': { c: 'low++;', cpp: 'low++;', java: 'low++;', python: 'low += 1' },
      'advance-mid-zero': { c: 'mid++;', cpp: 'mid++;', java: 'mid++;', python: 'mid += 1' },
      'check-one': { c: '} else if (nums[mid] == 1) {', cpp: '} else if (nums[mid] == 1) {', java: '} else if (nums[mid] == 1) {', python: 'elif nums[mid] == 1:' },
      'advance-mid-one': { c: 'mid++;', cpp: 'mid++;', java: 'mid++;', python: 'mid += 1' },
      'swap-high': { c: 'int temp = nums[mid];', cpp: 'swap(nums[mid], nums[high]);', java: 'int temp = nums[mid];', python: 'nums[mid], nums[high] = nums[high], nums[mid]' },
      'retreat-high': { c: 'high--;', cpp: 'high--;', java: 'high--;', python: 'high -= 1' },
    };
    for (const [ref, byLang] of Object.entries(EXPECTED)) for (const lang of LANGUAGES) expect(line(lang, ref), `${lang} ${ref}`).toBe(byLang[lang]);
    for (const lang of LANGUAGES) {
      const order = Object.keys(EXPECTED).map(ref => def.lineMap[lang][ref]);
      expect(order, lang).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size, lang).toBe(order.length);
      expect(def.lineMap[lang]['fn-exit']).toBe(def.lineMap[lang]['fn-entry']);
    }
  });

  it('mid is incremented exactly twice in every listing (after a 0 and after a 1), never in the branch of a 2', () => {
    for (const lang of LANGUAGES) {
      const lines = def.code[lang].split('\n').map(l => l.trim());
      expect(lines.filter(l => /^mid(\+\+;| \+= 1)$/.test(l)), lang).toHaveLength(2);
      expect(lines.filter(l => /^high(--;| -= 1)$/.test(l)), lang).toHaveLength(1);
      expect(lines.filter(l => /^low(\+\+;| \+= 1)$/.test(l)), lang).toHaveLength(1);
      // from the swap with high to the end of the listing: high moves, mid does not
      const tail = lines.slice(def.lineMap[lang]['swap-high'] - 1);
      expect(tail.some(l => /^mid(\+\+;| \+= 1)$/.test(l)), lang).toBe(false);
      expect(tail.some(l => /^high(--;| -= 1)$/.test(l)), lang).toBe(true);
    }
  });

  it('C and Java swap through a temporary over three lines, highlighted together; C++ and Python in one', () => {
    const SWAPS = {
      'swap-low': ['int temp = nums[low];', 'nums[low] = nums[mid];', 'nums[mid] = temp;'],
      'swap-high': ['int temp = nums[mid];', 'nums[mid] = nums[high];', 'nums[high] = temp;'],
    };
    for (const [ref, expected] of Object.entries(SWAPS)) {
      for (const lang of ['c', 'java'] as const) {
        const r = resolveCodeRange(def, lang, ref)!;
        expect(def.code[lang].split('\n').slice(r.start - 1, r.end).map(l => l.trim()), `${lang} ${ref}`).toEqual(expected);
      }
      for (const lang of ['cpp', 'python'] as const) expect(resolveCodeRange(def, lang, ref)!.end - resolveCodeRange(def, lang, ref)!.start).toBe(0);
    }
  });

  it('in place in every language: no sorting routine, no counting, no second array', () => {
    for (const lang of LANGUAGES) expect(def.code[lang], lang).not.toMatch(/sort\(|sorted|qsort|Arrays\.|Collections\.|count|new int|malloc|vector<int> \w+\(|= \[|copy|ArrayList/);
  });
});
