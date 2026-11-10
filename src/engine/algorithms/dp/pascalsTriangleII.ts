import type { AlgorithmDefinition, ExecutionStep, PascalRowView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Pascal's Triangle II (LeetCode 119): row rowIndex of Pascal's Triangle with one-dimensional dynamic programming. One
 * array holds a single row; each pass turns row i - 1 into row i in place.
 *
 *   row = []
 *   for i = 0 .. rowIndex:
 *     append 1                                (every row ends in 1)
 *     for j = i - 1 down to 1:
 *       row[j] = row[j] + row[j - 1]
 *   return row
 *
 * The inner loop runs backwards, from right to left: row[j] needs row[j - 1] of the previous row, and going right to left
 * reaches row[j] before row[j - 1] is overwritten. (Going left to right would add the new row[j - 1] instead, and give a
 * wrong row from row 2 on.) row[0] is never changed: it stays 1. Rows 0 and 1 have no middle cell, so their inner loop
 * never runs.
 *
 * Every pass i takes O(i) work: O(rowIndex²) time in all, and the array holds rowIndex + 1 values: O(rowIndex) space.
 */

export const MIN_ROW_INDEX = 0;
export const MAX_ROW_INDEX = 9;

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

function generatePascalsTriangleIISteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(pascalsTriangleIIDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const rowIndex = input[0];
  const row: number[] = [];
  const steps: ExecutionStep[] = [];
  let i: number | null = null;
  let j: number | null = null;
  /** the positions this pass has updated already */
  let fresh: number[] = [];

  type Extra = Partial<Pick<PascalRowView, 'focus' | 'operands' | 'sum' | 'rowComplete' | 'result'>>;
  /** a step with an immutable snapshot of the array: later steps never change an earlier one */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'dpRow'>, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [...row],
      ...s,
      dpRow: { rowIndex, row: Object.freeze([...row]), i, j, fresh: Object.freeze([...fresh]), ...extra },
    });
  };

  push({
    type: 'init',
    codeRef: 'init',
    variables: { rowIndex },
    message: 'row = [] — empty',
    explanation: `One array is enough: it holds row 0, then row 1, … up to row ${rowIndex}, each made from the one before it in place.`,
    actionLabel: 'Empty row',
  });

  for (let r = 0; ; r++) {
    i = r;
    fresh = [];
    const go = r <= rowIndex;
    push({
      type: 'loop-condition',
      codeRef: 'row-loop',
      variables: { i: r, rowIndex },
      result: go ? 'true' : 'false',
      message: `i=${r} <= rowIndex=${rowIndex} → ${go ? 'true' : 'false'}${go ? '' : ` — row ${rowIndex} is built`}`,
      explanation: go
        ? r === 0
          ? 'Build row 0.'
          : `Turn row ${r - 1} ${list(row)} into row ${r}.`
        : `The array holds row ${rowIndex} of Pascal's Triangle.`,
      actionLabel: go ? `Row ${r}` : 'Rows done',
    });
    if (!go) break;

    row.push(1);
    push(
      {
        type: 'update',
        codeRef: 'append-one',
        variables: { i: r, [`row[${r}]`]: 1, size: row.length },
        message: `append 1 → row[${r}] = 1`,
        explanation: `Every row ends in 1: the new last cell, position ${r}. Row ${r} has ${r + 1} cell${r === 0 ? '' : 's'}.`,
        actionLabel: 'Append 1',
      },
      { focus: { index: r, kind: 'appended' } }
    );

    for (let c = r - 1; ; c--) {
      j = c;
      const inner = c >= 1;
      push(
        {
          type: 'loop-condition',
          codeRef: 'col-loop',
          variables: { i: r, j: c },
          result: inner ? 'true' : 'false',
          message: `j=${c} >= 1 → ${inner ? 'true' : 'false'}${inner ? '' : ` — row ${r} is complete`}`,
          explanation: inner
            ? `Update row[${c}], going right to left: row[${c - 1}] still holds row ${r - 1}'s value.`
            : r < 2
              ? `Row ${r} has no middle cell: it is complete.`
              : `Every middle cell is updated: the array is row ${r}, ${list(row)}.`,
          actionLabel: inner ? `j = ${c}` : 'Row complete',
        },
        inner ? { focus: { index: c, kind: 'selected' } } : { rowComplete: true }
      );
      if (!inner) break;

      const operands = { current: row[c], left: row[c - 1] };
      push(
        {
          type: 'assign',
          codeRef: 'read-values',
          variables: { i: r, j: c, [`row[${c}]`]: operands.current, [`row[${c - 1}]`]: operands.left },
          message: `row[${c}] = ${operands.current}, row[${c - 1}] = ${operands.left}`,
          explanation: `Both still hold row ${r - 1}'s values: row[${c}] is replaced, row[${c - 1}] is added to it.`,
          actionLabel: 'Read',
        },
        { focus: { index: c, kind: 'read' }, operands }
      );

      const sum = operands.current + operands.left;
      push(
        {
          type: 'assign',
          codeRef: 'add-values',
          variables: { i: r, j: c, sum },
          message: `${operands.current} + ${operands.left} = ${sum}`,
          explanation: `Add them: ${operands.current} + ${operands.left} = ${sum}.`,
          actionLabel: 'Add',
        },
        { focus: { index: c, kind: 'sum' }, operands, sum }
      );

      row[c] = sum;
      fresh = [...fresh, c];
      push(
        {
          type: 'assign',
          codeRef: 'update-cell',
          variables: { i: r, j: c, [`row[${c}]`]: sum },
          message: `row[${c}] = ${operands.current} + ${operands.left} = ${sum}`,
          explanation: `row[${c}] now holds row ${r}'s value. row[${c - 1}] is untouched, so the next cell to the left can still use it.`,
          actionLabel: `row[${c}] = ${sum}`,
        },
        { focus: { index: c, kind: 'updated' }, operands, sum }
      );

      j = c - 1;
      push({
        type: 'decrement',
        codeRef: 'col-loop',
        variables: { i: r, j: c - 1 },
        message: `j-- → j=${c - 1}`,
        explanation: 'Move one cell to the left.',
        actionLabel: 'j--',
      });
    }
    j = null;

    i = r + 1;
    push({
      type: 'increment',
      codeRef: 'row-loop',
      variables: { i: r + 1, rowIndex },
      message: `i++ → i=${r + 1}`,
      explanation: 'Move to the next row.',
      actionLabel: 'i++',
    });
  }

  i = null;
  j = null;
  fresh = [];
  const result = [...row];
  const text = `Row ${rowIndex} of Pascal's Triangle: ${list(result)}`;
  push(
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { rowIndex, size: result.length },
      message: `return row — ${list(result)}`,
      explanation: `${rowIndex + 1} passes, the longest with ${Math.max(0, rowIndex - 1)} update${rowIndex - 1 === 1 ? '' : 's'}: O(rowIndex²) time, and one array of ${rowIndex + 1} values: O(rowIndex) space.`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    { result: Object.freeze(result) }
  );
  return steps;
}

export const pascalsTriangleIIDefinition: AlgorithmDefinition = {
  id: 'dp-pascals-triangle-ii',
  name: "Pascal's Triangle II",
  category: 'DP',
  visual: 'dp-row',
  subtitle: 'One row, updated in place from right to left: each pass turns the row into the next one.',
  description:
    "Returns row rowIndex (counting from 0) of Pascal's Triangle (LeetCode 119), using one array instead of the whole triangle. Each pass appends a 1, which every row ends with, then updates the middle cells from right to left: row[j] = row[j] + row[j - 1]. The inner loop must run backwards: row[j] needs the previous row's row[j - 1], and right to left reaches it before it is overwritten. row[0] stays 1. rowIndex + 1 passes of O(i) work give O(rowIndex²) time, with one array of rowIndex + 1 values: O(rowIndex) space.",
  complexity: {
    best: 'O(rowIndex²)',
    average: 'O(rowIndex²)',
    worst: 'O(rowIndex²)',
    space: 'O(rowIndex)',
    bestFor: 'One-dimensional DP: a row updated in place, in the order that keeps the values it still needs',
  },
  defaultInput: [3],
  inputSpec: {
    numbers: [{ label: 'rowIndex', hint: `The row to return, counting from 0: ${MIN_ROW_INDEX} to ${MAX_ROW_INDEX}`, min: MIN_ROW_INDEX, max: MAX_ROW_INDEX, random: [2, 7] }],
  },

  code: {
    c: `#include <stdlib.h>

int* getRow(int rowIndex, int* returnSize) {
    int* row = malloc((rowIndex + 1) * sizeof(int));
    int size = 0;
    for (int i = 0; i <= rowIndex; i++) {
        row[size++] = 1;
        for (int j = i - 1; j >= 1; j--) {
            row[j] = row[j] + row[j - 1];
        }
    }
    *returnSize = size;
    return row;
}`,
    cpp: `#include <vector>
using namespace std;

vector<int> getRow(int rowIndex) {
    vector<int> row;
    for (int i = 0; i <= rowIndex; i++) {
        row.push_back(1);
        for (int j = i - 1; j >= 1; j--) {
            row[j] = row[j] + row[j - 1];
        }
    }
    return row;
}`,
    java: `import java.util.ArrayList;
import java.util.List;

public class PascalsTriangleII {
    public static List<Integer> getRow(int rowIndex) {
        List<Integer> row = new ArrayList<>();
        for (int i = 0; i <= rowIndex; i++) {
            row.add(1);
            for (int j = i - 1; j >= 1; j--) {
                row.set(j, row.get(j) + row.get(j - 1));
            }
        }
        return row;
    }
}`,
    python: `def get_row(row_index):
    row = []
    for i in range(row_index + 1):
        row.append(1)
        for j in range(i - 1, 0, -1):
            row[j] = row[j] + row[j - 1]
    return row`,
  },

  // reading row[j] and row[j - 1], adding them and storing the sum are one statement in every listing: the three steps
  // share it
  lineMap: {
    c: { init: 4, 'row-loop': 6, 'append-one': 7, 'col-loop': 8, 'read-values': 9, 'add-values': 9, 'update-cell': 9, 'return-result': 12 },
    cpp: { init: 5, 'row-loop': 6, 'append-one': 7, 'col-loop': 8, 'read-values': 9, 'add-values': 9, 'update-cell': 9, 'return-result': 12 },
    java: { init: 6, 'row-loop': 7, 'append-one': 8, 'col-loop': 9, 'read-values': 10, 'add-values': 10, 'update-cell': 10, 'return-result': 13 },
    python: { init: 2, 'row-loop': 3, 'append-one': 4, 'col-loop': 5, 'read-values': 6, 'add-values': 6, 'update-cell': 6, 'return-result': 7 },
  },

  // C allocates the array and starts its size at 0, and sets the size it returns before returning, in two statements
  lineSpans: {
    c: { init: 2, 'return-result': 2 },
  },

  generateSteps: generatePascalsTriangleIISteps,
};
