import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRange, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, MoveZeroesView, ProgrammingLanguage } from '../../types/algorithm';

const ID = 'array-move-zeroes';
const def = getAlgorithmDefinition(ID)!;
const run = (...nums: number[]) => def.generateSteps(nums);
const view = (s: ExecutionStep): MoveZeroesView => s.cells!;
const result = (...nums: number[]) => view(run(...nums).at(-1)!).result!;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** the reference, sharing nothing with the two pointers: the non-zero values in order, then the zeroes */
const reference = (nums: readonly number[]) => [...nums.filter(v => v !== 0), ...nums.filter(v => v === 0)];

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
/** every allowed length, with many zeroes, and negative values */
function randomInputs(count: number): number[][] {
  const rnd = random(20261110);
  const next = () => rnd.next().value as number;
  return Array.from({ length: count }, (_, k) => Array.from({ length: 1 + Math.floor(next() * 10) }, () => (next() < 0.4 ? 0 : Math.floor(next() * (k % 2 ? 7 : 1999)) - (k % 2 ? 3 : 999))));
}

const EDGE: [string, number[]][] = [
  ['the example', [0, 1, 0, 3, 12]],
  ['no zeroes', [1, 2, 3]],
  ['all zeroes', [0, 0, 0]],
  ['zeroes at the beginning', [0, 0, 1]],
  ['zeroes at the end', [4, 5, 0, 0]],
  ['consecutive zeroes in the middle', [1, 0, 0, 0, 2]],
  ['a single zero', [0]],
  ['a single non-zero value', [7]],
  ['negative values', [-1, 0, -2, 0, 3]],
  ['mixed signs, ten values', [0, -999, 0, 999, 5, 0, -5, 0, 1, 0]],
];

describe('Move Zeroes: where it is listed and how it is drawn', () => {
  it('an ARRAYS algorithm after Remove Duplicates (no Two Pointers category exists); not Coming Soon', () => {
    const arrays = ALGORITHM_NAV.filter(a => a.category === 'ARRAYS').map(a => a.id);
    expect(arrays.indexOf(ID)).toBe(arrays.indexOf('remove-duplicates-sorted') + 1);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Move Zeroes', implemented: true });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it('drawn as indexed cells, not bars; 1 to 10 values; O(n) time, O(1) space', () => {
    expect(def).toMatchObject({ id: ID, category: 'ARRAYS', visual: 'cells', defaultInput: [0, 1, 0, 3, 12] });
    expect(visualKindOf(def)).toBe('cells');
    expect(def.inputSpec).toMatchObject({ minLength: 1, maxLength: 10 });
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    expect(buildExecution(ID, [0, 1, 0, 3, 12]).status).toBe('ok');
  });
});

describe('Move Zeroes: the result', () => {
  it.each([
    [[0, 1, 0, 3, 12], [1, 3, 12, 0, 0]],
    [[0, 0, 1], [1, 0, 0]],
    [[1, 2, 3], [1, 2, 3]],
    [[0, 0, 0], [0, 0, 0]],
  ])('%j → %j', (input, output) => {
    expect(result(...input)).toEqual(output);
  });

  it.each(EDGE)('%s: zeroes at the end, the non-zero values in their order', (_name, nums) => {
    expect(result(...nums)).toEqual(reference(nums));
  });

  it('300 random inputs of every allowed length, with negatives and many zeroes, agree with the reference', () => {
    const lengths = new Set<number>();
    for (const nums of randomInputs(300)) {
      expect(result(...nums), JSON.stringify(nums)).toEqual(reference(nums));
      lengths.add(nums.length);
    }
    expect([...lengths].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('Move Zeroes: in place, in order, no unnecessary swaps', () => {
  const ALL = [...EDGE.map(([, n]) => n), ...randomInputs(120)];

  it('in place: the array keeps its length, and each step changes it only by the swap it shows', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const [k, s] of steps.entries()) {
        const v = view(s);
        expect(v.nums).toHaveLength(nums.length);
        expect(s.state).toEqual([...v.nums]);
        expect(v.input).toEqual(nums);
        if (k === 0) continue;
        const before = view(steps[k - 1]).nums;
        if (v.swapped) {
          const [a, b] = v.swapped;
          expect([v.nums[a], v.nums[b]], `${JSON.stringify(nums)} step ${k}`).toEqual([before[b], before[a]]);
          expect(v.nums.filter((_, i) => i !== a && i !== b)).toEqual(before.filter((_, i) => i !== a && i !== b));
        } else expect(v.nums, `${JSON.stringify(nums)} step ${k}`).toEqual(before);
      }
    }
  });

  it('never swaps a position with itself: slow == fast skips the swap', () => {
    for (const nums of ALL) {
      const steps = run(...nums);
      for (const [k, s] of steps.entries()) {
        if (s.codeRef === 'swap') expect(view(s).swapped![0]).not.toBe(view(s).swapped![1]);
        if (s.codeRef === 'check-distinct' && view(s).pair!.same) expect(steps[k + 1].codeRef).toBe('advance-slow');
      }
    }
    // [1, 2, 3]: every value is already in place, so there is no swap at all
    const none = run(1, 2, 3);
    expect(none.filter(s => s.codeRef === 'swap')).toEqual([]);
    expect(none.filter(s => s.codeRef === 'check-distinct').map(s => [s.result, s.message])).toEqual([
      ['false', 'slow=0 != fast=0 → FALSE — already in place, no swap'],
      ['false', 'slow=1 != fast=1 → FALSE — already in place, no swap'],
      ['false', 'slow=2 != fast=2 → FALSE — already in place, no swap'],
    ]);
  });

  it('the invariant: before slow, the first slow non-zero values in order; from slow to fast, only zeroes', () => {
    for (const nums of ALL) {
      const nonZero = nums.filter(x => x !== 0);
      for (const s of run(...nums)) {
        const v = view(s);
        // between the swap and slow++, the value just placed sits at slow: the invariant holds again after slow++
        if (v.slow === null || s.codeRef === 'swap') continue;
        const where = `${JSON.stringify(nums)} step ${s.id} ${s.codeRef}`;
        expect(v.nums.slice(0, v.slow), where).toEqual(nonZero.slice(0, v.slow));
        // fast is unset before the loop (nothing scanned yet) and after it (everything scanned)
        const scanned = s.codeRef === 'init-slow' ? 0 : (v.fast ?? nums.length);
        expect(v.nums.slice(v.slow, scanned).every(x => x === 0), where).toBe(true);
        expect(v.kept).toBe(v.slow);
      }
    }
  });

  it('[0, 1, 0, 3, 12]: the arrays after each swap are those of the trace', () => {
    const swaps = run(0, 1, 0, 3, 12).filter(s => s.codeRef === 'swap').map(s => [view(s).swapped, view(s).nums]);
    expect(swaps).toEqual([
      [[0, 1], [1, 0, 0, 3, 12]],
      [[1, 3], [1, 3, 0, 0, 12]],
      [[2, 4], [1, 3, 12, 0, 0]],
    ]);
  });
});

describe('Move Zeroes: the steps', () => {
  it('[0, 1]: the exact order of statements (a zero skipped, then a non-zero swapped in)', () => {
    expect(run(0, 1).map(s => s.codeRef)).toEqual([
      'fn-entry', 'init-slow',
      'loop-condition', 'check-nonzero', 'loop-condition',
      'loop-condition', 'check-nonzero', 'check-distinct', 'swap', 'advance-slow', 'loop-condition',
      'loop-condition', 'fn-exit',
    ]);
  });

  it('a zero is checked and skipped; a non-zero value is checked and placed', () => {
    const steps = run(0, 5);
    expect(steps.filter(s => s.codeRef === 'check-nonzero').map(s => [s.result, view(s).examined])).toEqual([
      ['false', { index: 0, zero: true }],
      ['true', { index: 1, zero: false }],
    ]);
  });

  it('snapshots are immutable: a later step never changes an earlier one', () => {
    const steps = run(0, 1, 0, 3, 12);
    const before = JSON.stringify(steps.map(s => s.cells));
    for (const s of steps) {
      expect(Object.isFrozen(view(s).nums)).toBe(true);
      expect(Object.isFrozen(view(s).input)).toBe(true);
    }
    expect(JSON.stringify(steps.map(s => s.cells))).toBe(before);
    expect(view(steps[0]).nums).toEqual([0, 1, 0, 3, 12]);
  });

  it('ids are contiguous, init first and complete last; the result is on the last step only', () => {
    for (const nums of EDGE.map(([, n]) => n)) {
      const steps = run(...nums);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
      expect(steps[0].type).toBe('init');
      expect(steps.at(-1)!.type).toBe('complete');
      expect(steps.filter(s => view(s).result)).toEqual([steps.at(-1)]);
    }
    expect(run(0, 1, 0, 3, 12)).toHaveLength(28);
  });

  it('every codeRef is reached, and every step highlights a line in every language', () => {
    const reached = new Set<string>();
    for (const nums of [...EDGE.map(([, n]) => n), ...randomInputs(40)]) {
      for (const s of run(...nums)) {
        reached.add(s.codeRef!);
        for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, s.codeRef), `${lang} ${s.codeRef}`).not.toBeNull();
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(def.lineMap.cpp).sort());
  });

  it('no message or explanation shows undefined or NaN', () => {
    for (const nums of [...EDGE.map(([, n]) => n), ...randomInputs(40)]) {
      for (const s of run(...nums)) expect(`${s.message} ${s.explanation ?? ''} ${s.actionLabel ?? ''} ${s.outcomeText ?? ''}`, `${JSON.stringify(nums)} step ${s.id}`).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('Move Zeroes: the input', () => {
  it('1 to 10 whole numbers from -999 to 999 are accepted (the global range)', () => {
    for (const text of ['0', '0, 1, 0, 3, 12', '-999, 999', '1, 2, 3, 4, 5, 6, 7, 8, 9, 10']) expect(validateDraft(def, text, '').ok, text).toBe(true);
  });

  it.each([
    ['', 'Move Zeroes needs at least 1 values; the array is empty.'],
    ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11', 'Too many values (11). The visualizer supports at most 10.'],
    ['1000', 'Value 1 (1000) is out of range — use values from -999 to 999.'],
    ['-1000', 'Value 1 (-1000) is out of range — use values from -999 to 999.'],
    ['1.5', 'Value 1 ("1.5") is a decimal — only whole numbers are supported.'],
    ['1, x', 'Value 2 ("x") is not a whole number.'],
  ])('%j is refused: %s', (text, message) => {
    expect(validateDraft(def, text, '')).toMatchObject({ ok: false, message });
  });

  it('the engine refuses an empty array and more than 10 values', () => {
    for (const bad of [[], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]]) {
      expect(validateAlgorithmInput(def, bad, null).ok, JSON.stringify(bad)).toBe(false);
      expect(() => def.generateSteps(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
});

describe('Move Zeroes: the four listings', () => {
  const line = (lang: ProgrammingLanguage, ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();

  it('the same statements in the same order in every language', () => {
    const EXPECTED: Record<string, Record<ProgrammingLanguage, string>> = {
      'init-slow': { c: 'int slow = 0;', cpp: 'int slow = 0;', java: 'int slow = 0;', python: 'slow = 0' },
      'loop-condition': { c: 'for (int fast = 0; fast < numsSize; fast++) {', cpp: 'for (int fast = 0; fast < (int)nums.size(); fast++) {', java: 'for (int fast = 0; fast < nums.length; fast++) {', python: 'for fast in range(len(nums)):' },
      'check-nonzero': { c: 'if (nums[fast] != 0) {', cpp: 'if (nums[fast] != 0) {', java: 'if (nums[fast] != 0) {', python: 'if nums[fast] != 0:' },
      'check-distinct': { c: 'if (slow != fast) {', cpp: 'if (slow != fast) {', java: 'if (slow != fast) {', python: 'if slow != fast:' },
      swap: { c: 'int temp = nums[slow];', cpp: 'swap(nums[slow], nums[fast]);', java: 'int temp = nums[slow];', python: 'nums[slow], nums[fast] = nums[fast], nums[slow]' },
      'advance-slow': { c: 'slow++;', cpp: 'slow++;', java: 'slow++;', python: 'slow += 1' },
    };
    for (const [ref, byLang] of Object.entries(EXPECTED)) for (const lang of LANGUAGES) expect(line(lang, ref), `${lang} ${ref}`).toBe(byLang[lang]);
    for (const lang of LANGUAGES) {
      const order = ['fn-entry', 'init-slow', 'loop-condition', 'check-nonzero', 'check-distinct', 'swap', 'advance-slow'].map(ref => def.lineMap[lang][ref]);
      expect(order, lang).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('C and Java swap through a temporary over three lines, highlighted together; C++ and Python in one', () => {
    for (const lang of ['c', 'java'] as const) {
      const r = resolveCodeRange(def, lang, 'swap')!;
      expect(def.code[lang].split('\n').slice(r.start - 1, r.end).map(l => l.trim())).toEqual(['int temp = nums[slow];', 'nums[slow] = nums[fast];', 'nums[fast] = temp;']);
    }
    for (const lang of ['cpp', 'python'] as const) expect(resolveCodeRange(def, lang, 'swap')!.end - resolveCodeRange(def, lang, 'swap')!.start).toBe(0);
  });

  it('in place in every language: no second array, no sort, no filter', () => {
    for (const lang of LANGUAGES) expect(def.code[lang], lang).not.toMatch(/sort|filter|new int|malloc|vector<int> \w+\(|\[\]\s*=|= \[|copy|ArrayList/);
  });
});
