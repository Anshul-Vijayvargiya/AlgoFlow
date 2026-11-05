import type { AlgorithmDefinition, BoardCellStatus, BoardView, ExecutionStep } from '../../../types/algorithm';

/**
 * The N-Queens problem: place n queens on an n × n board so that no two attack each other (no two share a row, a
 * column or a diagonal), and list every way to do it, with recursive backtracking:
 *
 *   solve(row) tries each column of the row in turn;
 *   isSafe checks the queens of the rows above: the same column, the upper-left diagonal, the upper-right diagonal;
 *   a safe cell gets a queen, and solve(row + 1) fills the rest;
 *   when every row has a queen (row == n), a copy of the placement is saved;
 *   on return the queen is removed (backtracking), and the next column is tried.
 *
 * One queen per row is placed by construction, so rows never conflict. The search tries at most n choices in the
 * first row, fewer in each next one: O(n!) is the usual upper bound (each try also checks up to n queens). The
 * placement and the calls take O(n) space, besides the solutions (n values each; 92 of them for n = 8).
 *
 * The trace is made by running that recursion; every step keeps a copy of the board as the code holds it.
 */

/** the board sizes the visualizer draws (n = 8 is the classic board: 92 solutions) */
export const MIN_N = 1;
export const MAX_N = 8;

type Line = NonNullable<BoardView['attacker']>['line'];
const LINE_TEXT: Record<Line, string> = { column: 'the same column', 'upper-left': 'the upper-left diagonal', 'upper-right': 'the upper-right diagonal' };

/** the first queen in the rows above that attacks (row, col), as isSafe finds it: rows in order, column test first */
export function firstAttacker(queens: readonly number[], row: number, col: number): BoardView['attacker'] | null {
  for (let i = 0; i < row; i++) {
    if (queens[i] === col) return { row: i, col: queens[i], line: 'column' };
    if (queens[i] - col === i - row) return { row: i, col: queens[i], line: 'upper-left' };
    if (queens[i] - col === row - i) return { row: i, col: queens[i], line: 'upper-right' };
  }
  return null;
}

function generateNQueensSteps(input: number[]): ExecutionStep[] {
  const n = input[0];
  if (input.length !== 1 || !Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    throw new RangeError(`N-Queens Problem takes one board size n, a whole number from ${MIN_N} to ${MAX_N}.`);
  }
  const steps: ExecutionStep[] = [];
  const queens: number[] = [];
  /** solutions are frozen copies: a step keeps the list as it was, and later steps never change them */
  let solutions: readonly (readonly number[])[] = Object.freeze([]);
  const calls: number[] = [];

  const at = (row: number, col: number) => `(${row}, ${col})`;
  const placement = (q: readonly number[] = queens) => `[${q.join(', ')}]`;

  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'board'>, focus: { cell?: BoardView['cell']; attacker?: BoardView['attacker'] } = {}) => {
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      board: {
        n,
        queens: Object.freeze([...queens]),
        ...(focus.cell ? { cell: focus.cell } : {}),
        ...(focus.attacker ? { attacker: focus.attacker } : {}),
        solutions,
        calls: Object.freeze([...calls]),
      },
    });
  };
  const cell = (row: number, col: number, status: BoardCellStatus) => ({ row, col, status });

  /** solve(queens, row, n, solutions), as the listings write it */
  function solve(row: number) {
    const full = row === n;
    push({
      type: 'condition',
      codeRef: 'check-row',
      variables: { row, n, queens: placement() },
      result: full ? 'true' : 'false',
      message: `solve(row = ${row}): row == n?  ${row} == ${n} → ${full}`,
      explanation: full
        ? `Every row has a queen and none attacks another: this placement is a solution.`
        : `Row ${row} still needs a queen: try its columns from left to right.`,
      actionLabel: full ? 'Board full' : `Row ${row}`,
    });
    if (full) {
      solutions = Object.freeze([...solutions, Object.freeze([...queens])]);
      push({
        // one solution saved, not the final answer (that is the last step): the save is an update of the list
        type: 'update',
        codeRef: 'save',
        variables: { solution: placement(), count: solutions.length },
        message: `save a copy of ${placement()}  →  ${solutions.length} solution${solutions.length === 1 ? '' : 's'}`,
        explanation: `A copy is saved (the placement keeps changing as the search goes on). Solution ${solutions.length}: queens[r] is the column of the queen in row r.`,
        actionLabel: `Solution ${solutions.length}`,
      });
      push({
        type: 'return',
        codeRef: 'solution-return',
        variables: { row },
        message: 'return — back to the previous row to look for more solutions',
        explanation: n === 1 ? 'The only placement has been saved.' : 'This call is done; the caller removes its queen and tries its next column.',
        actionLabel: 'Return',
      });
      return;
    }

    for (let col = 0; ; col++) {
      const more = col < n;
      push(
        {
          type: 'loop-condition',
          codeRef: 'try-col',
          variables: { row, col },
          result: more ? 'true' : 'false',
          message: more ? `try column ${col} of row ${row}  (col = ${col} < ${n})` : `col = ${n}: every column of row ${row} has been tried`,
          explanation: more
            ? `Can a queen go at ${at(row, col)}?`
            : row === 0
              ? 'Every column of the first row has been tried: the search is complete.'
              : `No column of row ${row} leads to a further solution: solve(row = ${row}) returns, and row ${row - 1} backtracks.`,
          actionLabel: more ? `Try ${at(row, col)}` : 'Columns done',
        },
        more ? { cell: cell(row, col, 'checking') } : {}
      );
      if (!more) return;

      push(
        {
          type: 'compare',
          codeRef: 'check-safe',
          variables: { row, col, queens: placement() },
          message: `isSafe(queens, ${row}, ${col})?  check the ${row === 0 ? 'queens above (none yet)' : `queens of rows 0 to ${row - 1}`}`,
          explanation:
            row === 0
              ? 'The first row has no queens above it, so any column is safe.'
              : `Each queen above is checked for ${LINE_TEXT.column}, ${LINE_TEXT['upper-left']} and ${LINE_TEXT['upper-right']} (rows never clash: there is one queen per row).`,
          actionLabel: 'isSafe?',
        },
        { cell: cell(row, col, 'checking') }
      );

      const attacker = firstAttacker(queens, row, col);
      if (attacker) {
        push(
          {
            type: 'condition',
            codeRef: attacker.line === 'column' ? 'conflict-column' : attacker.line === 'upper-left' ? 'conflict-left' : 'conflict-right',
            variables: { i: attacker.row, 'queens[i]': attacker.col, row, col },
            result: 'false',
            message: `conflict: the queen at ${at(attacker.row, attacker.col)} attacks ${at(row, col)} along ${LINE_TEXT[attacker.line]} → not safe`,
            explanation:
              attacker.line === 'column'
                ? `queens[${attacker.row}] == col (${attacker.col} == ${col}): both would be in column ${col}.`
                : attacker.line === 'upper-left'
                  ? `queens[${attacker.row}] - col == ${attacker.row} - row (${attacker.col - col} == ${attacker.row - row}): ${at(attacker.row, attacker.col)} is up and to the left on the same diagonal.`
                  : `queens[${attacker.row}] - col == row - ${attacker.row} (${attacker.col - col} == ${row - attacker.row}): ${at(attacker.row, attacker.col)} is up and to the right on the same diagonal.`,
            actionLabel: 'Conflict',
          },
          { cell: cell(row, col, 'conflict'), attacker }
        );
        continue;
      }
      push(
        {
          type: 'condition',
          codeRef: 'safe',
          variables: { row, col },
          result: 'true',
          message: `${at(row, col)} is safe: no queen above attacks it`,
          explanation: row === 0 ? 'There is no queen yet.' : `No queen in rows 0 to ${row - 1} shares its column or a diagonal.`,
          actionLabel: 'Safe',
        },
        { cell: cell(row, col, 'safe') }
      );

      queens.push(col);
      push(
        {
          type: 'update',
          codeRef: 'place',
          variables: { [`queens[${row}]`]: col, queens: placement() },
          message: `place a queen at ${at(row, col)}  →  queens = ${placement()}`,
          explanation: `Row ${row} gets its queen in column ${col}; the next row must fit around it.`,
          actionLabel: `Place ${at(row, col)}`,
        },
        { cell: cell(row, col, 'placed') }
      );

      calls.push(row + 1);
      push(
        {
          type: 'update',
          codeRef: 'recurse',
          variables: { call: `solve(row = ${row + 1})`, queens: placement() },
          message: `call solve(queens, ${row + 1}, n, solutions)`,
          explanation: row + 1 === n ? 'That was the last row: the next call finds the board full.' : `Fill row ${row + 1} with the queens placed so far.`,
          actionLabel: 'Next row',
        },
        { cell: cell(row, col, 'placed') }
      );
      solve(row + 1);
      calls.pop();

      queens.pop();
      push(
        {
          type: 'update',
          codeRef: 'remove',
          variables: { removed: at(row, col), queens: placement() },
          message: `back in row ${row}: remove the queen at ${at(row, col)}  →  queens = ${placement()}`,
          explanation: `Backtrack: every placement with a queen at ${at(row, col)} has been explored. Remove it and try the next column of row ${row}.`,
          actionLabel: `Backtrack ${at(row, col)}`,
        },
        { cell: cell(row, col, 'removed') }
      );
    }
  }

  push({
    type: 'init',
    codeRef: 'init',
    variables: { n, solutions: '[]', queens: '[]' },
    message: `n = ${n}: place ${n} queen${n === 1 ? '' : 's'} on a ${n} × ${n} board`,
    explanation: 'queens[r] will hold the column of the queen in row r; solutions collects a copy of each full placement.',
    actionLabel: 'Start',
  });
  calls.push(0);
  push({
    type: 'update',
    codeRef: 'call-root',
    variables: { call: 'solve(row = 0)' },
    message: 'call solve(queens, 0, n, solutions)',
    explanation: 'Start with the first row: one queen per row, top to bottom.',
    actionLabel: 'Start search',
  });
  solve(0);
  calls.pop();

  const count = solutions.length;
  const text = count
    ? `${count} solution${count === 1 ? '' : 's'} for n = ${n}: ${solutions.map(s => placement(s)).join(', ')}`
    : `No solution for n = ${n}: ${n} queens cannot be placed without attacking each other`;
  push({
    type: 'complete',
    codeRef: 'return',
    variables: { count, solutions: count ? solutions.map(s => placement(s)).join(' ') : '[]' },
    message: `return solutions — ${count} solution${count === 1 ? '' : 's'}`,
    explanation:
      'The search tried every safe placement, row by row: O(n!) as the usual upper bound, with O(n) space for the placement and the calls besides the solutions. The number of solutions grows quickly with n (n = 8 has 92).',
    actionLabel: 'Return',
    outcomeText: text,
  });
  return steps;
}

export const nQueensDefinition: AlgorithmDefinition = {
  id: 'backtracking-n-queens',
  name: 'N-Queens Problem',
  category: 'BACKTRACKING',
  visual: 'board',
  subtitle: 'Place N queens so none attack each other — row by row, backtracking.',
  description:
    'Places n queens on an n × n board so that no two attack each other, and lists every solution. Recursive backtracking fills the board row by row: for each column of the row it checks the queens above for the same column, the upper-left diagonal and the upper-right diagonal; a safe cell gets a queen and the next row is filled; when all n rows have a queen the placement is saved; then the queen is removed (backtracking) and the next column is tried. O(n!) is the usual upper bound on the time; the placement and the calls take O(n) space, besides the solutions, whose number grows quickly (n = 8 has 92; n = 2 and n = 3 have none).',
  complexity: {
    best: 'O(n!)',
    average: 'O(n!)',
    worst: 'O(n!)',
    space: 'O(n)',
    bestFor: 'Learning backtracking: try, check, recurse, undo. O(n) besides the solutions (n values each; n = 8 has 92)',
  },
  defaultInput: [4],
  inputSpec: {
    numbers: [{ label: 'n', hint: `The board size: ${MIN_N} to ${MAX_N} (n queens on an n × n board; every try is a step, so n = 8 takes about 57,500 steps)`, min: MIN_N, max: MAX_N, random: [4, 6] }],
  },

  code: {
    c: `#include <string.h>

#define MAX_N 8

// queens[r] is the column of the queen in row r, for rows 0 .. row - 1
int isSafe(int queens[], int row, int col) {
    for (int i = 0; i < row; i++) {
        if (queens[i] == col) return 0;            // same column
        if (queens[i] - col == i - row) return 0;  // upper-left diagonal
        if (queens[i] - col == row - i) return 0;  // upper-right diagonal
    }
    return 1;
}

void solve(int queens[], int row, int n, int solutions[][MAX_N], int *count) {
    if (row == n) {
        memcpy(solutions[*count], queens, n * sizeof(int));
        (*count)++;
        return;
    }
    for (int col = 0; col < n; col++) {
        if (isSafe(queens, row, col)) {
            queens[row] = col;
            solve(queens, row + 1, n, solutions, count);
            queens[row] = -1;
        }
    }
}

// fills solutions (92 at most, for n = 8) and returns how many there are
int solveNQueens(int n, int solutions[][MAX_N]) {
    int queens[MAX_N];
    int count = 0;
    solve(queens, 0, n, solutions, &count);
    return count;
}`,
    cpp: `#include <vector>
using namespace std;

// queens[r] is the column of the queen in row r, for rows 0 .. row - 1
bool isSafe(const vector<int>& queens, int row, int col) {
    for (int i = 0; i < row; i++) {
        if (queens[i] == col) return false;            // same column
        if (queens[i] - col == i - row) return false;  // upper-left diagonal
        if (queens[i] - col == row - i) return false;  // upper-right diagonal
    }
    return true;
}

void solve(vector<int>& queens, int row, int n, vector<vector<int>>& solutions) {
    if (row == n) {
        solutions.push_back(queens);
        return;
    }
    for (int col = 0; col < n; col++) {
        if (isSafe(queens, row, col)) {
            queens.push_back(col);
            solve(queens, row + 1, n, solutions);
            queens.pop_back();
        }
    }
}

vector<vector<int>> solveNQueens(int n) {
    vector<vector<int>> solutions;
    vector<int> queens;
    solve(queens, 0, n, solutions);
    return solutions;
}`,
    java: `import java.util.ArrayList;
import java.util.List;

public class NQueens {
    // queens[r] is the column of the queen in row r, for rows 0 .. row - 1
    static boolean isSafe(int[] queens, int row, int col) {
        for (int i = 0; i < row; i++) {
            if (queens[i] == col) return false;            // same column
            if (queens[i] - col == i - row) return false;  // upper-left diagonal
            if (queens[i] - col == row - i) return false;  // upper-right diagonal
        }
        return true;
    }

    static void solve(int[] queens, int row, int n, List<int[]> solutions) {
        if (row == n) {
            solutions.add(queens.clone());
            return;
        }
        for (int col = 0; col < n; col++) {
            if (isSafe(queens, row, col)) {
                queens[row] = col;
                solve(queens, row + 1, n, solutions);
                queens[row] = -1;
            }
        }
    }

    public static List<int[]> solveNQueens(int n) {
        List<int[]> solutions = new ArrayList<>();
        int[] queens = new int[n];
        solve(queens, 0, n, solutions);
        return solutions;
    }
}`,
    python: `# queens[r] is the column of the queen in row r, for rows 0 .. row - 1
def is_safe(queens, row, col):
    for i in range(row):
        if queens[i] == col:  # same column
            return False
        if queens[i] - col == i - row:  # upper-left diagonal
            return False
        if queens[i] - col == row - i:  # upper-right diagonal
            return False
    return True

def solve(queens, row, n, solutions):
    if row == n:
        solutions.append(queens.copy())
        return
    for col in range(n):
        if is_safe(queens, row, col):
            queens.append(col)
            solve(queens, row + 1, n, solutions)
            queens.pop()

def solve_n_queens(n):
    solutions = []
    solve([], 0, n, solutions)
    return solutions`,
  },

  // A conflict is the test that finds it (C, C++ and Java return on the same line; Python's return is the next line).
  lineMap: {
    c: {
      init: 32, 'call-root': 34, 'check-row': 16, save: 17, 'solution-return': 19, 'try-col': 21, 'check-safe': 22,
      'conflict-column': 8, 'conflict-left': 9, 'conflict-right': 10, safe: 12, place: 23, recurse: 24, remove: 25, return: 35,
    },
    cpp: {
      init: 29, 'call-root': 31, 'check-row': 15, save: 16, 'solution-return': 17, 'try-col': 19, 'check-safe': 20,
      'conflict-column': 7, 'conflict-left': 8, 'conflict-right': 9, safe: 11, place: 21, recurse: 22, remove: 23, return: 32,
    },
    java: {
      init: 30, 'call-root': 32, 'check-row': 16, save: 17, 'solution-return': 18, 'try-col': 20, 'check-safe': 21,
      'conflict-column': 8, 'conflict-left': 9, 'conflict-right': 10, safe: 12, place: 22, recurse: 23, remove: 24, return: 33,
    },
    python: {
      init: 23, 'call-root': 24, 'check-row': 13, save: 14, 'solution-return': 15, 'try-col': 16, 'check-safe': 17,
      'conflict-column': 4, 'conflict-left': 6, 'conflict-right': 8, safe: 10, place: 18, recurse: 19, remove: 20, return: 25,
    },
  },
  // the setup is two declarations (Python: one); C saves a copy and counts it; Python's conflict returns on the next line
  lineSpans: {
    c: { init: 2, save: 2 },
    cpp: { init: 2 },
    java: { init: 2 },
    python: { 'conflict-column': 2, 'conflict-left': 2, 'conflict-right': 2 },
  },

  generateSteps: generateNQueensSteps,
};
