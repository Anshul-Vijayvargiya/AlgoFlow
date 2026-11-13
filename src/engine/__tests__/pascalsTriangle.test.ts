import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRange, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { IMPLEMENTED_TOPICS } from '../../data/algorithmCatalog';
import type { ExecutionStep, PascalTriangleView, ProgrammingLanguage } from '../../types/algorithm';

const ID = 'dp-pascals-triangle';
const def = getAlgorithmDefinition(ID)!;
const run = (numRows: number) => def.generateSteps([numRows]);
const view = (s: ExecutionStep): PascalTriangleView => s.triangle!;
const result = (numRows: number) => view(run(numRows).at(-1)!).result!;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** the reference, sharing nothing with the trace: binomial coefficients C(i, j) = i! / (j! (i - j)!) */
function binomialRows(numRows: number): number[][] {
  const choose = (i: number, j: number) => {
    let c = 1;
    for (let k = 1; k <= j; k++) c = (c * (i - j + k)) / k;
    return c;
  };
  return Array.from({ length: numRows }, (_, i) => Array.from({ length: i + 1 }, (_, j) => choose(i, j)));
}

describe("Pascal's Triangle: where it is listed and how it is drawn", () => {
  it("the first implemented algorithm of DYNAMIC PROGRAMMING (Pascal's Triangle II next), not Coming Soon; the other DP entries keep their order", () => {
    const dp = ALGORITHM_NAV.filter(a => a.category === 'DP');
    expect(dp.map(a => [a.id, a.implemented])).toEqual([
      [ID, true],
      ['dp-pascals-triangle-ii', true],
      ['dp-climbing-stairs', true],
      ['dp-house-robber', true],
      ['fibonacci', false],
      ['knapsack', false],
      ['lcs', false],
    ]);
    expect(dp[0].name).toBe("Pascal's Triangle");
    expect(ALGORITHM_CATEGORIES.find(c => c.id === 'DP')!.label).toBe('DYNAMIC PROGRAMMING');
    expect(IMPLEMENTED_TOPICS.find(t => t.topic === 'Dynamic Programming')!.algorithmIds).toEqual([ID, 'dp-pascals-triangle-ii', 'dp-climbing-stairs', 'dp-house-robber']);
  });

  it('one registered definition, drawn as a triangle, taking numRows: 1 to 10, default 5', () => {
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
    expect(def).toMatchObject({ id: ID, name: "Pascal's Triangle", category: 'DP', visual: 'triangle', defaultInput: [5] });
    expect(visualKindOf(def)).toBe('triangle');
    expect(def.inputSpec!.numbers).toEqual([{ label: 'numRows', hint: 'The number of rows: 1 to 10', min: 1, max: 10, random: [3, 8] }]);
    expect(buildExecution(ID, [5]).status).toBe('ok');
  });

  it('complexity: O(numRows²) time and space', () => {
    expect(def.complexity).toMatchObject({ best: 'O(numRows²)', average: 'O(numRows²)', worst: 'O(numRows²)', space: 'O(numRows²)' });
  });
});

describe("Pascal's Triangle: the result", () => {
  it('numRows = 5 → the five rows of the example', () => {
    expect(result(5)).toEqual([[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]);
    expect(run(5).at(-1)!.outcomeText).toBe("Pascal's Triangle with 5 rows: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]");
  });

  it.each([
    [1, [[1]]],
    [2, [[1], [1, 1]]],
  ])('numRows = %i → %j', (numRows, rows) => {
    expect(result(numRows)).toEqual(rows);
  });

  it('numRows = 10: the last row is 1 9 36 84 126 126 84 36 9 1', () => {
    expect(result(10).at(-1)).toEqual([1, 9, 36, 84, 126, 126, 84, 36, 9, 1]);
  });

  it('every allowed numRows: rows of length 1 .. numRows, numRows(numRows + 1) / 2 cells, boundary cells 1, equal to the binomial coefficients', () => {
    for (let numRows = 1; numRows <= 10; numRows++) {
      const rows = result(numRows);
      expect(rows.map(r => r.length)).toEqual(Array.from({ length: numRows }, (_, i) => i + 1));
      expect(rows.flat()).toHaveLength((numRows * (numRows + 1)) / 2);
      for (const r of rows) expect([r[0], r.at(-1)]).toEqual([1, 1]);
      expect(rows).toEqual(binomialRows(numRows));
    }
  });

  it('every middle cell is the sum of the two cells above it', () => {
    const rows = result(10);
    for (let i = 2; i < rows.length; i++) {
      for (let j = 1; j < i; j++) expect(rows[i][j], `${i},${j}`).toBe(rows[i - 1][j - 1] + rows[i - 1][j]);
    }
  });
});

describe("Pascal's Triangle: the steps", () => {
  it('numRows = 1: the first row reads no previous row (its column loop never runs)', () => {
    expect(run(1).map(s => s.codeRef)).toEqual(['init', 'row-loop', 'create-row', 'set-first', 'set-last', 'col-loop', 'add-row', 'row-loop', 'row-loop', 'return-result']);
    expect(run(1).some(s => view(s).parents)).toBe(false);
  });

  it('numRows = 3: the exact order of statements, the one middle cell read, added and stored', () => {
    // every row starts the same way: the loop check, the new row, its two boundary cells
    const start = ['row-loop', 'create-row', 'set-first', 'set-last'];
    expect(run(3).map(s => s.codeRef)).toEqual([
      'init',
      ...start, 'col-loop', 'add-row', 'row-loop',
      ...start, 'col-loop', 'add-row', 'row-loop',
      ...start, 'col-loop', 'read-parents', 'add-parents', 'assign-cell', 'col-loop', 'col-loop', 'add-row', 'row-loop',
      'row-loop', 'return-result',
    ]);
  });

  it('the parents of a cell are the two cells directly above it, with their values; the sum is theirs; the cell gets it', () => {
    for (const s of run(10)) {
      const v = view(s);
      if (!v.parents) continue;
      const [left, right] = v.parents;
      const j = v.focus!.col;
      expect([left.row, left.col, right.row, right.col], `${s.id}`).toEqual([v.i! - 1, j - 1, v.i! - 1, j]);
      expect(left.value).toBe(v.triangle[v.i! - 1][j - 1]);
      expect(right.value).toBe(v.triangle[v.i! - 1][j]);
      if (v.focus!.kind === 'parents') {
        expect(v.sum).toBeUndefined();
        expect(v.row![j]).toBeNull();
      } else expect(v.sum).toBe(left.value + right.value);
      if (v.focus!.kind === 'assigned') expect(v.row![j]).toBe(v.sum);
    }
    const sum = run(5).find(s => s.codeRef === 'add-parents' && view(s).i === 4 && view(s).j === 2)!;
    expect(sum.message).toBe('3 + 3 = 6');
  });

  it('boundary steps set the first and the last cell of the row to 1 (the same cell in row 0)', () => {
    for (const s of run(6)) {
      const v = view(s);
      if (s.codeRef === 'set-first') expect([v.focus, v.row![0]]).toEqual([{ col: 0, kind: 'boundary' }, 1]);
      if (s.codeRef === 'set-last') expect([v.focus, v.row![v.i!]]).toEqual([{ col: v.i, kind: 'boundary' }, 1]);
    }
    expect(run(1).find(s => s.codeRef === 'set-last')!.explanation).toContain('also the first');
  });

  it('a row is complete when its column loop ends, then it is appended; rows are appended in order', () => {
    const steps = run(5);
    const complete = steps.filter(s => view(s).rowComplete);
    expect(complete.map(s => [s.codeRef, s.result, view(s).i])).toEqual([0, 1, 2, 3, 4].map(i => ['col-loop', 'false', i]));
    for (const s of complete) expect(view(s).row!.every(v => v !== null)).toBe(true);
    const appended = steps.filter(s => s.codeRef === 'add-row');
    expect(appended.map(s => view(s).appended)).toEqual([0, 1, 2, 3, 4]);
    for (const s of appended) expect(view(s)).toMatchObject({ row: null, j: null });
    expect(appended.map(s => view(s).triangle.length)).toEqual([1, 2, 3, 4, 5]);
  });

  it('only the completed rows are in the triangle; the row being filled holds null where nothing is set yet', () => {
    for (const s of run(7)) {
      const v = view(s);
      expect(v.numRows).toBe(7);
      expect(s.state).toEqual([]);
      v.triangle.forEach((r, i) => expect(r).toHaveLength(i + 1));
      if (v.row) {
        expect(v.row).toHaveLength(v.i! + 1);
        expect(v.triangle).toHaveLength(v.i!);
      }
    }
    const created = run(3).filter(s => s.codeRef === 'create-row').map(s => view(s).row);
    expect(created).toEqual([[null], [null, null], [null, null, null]]);
  });

  it('snapshots are immutable: a later step never changes an earlier one', () => {
    const steps = run(6);
    const before = JSON.stringify(steps.map(s => s.triangle));
    for (const s of steps) {
      const v = view(s);
      expect(Object.isFrozen(v.triangle)).toBe(true);
      v.triangle.forEach(r => expect(Object.isFrozen(r)).toBe(true));
      if (v.row) expect(Object.isFrozen(v.row)).toBe(true);
    }
    // the steps share no array: the snapshot of step k is the same after every later step was made
    expect(JSON.stringify(steps.map(s => s.triangle))).toBe(before);
    const first = steps.find(s => s.codeRef === 'add-row')!;
    expect(view(first).triangle).toEqual([[1]]);
    expect(view(steps.at(-1)!).result).not.toBe(view(steps.at(-1)!).triangle);
  });

  it('ids are contiguous, the first step is init and the last is complete; the result is on the last step only', () => {
    const steps = run(10);
    expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
    expect(steps[0].type).toBe('init');
    expect(steps.at(-1)!.type).toBe('complete');
    expect(steps.filter(s => view(s).result)).toEqual([steps.at(-1)]);
    expect(steps).toHaveLength(253);
  });

  it('every codeRef is reached, and every step highlights a line in every language', () => {
    const reached = new Set<string>();
    for (let numRows = 1; numRows <= 10; numRows++) {
      for (const s of run(numRows)) {
        reached.add(s.codeRef!);
        for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, s.codeRef), `${lang} ${s.codeRef}`).not.toBeNull();
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(def.lineMap.cpp).sort());
  });

  it('no message or explanation shows undefined or NaN', () => {
    for (let numRows = 1; numRows <= 10; numRows++) {
      for (const s of run(numRows)) expect(`${s.message} ${s.explanation ?? ''} ${s.actionLabel ?? ''} ${s.outcomeText ?? ''}`, `${numRows} step ${s.id}`).not.toMatch(/undefined|NaN/);
    }
  });
});

describe("Pascal's Triangle: the input", () => {
  it('1, 2, 5 and 10 are accepted', () => {
    for (const n of ['1', '2', '5', '10']) expect(validateNumberDraft(def, [n])).toEqual({ ok: true, values: [Number(n)] });
  });

  it.each([
    ['0', '"numRows" (0) is out of range — use values from 1 to 10.'],
    ['-3', '"numRows" (-3) is out of range — use values from 1 to 10.'],
    ['11', '"numRows" (11) is out of range — use values from 1 to 10.'],
    ['2.5', '"numRows" ("2.5") is a decimal — only whole numbers are supported.'],
    ['', 'Enter a value for "numRows".'],
    ['abc', '"numRows" ("abc") is not a whole number.'],
    ['5x', '"numRows" ("5x") is not a whole number.'],
  ])('%j is refused: %s', (text, message) => {
    expect(validateNumberDraft(def, [text])).toEqual({ ok: false, field: 0, message });
  });

  it('the engine refuses what the form refuses, instead of drawing a wrong triangle', () => {
    for (const bad of [[0], [-1], [11], [2.5], [], [3, 4]]) {
      expect(validateAlgorithmInput(def, bad, null).ok, JSON.stringify(bad)).toBe(false);
      expect(() => def.generateSteps(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
});

describe("Pascal's Triangle: the four listings", () => {
  const code = (lang: ProgrammingLanguage) => def.code[lang];
  const line = (lang: ProgrammingLanguage, ref: string) => code(lang).split('\n')[def.lineMap[lang][ref] - 1].trim();

  it('the same statements in the same order, in every language', () => {
    const EXPECTED: Record<string, Record<ProgrammingLanguage, string>> = {
      init: { c: 'int** triangle = malloc(numRows * sizeof(int*));', cpp: 'vector<vector<int>> triangle;', java: 'List<List<Integer>> triangle = new ArrayList<>();', python: 'triangle = []' },
      'row-loop': { c: 'for (int i = 0; i < numRows; i++) {', cpp: 'for (int i = 0; i < numRows; i++) {', java: 'for (int i = 0; i < numRows; i++) {', python: 'for i in range(num_rows):' },
      'create-row': { c: 'int* row = malloc((i + 1) * sizeof(int));', cpp: 'vector<int> row(i + 1);', java: 'List<Integer> row = new ArrayList<>(Collections.nCopies(i + 1, 0));', python: 'row = [0] * (i + 1)' },
      'set-first': { c: 'row[0] = 1;', cpp: 'row[0] = 1;', java: 'row.set(0, 1);', python: 'row[0] = 1' },
      'set-last': { c: 'row[i] = 1;', cpp: 'row[i] = 1;', java: 'row.set(i, 1);', python: 'row[i] = 1' },
      'col-loop': { c: 'for (int j = 1; j < i; j++) {', cpp: 'for (int j = 1; j < i; j++) {', java: 'for (int j = 1; j < i; j++) {', python: 'for j in range(1, i):' },
      'assign-cell': {
        c: 'row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j];',
        cpp: 'row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j];',
        java: 'row.set(j, triangle.get(i - 1).get(j - 1) + triangle.get(i - 1).get(j));',
        python: 'row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j]',
      },
      'add-row': { c: 'triangle[i] = row;', cpp: 'triangle.push_back(row);', java: 'triangle.add(row);', python: 'triangle.append(row)' },
      'return-result': { c: '*returnSize = numRows;', cpp: 'return triangle;', java: 'return triangle;', python: 'return triangle' },
    };
    for (const [ref, byLang] of Object.entries(EXPECTED)) for (const lang of LANGUAGES) expect(line(lang, ref), `${lang} ${ref}`).toBe(byLang[lang]);
    for (const lang of LANGUAGES) {
      expect(def.lineMap[lang]['read-parents']).toBe(def.lineMap[lang]['assign-cell']);
      expect(def.lineMap[lang]['add-parents']).toBe(def.lineMap[lang]['assign-cell']);
      const order = ['init', 'row-loop', 'create-row', 'set-first', 'set-last', 'col-loop', 'assign-cell', 'add-row', 'return-result'].map(ref => def.lineMap[lang][ref]);
      expect(order, lang).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('C allocates the triangle and its row sizes, stores a row and its size, and returns, over two lines each', () => {
    const lines = code('c').split('\n');
    const span = (ref: string) => {
      const r = resolveCodeRange(def, 'c', ref)!;
      return lines.slice(r.start - 1, r.end).map(l => l.trim());
    };
    expect(span('init')).toEqual(['int** triangle = malloc(numRows * sizeof(int*));', '*returnColumnSizes = malloc(numRows * sizeof(int));']);
    expect(span('add-row')).toEqual(['triangle[i] = row;', '(*returnColumnSizes)[i] = i + 1;']);
    expect(span('return-result')).toEqual(['*returnSize = numRows;', 'return triangle;']);
  });

  it('dynamic programming with nested containers in every language: no formula, no library helper', () => {
    expect(code('cpp')).toContain('vector<vector<int>> generate(int numRows)');
    expect(code('java')).toContain('public static List<List<Integer>> generate(int numRows)');
    expect(code('python')).toContain('def generate(num_rows):');
    expect(code('c')).toContain('int** generate(int numRows, int* returnSize, int** returnColumnSizes)');
    for (const lang of LANGUAGES) expect(code(lang), lang).not.toMatch(/factorial|comb\(|choose|binom/i);
  });
});
