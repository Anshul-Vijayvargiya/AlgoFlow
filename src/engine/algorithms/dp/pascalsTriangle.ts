import type { AlgorithmDefinition, ExecutionStep, PascalTriangleView, TriangleCell } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Pascal's Triangle (LeetCode 118), built row by row with dynamic programming: every row is computed from the row above
 * it, which is already in the triangle.
 *
 *   triangle = []
 *   for i = 0 .. numRows - 1:
 *     row = a new row of i + 1 cells
 *     row[0] = 1; row[i] = 1                 (the boundary cells; for i = 0 they are the same cell)
 *     for j = 1 .. i - 1:
 *       row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j]
 *     append row to triangle
 *   return triangle
 *
 * The first row never reads a previous row: its column loop starts at j = 1, which is not below i = 0. The same holds for
 * the second row (i = 1). Every listing writes these statements in this order; selecting the two parents, adding them and
 * storing the sum are three steps on the line that does all three.
 *
 * Every row i takes O(i) work and O(i) space, so the whole triangle takes O(numRows²) time and O(numRows²) space.
 */

export const MIN_ROWS = 1;
export const MAX_ROWS = 10;

const list = (xs: readonly (number | null)[]) => `[${xs.map(v => (v === null ? '·' : v)).join(', ')}]`;
const rowsWord = (k: number) => `${k} row${k === 1 ? '' : 's'}`;

function generatePascalsTriangleSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(pascalsTriangleDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const numRows = input[0];
  const triangle: number[][] = [];
  const steps: ExecutionStep[] = [];
  let row: (number | null)[] | null = null;
  let i: number | null = null;
  let j: number | null = null;

  type Extra = Partial<Pick<PascalTriangleView, 'focus' | 'parents' | 'sum' | 'rowComplete' | 'appended' | 'result'>>;
  /** a step with an immutable snapshot of the triangle: later steps never change an earlier one */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'triangle'>, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      triangle: {
        numRows,
        triangle: Object.freeze(triangle.map(r => Object.freeze([...r]))),
        row: row ? Object.freeze([...row]) : null,
        i,
        j,
        ...extra,
      },
    });
  };

  push({
    type: 'init',
    codeRef: 'init',
    variables: { numRows },
    message: 'triangle = [] — no rows yet',
    explanation: `The triangle starts empty. It is built one row at a time, top to bottom: ${rowsWord(numRows)}.`,
    actionLabel: 'Empty triangle',
  });

  for (let r = 0; ; r++) {
    i = r;
    const go = r < numRows;
    push({
      type: 'loop-condition',
      codeRef: 'row-loop',
      variables: { i: r, numRows },
      result: go ? 'true' : 'false',
      message: `i=${r} < numRows=${numRows} → ${go ? 'true' : 'false'}${go ? '' : ' — all rows built'}`,
      explanation: go ? `Build row ${r}: it has ${r + 1} cell${r === 0 ? '' : 's'}.` : `All ${rowsWord(numRows)} are in the triangle.`,
      actionLabel: go ? `Row ${r}` : 'Rows done',
    });
    if (!go) break;

    row = Array.from({ length: r + 1 }, () => null);
    push({
      type: 'assign',
      codeRef: 'create-row',
      variables: { i: r, size: r + 1 },
      message: `row = a new row of ${r + 1} cell${r === 0 ? '' : 's'}`,
      explanation: r === 0 ? 'The first row has a single cell.' : `Row ${r} has one cell more than the row above it.`,
      actionLabel: 'New row',
    });

    row[0] = 1;
    push(
      {
        type: 'assign',
        codeRef: 'set-first',
        variables: { i: r, 'row[0]': 1 },
        message: 'row[0] = 1 — boundary element = 1',
        explanation: 'Every row starts with 1: nothing is above and to the left of it.',
        actionLabel: 'First = 1',
      },
      { focus: { col: 0, kind: 'boundary' } }
    );

    row[r] = 1;
    push(
      {
        type: 'assign',
        codeRef: 'set-last',
        variables: { i: r, [`row[${r}]`]: 1 },
        message: `row[${r}] = 1 — boundary element = 1`,
        explanation: r === 0 ? 'In row 0 the last cell is also the first: it is set to 1 again.' : 'Every row ends with 1: nothing is above and to the right of it.',
        actionLabel: 'Last = 1',
      },
      { focus: { col: r, kind: 'boundary' } }
    );

    for (let c = 1; ; c++) {
      j = c;
      const inner = c < r;
      push(
        {
          type: 'loop-condition',
          codeRef: 'col-loop',
          variables: { i: r, j: c },
          result: inner ? 'true' : 'false',
          message: `j=${c} < i=${r} → ${inner ? 'true' : 'false'}${inner ? '' : ` — row ${r} is complete`}`,
          explanation: inner
            ? `Cell ${c} lies between the two boundary cells: it is the sum of the two cells above it.`
            : r < 2
              ? `Row ${r} has no middle cells: it is complete, and no earlier row was read.`
              : `Every middle cell of row ${r} is set: the row is complete.`,
          actionLabel: inner ? `Cell ${c}` : 'Row complete',
        },
        inner ? {} : { rowComplete: true }
      );
      if (!inner) break;

      const above = triangle[r - 1];
      const parents: [TriangleCell, TriangleCell] = [
        { row: r - 1, col: c - 1, value: above[c - 1] },
        { row: r - 1, col: c, value: above[c] },
      ];
      const [left, right] = parents;
      push(
        {
          type: 'assign',
          codeRef: 'read-parents',
          variables: { i: r, j: c, [`triangle[${r - 1}][${c - 1}]`]: left.value, [`triangle[${r - 1}][${c}]`]: right.value },
          message: `parents: triangle[${r - 1}][${c - 1}] = ${left.value}, triangle[${r - 1}][${c}] = ${right.value}`,
          explanation: `The two cells directly above row ${r}, cell ${c}: columns ${c - 1} and ${c} of row ${r - 1}.`,
          actionLabel: 'Parents',
        },
        { focus: { col: c, kind: 'parents' }, parents }
      );

      const sum = left.value + right.value;
      push(
        {
          type: 'assign',
          codeRef: 'add-parents',
          variables: { i: r, j: c, sum },
          message: `${left.value} + ${right.value} = ${sum}`,
          explanation: `Add the two parents: ${left.value} + ${right.value} = ${sum}.`,
          actionLabel: 'Add',
        },
        { focus: { col: c, kind: 'sum' }, parents, sum }
      );

      row[c] = sum;
      push(
        {
          type: 'assign',
          codeRef: 'assign-cell',
          variables: { i: r, j: c, [`row[${c}]`]: sum },
          message: `row[${c}] = ${sum}`,
          explanation: `Store the sum in row ${r}, cell ${c}.`,
          actionLabel: `row[${c}] = ${sum}`,
        },
        { focus: { col: c, kind: 'assigned' }, parents, sum }
      );

      j = c + 1;
      push({
        type: 'increment',
        codeRef: 'col-loop',
        variables: { i: r, j: c + 1 },
        message: `j++ → j=${c + 1}`,
        explanation: 'Move to the next cell of the row.',
        actionLabel: 'j++',
      });
    }

    const done = row as number[];
    triangle.push(done);
    row = null;
    j = null;
    push(
      {
        type: 'update',
        codeRef: 'add-row',
        variables: { i: r, rows: triangle.length },
        message: `append row ${r} ${list(done)} — the triangle has ${rowsWord(triangle.length)}`,
        explanation: r + 1 < numRows ? `Row ${r} is now in the triangle, where row ${r + 1} reads its parents from.` : 'The last row is in the triangle.',
        actionLabel: 'Append row',
      },
      { appended: r }
    );

    i = r + 1;
    push({
      type: 'increment',
      codeRef: 'row-loop',
      variables: { i: r + 1, numRows },
      message: `i++ → i=${r + 1}`,
      explanation: 'Move to the next row.',
      actionLabel: 'i++',
    });
  }

  i = null;
  j = null;
  const result = triangle.map(r => [...r]);
  const text = `Pascal's Triangle with ${rowsWord(numRows)}: ${JSON.stringify(result).replace(/,/g, ', ')}`;
  push(
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { rows: numRows, cells: (numRows * (numRows + 1)) / 2 },
      message: `return triangle — ${rowsWord(numRows)}, ${(numRows * (numRows + 1)) / 2} cells`,
      explanation: `Each of the ${(numRows * (numRows + 1)) / 2} cells was set once, from at most two cells of the row above: O(numRows²) time, and O(numRows²) space for the triangle.`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    { result: Object.freeze(result.map(r => Object.freeze(r))) }
  );
  return steps;
}

export const pascalsTriangleDefinition: AlgorithmDefinition = {
  id: 'dp-pascals-triangle',
  name: "Pascal's Triangle",
  category: 'DP',
  visual: 'triangle',
  subtitle: 'Build each row from the row above it: every middle cell is the sum of the two cells over it.',
  description:
    "Generates the first numRows rows of Pascal's Triangle (LeetCode 118). Every row starts and ends with 1; every cell in between is the sum of the two cells directly above it. Dynamic programming builds the rows top to bottom, so the row above is always complete when a row reads from it: row i is created with i + 1 cells, its two boundary cells are set to 1, each middle cell j is triangle[i - 1][j - 1] + triangle[i - 1][j], and the row is appended. The first row has no previous row to read, and neither of the first two rows has a middle cell. Each of the numRows(numRows + 1) / 2 cells is set once: O(numRows²) time and O(numRows²) space for the triangle.",
  complexity: {
    best: 'O(numRows²)',
    average: 'O(numRows²)',
    worst: 'O(numRows²)',
    space: 'O(numRows²)',
    bestFor: 'Learning dynamic programming: each value is built from values already computed, row by row',
  },
  defaultInput: [5],
  inputSpec: {
    numbers: [{ label: 'numRows', hint: `The number of rows: ${MIN_ROWS} to ${MAX_ROWS}`, min: MIN_ROWS, max: MAX_ROWS, random: [3, 8] }],
  },

  code: {
    c: `#include <stdlib.h>

int** generate(int numRows, int* returnSize, int** returnColumnSizes) {
    int** triangle = malloc(numRows * sizeof(int*));
    *returnColumnSizes = malloc(numRows * sizeof(int));
    for (int i = 0; i < numRows; i++) {
        int* row = malloc((i + 1) * sizeof(int));
        row[0] = 1;
        row[i] = 1;
        for (int j = 1; j < i; j++) {
            row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j];
        }
        triangle[i] = row;
        (*returnColumnSizes)[i] = i + 1;
    }
    *returnSize = numRows;
    return triangle;
}`,
    cpp: `#include <vector>
using namespace std;

vector<vector<int>> generate(int numRows) {
    vector<vector<int>> triangle;
    for (int i = 0; i < numRows; i++) {
        vector<int> row(i + 1);
        row[0] = 1;
        row[i] = 1;
        for (int j = 1; j < i; j++) {
            row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j];
        }
        triangle.push_back(row);
    }
    return triangle;
}`,
    java: `import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class PascalsTriangle {
    public static List<List<Integer>> generate(int numRows) {
        List<List<Integer>> triangle = new ArrayList<>();
        for (int i = 0; i < numRows; i++) {
            List<Integer> row = new ArrayList<>(Collections.nCopies(i + 1, 0));
            row.set(0, 1);
            row.set(i, 1);
            for (int j = 1; j < i; j++) {
                row.set(j, triangle.get(i - 1).get(j - 1) + triangle.get(i - 1).get(j));
            }
            triangle.add(row);
        }
        return triangle;
    }
}`,
    python: `def generate(num_rows):
    triangle = []
    for i in range(num_rows):
        row = [0] * (i + 1)
        row[0] = 1
        row[i] = 1
        for j in range(1, i):
            row[j] = triangle[i - 1][j - 1] + triangle[i - 1][j]
        triangle.append(row)
    return triangle`,
  },

  // selecting the parents, adding them and storing the sum are one statement in every listing: the three steps share it
  lineMap: {
    c: { init: 4, 'row-loop': 6, 'create-row': 7, 'set-first': 8, 'set-last': 9, 'col-loop': 10, 'read-parents': 11, 'add-parents': 11, 'assign-cell': 11, 'add-row': 13, 'return-result': 16 },
    cpp: { init: 5, 'row-loop': 6, 'create-row': 7, 'set-first': 8, 'set-last': 9, 'col-loop': 10, 'read-parents': 11, 'add-parents': 11, 'assign-cell': 11, 'add-row': 13, 'return-result': 15 },
    java: { init: 7, 'row-loop': 8, 'create-row': 9, 'set-first': 10, 'set-last': 11, 'col-loop': 12, 'read-parents': 13, 'add-parents': 13, 'assign-cell': 13, 'add-row': 15, 'return-result': 17 },
    python: { init: 2, 'row-loop': 3, 'create-row': 4, 'set-first': 5, 'set-last': 6, 'col-loop': 7, 'read-parents': 8, 'add-parents': 8, 'assign-cell': 8, 'add-row': 9, 'return-result': 10 },
  },

  // C allocates the triangle and its row sizes, stores a row and its size, and sets the size it returns, in two statements
  lineSpans: {
    c: { init: 2, 'add-row': 2, 'return-result': 2 },
  },

  generateSteps: generatePascalsTriangleSteps,
};
