import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRange, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep, PascalRowView, ProgrammingLanguage } from '../../types/algorithm';

const ID = 'dp-pascals-triangle-ii';
const def = getAlgorithmDefinition(ID)!;
const run = (rowIndex: number) => def.generateSteps([rowIndex]);
const view = (s: ExecutionStep): PascalRowView => s.dpRow!;
const result = (rowIndex: number) => view(run(rowIndex).at(-1)!).result!;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** the reference, sharing nothing with the trace: binomial coefficients C(n, k) */
const binomialRow = (n: number) =>
  Array.from({ length: n + 1 }, (_, k) => {
    let c = 1;
    for (let m = 1; m <= k; m++) c = (c * (n - k + m)) / m;
    return c;
  });

describe("Pascal's Triangle II: where it is listed and how it is drawn", () => {
  it("a separate DP algorithm right after Pascal's Triangle, not Coming Soon", () => {
    const dp = ALGORITHM_NAV.filter(a => a.category === 'DP');
    expect(dp.map(a => a.id).slice(0, 5)).toEqual(['dp-pascals-triangle', ID, 'dp-climbing-stairs', 'dp-house-robber', 'fibonacci']);
    expect(dp[1]).toMatchObject({ name: "Pascal's Triangle II", implemented: true });
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
    expect(getAlgorithmDefinition('dp-pascals-triangle')!.visual).toBe('triangle');
  });

  it('drawn as one row (dp-row), taking rowIndex: 0 to 9, default 3', () => {
    expect(def).toMatchObject({ id: ID, name: "Pascal's Triangle II", category: 'DP', visual: 'dp-row', defaultInput: [3] });
    expect(visualKindOf(def)).toBe('dp-row');
    expect(def.inputSpec!.numbers).toEqual([{ label: 'rowIndex', hint: 'The row to return, counting from 0: 0 to 9', min: 0, max: 9, random: [2, 7] }]);
    expect(buildExecution(ID, [3]).status).toBe('ok');
  });

  it('complexity: O(rowIndex²) time, O(rowIndex) space for the one row', () => {
    expect(def.complexity).toMatchObject({ best: 'O(rowIndex²)', average: 'O(rowIndex²)', worst: 'O(rowIndex²)', space: 'O(rowIndex)' });
  });
});

describe("Pascal's Triangle II: the result", () => {
  it.each([
    [0, [1]],
    [1, [1, 1]],
    [2, [1, 2, 1]],
    [3, [1, 3, 3, 1]],
    [5, [1, 5, 10, 10, 5, 1]],
    [9, [1, 9, 36, 84, 126, 126, 84, 36, 9, 1]],
  ])('rowIndex = %i → %j', (rowIndex, row) => {
    expect(result(rowIndex)).toEqual(row);
    expect(run(rowIndex).at(-1)!.outcomeText).toBe(`Row ${rowIndex} of Pascal's Triangle: [${row.join(', ')}]`);
  });

  it('every allowed rowIndex: rowIndex + 1 values, 1 at both ends, symmetric, equal to the binomial coefficients', () => {
    for (let n = 0; n <= 9; n++) {
      const row = result(n);
      expect(row).toHaveLength(n + 1);
      expect([row[0], row.at(-1)]).toEqual([1, 1]);
      expect(row).toEqual([...row].reverse());
      expect(row).toEqual(binomialRow(n));
    }
  });

  it('only the requested row is produced: the array never holds more than rowIndex + 1 values', () => {
    for (const s of run(9)) expect(view(s).row.length).toBeLessThanOrEqual(10);
    expect(run(9).some(s => 'triangle' in s && s.triangle)).toBe(false);
  });
});

describe("Pascal's Triangle II: the backward updates", () => {
  it('in every pass j runs from i - 1 down to 1, never forwards', () => {
    for (let n = 0; n <= 9; n++) {
      const byRow = new Map<number, number[]>();
      for (const s of run(n)) {
        if (s.codeRef !== 'update-cell') continue;
        const v = view(s);
        byRow.set(v.i!, [...(byRow.get(v.i!) ?? []), v.j!]);
      }
      for (const [i, js] of byRow) expect(js, `rowIndex ${n}, i ${i}`).toEqual(Array.from({ length: i - 1 }, (_, k) => i - 1 - k));
      // rows 0 and 1 have no middle cell
      expect(byRow.has(0) || byRow.has(1)).toBe(false);
    }
  });

  it('each update adds the previous row\'s row[j - 1]: going right to left keeps it until it is used', () => {
    const steps = run(9);
    // the row before each pass: the array at the pass's row-loop check
    const before = new Map<number, readonly number[]>();
    for (const s of steps) if (s.codeRef === 'row-loop' && s.result === 'true' && view(s).i! > 0) before.set(view(s).i!, view(s).row);
    for (const s of steps) {
      const v = view(s);
      if (s.codeRef !== 'update-cell') continue;
      const prev = before.get(v.i!)!;
      expect(v.operands, `${v.i},${v.j}`).toEqual({ current: prev[v.j!], left: prev[v.j! - 1] });
      expect(v.row[v.j!]).toBe(prev[v.j!] + prev[v.j! - 1]);
    }
    // a forward loop would have used the new row[1] for row[2] of row 3: 2 + 2 = 4 (wrong), not 1 + 2 = 3
    const row3 = run(3).filter(s => s.codeRef === 'update-cell').map(s => [view(s).j, view(s).operands, view(s).sum]);
    expect(row3).toEqual([
      [1, { current: 1, left: 1 }, 2],
      [2, { current: 1, left: 2 }, 3],
      [1, { current: 2, left: 1 }, 3],
    ]);
  });

  it('the cells this pass has updated, right to left; row[0] is never updated', () => {
    for (const s of run(6)) {
      const v = view(s);
      if (v.j === null || v.i === null || v.i < 2) continue;
      // fresh: the positions above j (j + 1 .. i - 1), or including j once it is updated
      const upTo = v.focus?.kind === 'updated' ? v.j : v.j + 1;
      expect(v.fresh, `${s.id}`).toEqual(Array.from({ length: Math.max(0, v.i - upTo) }, (_, k) => v.i! - 1 - k).filter(k => k >= upTo));
    }
    expect(run(9).some(s => s.codeRef === 'update-cell' && view(s).j === 0)).toBe(false);
  });

  it('read, add, update: the operands, then their sum, then row[j] holds it; the message shows the calculation', () => {
    const steps = run(3);
    const k = steps.findIndex(s => s.codeRef === 'read-values' && view(s).i === 3 && view(s).j === 2);
    expect(view(steps[k])).toMatchObject({ focus: { index: 2, kind: 'read' }, operands: { current: 1, left: 2 } });
    expect(view(steps[k]).sum).toBeUndefined();
    expect(view(steps[k]).row).toEqual([1, 2, 1, 1]);
    expect(steps[k + 1]).toMatchObject({ codeRef: 'add-values', message: '1 + 2 = 3' });
    expect(view(steps[k + 1]).sum).toBe(3);
    expect(steps[k + 2]).toMatchObject({ codeRef: 'update-cell', message: 'row[2] = 1 + 2 = 3' });
    expect(view(steps[k + 2]).row).toEqual([1, 2, 3, 1]);
  });
});

describe("Pascal's Triangle II: the steps", () => {
  it('rowIndex = 0: append one 1; the backward loop never runs', () => {
    expect(run(0).map(s => s.codeRef)).toEqual(['init', 'row-loop', 'append-one', 'col-loop', 'row-loop', 'row-loop', 'return-result']);
    expect(run(0).some(s => view(s).operands)).toBe(false);
  });

  it('rowIndex = 2: the exact order of statements', () => {
    expect(run(2).map(s => s.codeRef)).toEqual([
      'init',
      'row-loop', 'append-one', 'col-loop', 'row-loop',
      'row-loop', 'append-one', 'col-loop', 'row-loop',
      'row-loop', 'append-one', 'col-loop', 'read-values', 'add-values', 'update-cell', 'col-loop', 'col-loop', 'row-loop',
      'row-loop', 'return-result',
    ]);
  });

  it('every row begins with a new 1 at the end, and ends complete when the backward loop stops', () => {
    const steps = run(5);
    const appended = steps.filter(s => s.codeRef === 'append-one');
    expect(appended.map(s => [view(s).focus, view(s).row.at(-1), view(s).row.length])).toEqual([0, 1, 2, 3, 4, 5].map(i => [{ index: i, kind: 'appended' }, 1, i + 1]));
    const complete = steps.filter(s => view(s).rowComplete);
    expect(complete.map(s => [s.codeRef, s.result, view(s).i])).toEqual([0, 1, 2, 3, 4, 5].map(i => ['col-loop', 'false', i]));
    complete.forEach(s => expect(view(s).row).toEqual(binomialRow(view(s).i!)));
  });

  it('state is the array on every step', () => {
    for (const s of run(7)) {
      expect(s.state).toEqual([...view(s).row]);
      expect(view(s).rowIndex).toBe(7);
    }
  });

  it('snapshots are immutable: a later step never changes an earlier one', () => {
    const steps = run(6);
    const before = JSON.stringify(steps.map(s => s.dpRow));
    for (const s of steps) {
      expect(Object.isFrozen(view(s).row)).toBe(true);
      expect(Object.isFrozen(view(s).fresh)).toBe(true);
    }
    expect(JSON.stringify(steps.map(s => s.dpRow))).toBe(before);
    expect(view(steps.find(s => s.codeRef === 'append-one')!).row).toEqual([1]);
  });

  it('ids are contiguous, init first and complete last; the result is on the last step only', () => {
    const steps = run(9);
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0].type).toBe('init');
    expect(steps.at(-1)!.type).toBe('complete');
    expect(steps.filter(s => view(s).result)).toEqual([steps.at(-1)]);
    expect(steps).toHaveLength(223);
  });

  it('every codeRef is reached, and every step highlights a line in every language', () => {
    const reached = new Set<string>();
    for (let n = 0; n <= 9; n++) {
      for (const s of run(n)) {
        reached.add(s.codeRef!);
        for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, s.codeRef), `${lang} ${s.codeRef}`).not.toBeNull();
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(def.lineMap.cpp).sort());
  });

  it('no message or explanation shows undefined or NaN', () => {
    for (let n = 0; n <= 9; n++) {
      for (const s of run(n)) expect(`${s.message} ${s.explanation ?? ''} ${s.actionLabel ?? ''} ${s.outcomeText ?? ''}`, `${n} step ${s.id}`).not.toMatch(/undefined|NaN/);
    }
  });
});

describe("Pascal's Triangle II: the input", () => {
  it('0, 3 and 9 are accepted', () => {
    for (const n of ['0', '3', '9']) expect(validateNumberDraft(def, [n])).toEqual({ ok: true, values: [Number(n)] });
  });

  it.each([
    ['-1', '"rowIndex" (-1) is out of range — use values from 0 to 9.'],
    ['10', '"rowIndex" (10) is out of range — use values from 0 to 9.'],
    ['1.5', '"rowIndex" ("1.5") is a decimal — only whole numbers are supported.'],
    ['', 'Enter a value for "rowIndex".'],
    ['abc', '"rowIndex" ("abc") is not a whole number.'],
    ['3x', '"rowIndex" ("3x") is not a whole number.'],
  ])('%j is refused: %s', (text, message) => {
    expect(validateNumberDraft(def, [text])).toEqual({ ok: false, field: 0, message });
  });

  it('the engine refuses what the form refuses, instead of returning a wrong row', () => {
    for (const bad of [[-1], [10], [1.5], [], [3, 4]]) {
      expect(validateAlgorithmInput(def, bad, null).ok, JSON.stringify(bad)).toBe(false);
      expect(() => def.generateSteps(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
});

describe("Pascal's Triangle II: the four listings", () => {
  const code = (lang: ProgrammingLanguage) => def.code[lang];
  const line = (lang: ProgrammingLanguage, ref: string) => code(lang).split('\n')[def.lineMap[lang][ref] - 1].trim();

  it('the same statements in the same order in every language, with a backward inner loop', () => {
    const EXPECTED: Record<string, Record<ProgrammingLanguage, string>> = {
      init: { c: 'int* row = malloc((rowIndex + 1) * sizeof(int));', cpp: 'vector<int> row;', java: 'List<Integer> row = new ArrayList<>();', python: 'row = []' },
      'row-loop': { c: 'for (int i = 0; i <= rowIndex; i++) {', cpp: 'for (int i = 0; i <= rowIndex; i++) {', java: 'for (int i = 0; i <= rowIndex; i++) {', python: 'for i in range(row_index + 1):' },
      'append-one': { c: 'row[size++] = 1;', cpp: 'row.push_back(1);', java: 'row.add(1);', python: 'row.append(1)' },
      'col-loop': { c: 'for (int j = i - 1; j >= 1; j--) {', cpp: 'for (int j = i - 1; j >= 1; j--) {', java: 'for (int j = i - 1; j >= 1; j--) {', python: 'for j in range(i - 1, 0, -1):' },
      'update-cell': { c: 'row[j] = row[j] + row[j - 1];', cpp: 'row[j] = row[j] + row[j - 1];', java: 'row.set(j, row.get(j) + row.get(j - 1));', python: 'row[j] = row[j] + row[j - 1]' },
      'return-result': { c: '*returnSize = size;', cpp: 'return row;', java: 'return row;', python: 'return row' },
    };
    for (const [ref, byLang] of Object.entries(EXPECTED)) for (const lang of LANGUAGES) expect(line(lang, ref), `${lang} ${ref}`).toBe(byLang[lang]);
    for (const lang of LANGUAGES) {
      expect(def.lineMap[lang]['read-values']).toBe(def.lineMap[lang]['update-cell']);
      expect(def.lineMap[lang]['add-values']).toBe(def.lineMap[lang]['update-cell']);
      const order = ['init', 'row-loop', 'append-one', 'col-loop', 'update-cell', 'return-result'].map(ref => def.lineMap[lang][ref]);
      expect(order, lang).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('C allocates the row and starts its size at 0, and sets the size before returning, over two lines each', () => {
    const lines = code('c').split('\n');
    const span = (ref: string) => {
      const r = resolveCodeRange(def, 'c', ref)!;
      return lines.slice(r.start - 1, r.end).map(l => l.trim());
    };
    expect(span('init')).toEqual(['int* row = malloc((rowIndex + 1) * sizeof(int));', 'int size = 0;']);
    expect(span('return-result')).toEqual(['*returnSize = size;', 'return row;']);
  });

  it('one-dimensional DP in every language: one array, no triangle, no recursion, no formula', () => {
    expect(code('c')).toContain('int* getRow(int rowIndex, int* returnSize)');
    expect(code('cpp')).toContain('vector<int> getRow(int rowIndex)');
    expect(code('java')).toContain('public static List<Integer> getRow(int rowIndex)');
    expect(code('python')).toContain('def get_row(row_index):');
    for (const lang of LANGUAGES) {
      // no triangle variable (the Java class name PascalsTriangleII is not one), no formula
      expect(code(lang), lang).not.toMatch(/\btriangle\b|factorial|comb\(|choose|binom/i);
      expect(code(lang).match(/getRow|get_row/g), `${lang}: getRow is not called again (no recursion)`).toHaveLength(1);
    }
  });
});
