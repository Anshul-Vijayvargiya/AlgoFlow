import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { firstAttacker } from '../algorithms/backtracking/nQueens';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import type { ExecutionStep } from '../../types/algorithm';

const def = getAlgorithmDefinition('backtracking-n-queens')!;
const run = (n: number) => def.generateSteps([n]);
const solutionsOf = (steps: ExecutionStep[]) => steps.at(-1)!.board!.solutions.map(s => [...s]);

/** whether two queens (row, col) attack each other: same row, same column or same diagonal */
const attack = (r1: number, c1: number, r2: number, c2: number) => r1 === r2 || c1 === c2 || Math.abs(r1 - r2) === Math.abs(c1 - c2);
const valid = (s: readonly number[]) => s.every((c, r) => s.every((c2, r2) => r2 === r || !attack(r, c, r2, c2)));

/** an independent reference: every permutation of the columns, kept when no two queens share a diagonal (lexicographic) */
function bruteForce(n: number): number[][] {
  const out: number[][] = [];
  const perm = (prefix: number[]) => {
    if (prefix.length === n) {
      if (valid(prefix)) out.push(prefix);
      return;
    }
    for (let c = 0; c < n; c++) if (!prefix.includes(c)) perm([...prefix, c]);
  };
  perm([]);
  return out;
}

describe('N-Queens — solutions', () => {
  it.each([
    [1, 1],
    [2, 0],
    [3, 0],
    [4, 2],
    [5, 10],
    [6, 4],
    [7, 40],
    [8, 92],
  ])('n = %i has %i solutions', (n, count) => {
    expect(solutionsOf(run(n))).toHaveLength(count);
  });

  it('n = 4: exactly [1, 3, 0, 2] and [2, 0, 3, 1], in the order found', () => {
    const steps = run(4);
    expect(solutionsOf(steps)).toEqual([
      [1, 3, 0, 2],
      [2, 0, 3, 1],
    ]);
    expect(steps.at(-1)!.outcomeText).toBe('2 solutions for n = 4: [1, 3, 0, 2], [2, 0, 3, 1]');
  });

  it('n = 1: one queen on one square; n = 2 and 3: no solution, said so', () => {
    expect(solutionsOf(run(1))).toEqual([[0]]);
    expect(run(1).at(-1)!.outcomeText).toBe('1 solution for n = 1: [0]');
    expect(run(2).at(-1)!.outcomeText).toBe('No solution for n = 2: 2 queens cannot be placed without attacking each other');
    expect(run(3).at(-1)!.outcomeText).toBe('No solution for n = 3: 3 queens cannot be placed without attacking each other');
  });

  it('n = 1 to 8: every solution is valid (no two queens attack), none repeats, and they match a brute force exactly, in order', () => {
    for (let n = 1; n <= 8; n++) {
      const found = solutionsOf(run(n));
      for (const s of found) {
        expect(s, `n = ${n}`).toHaveLength(n);
        expect(valid(s), `n = ${n}: ${s}`).toBe(true);
      }
      expect(new Set(found.map(s => s.join(','))).size, `n = ${n}`).toBe(found.length);
      if (n <= 7) expect(found, `n = ${n}`).toEqual(bruteForce(n)); // row-by-row, column-by-column search = lexicographic order
    }
  });

  it('stored solutions are never changed later: each step keeps the list it had, and the saved arrays are frozen', () => {
    const steps = run(5);
    const seen = new Map<number, string>();
    for (const s of steps) {
      const list = s.board!.solutions;
      expect(Object.isFrozen(list)).toBe(true);
      for (const [k, sol] of list.entries()) {
        expect(Object.isFrozen(sol)).toBe(true);
        const text = sol.join(',');
        if (seen.has(k)) expect(text, `solution ${k} at step ${s.id}`).toBe(seen.get(k));
        else seen.set(k, text);
      }
    }
    expect(seen.size).toBe(10);
  });
});

describe('N-Queens — every step follows the backtracking code', () => {
  const traces = [1, 2, 3, 4, 5, 6].map(run);

  it('starts with the setup and solve(row = 0); ends with no call in progress, no queen on the board, and the result', () => {
    for (const steps of traces) {
      expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'init' });
      expect(steps[1]).toMatchObject({ codeRef: 'call-root' });
      expect(steps[1].board!.calls).toEqual([0]);
      expect(steps.at(-1)).toMatchObject({ type: 'complete', codeRef: 'return' });
      expect(steps.at(-1)!.board!.calls).toEqual([]);
      expect(steps.at(-1)!.board!.queens).toEqual([]);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, i) => i));
    }
  });

  it('each try is: the column test, isSafe, then the outcome on its own line — a conflict names the first queen isSafe finds', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (s.codeRef !== 'check-safe') continue;
        const { row, col } = s.board!.cell!;
        expect(steps[i - 1]).toMatchObject({ codeRef: 'try-col', result: 'true' });
        const next = steps[i + 1];
        const expected = firstAttacker(s.board!.queens, row, col);
        if (expected) {
          expect(next.codeRef).toBe({ column: 'conflict-column', 'upper-left': 'conflict-left', 'upper-right': 'conflict-right' }[expected.line]);
          expect(next.board!.attacker).toEqual(expected);
          expect(next.board!.cell).toEqual({ row, col, status: 'conflict' });
          // the attacker really attacks: same column, or the same diagonal going up
          expect(attack(row, col, expected.row, expected.col)).toBe(true);
          expect(expected.row).toBeLessThan(row);
        } else {
          expect(next).toMatchObject({ codeRef: 'safe', result: 'true' });
          expect(next.board!.cell).toEqual({ row, col, status: 'safe' });
          expect(steps[i + 2].codeRef).toBe('place');
        }
      }
    }
  });

  it('a queen is placed only on a safe square, and removed (backtracking) once its subtree is explored; nothing else changes the board', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (i === 0) continue;
        const before = steps[i - 1].board!.queens;
        const after = s.board!.queens;
        if (s.codeRef === 'place') {
          expect(steps[i - 1].codeRef).toBe('safe');
          expect(after).toEqual([...before, s.board!.cell!.col]);
          expect(s.board!.cell!.row).toBe(before.length);
        } else if (s.codeRef === 'remove') {
          expect(after).toEqual(before.slice(0, -1));
          expect(s.board!.cell).toEqual({ row: after.length, col: before.at(-1), status: 'removed' });
        } else {
          expect(after).toEqual(before);
        }
      }
    }
  });

  it('every placement is undone: places and removes pair up like brackets, at the same square', () => {
    for (const steps of traces) {
      const open: string[] = [];
      for (const s of steps) {
        const sq = s.board!.cell ? `${s.board!.cell.row},${s.board!.cell.col}` : '';
        if (s.codeRef === 'place') open.push(sq);
        if (s.codeRef === 'remove') expect(open.pop()).toBe(sq);
      }
      expect(open).toEqual([]);
    }
  });

  it('the call stack: a recursive call adds solve(row + 1); a call ends when its columns run out or the board is full', () => {
    for (const steps of traces) {
      for (let i = 1; i < steps.length; i++) {
        const before = steps[i - 1].board!.calls;
        const after = steps[i].board!.calls;
        const s = steps[i];
        if (s.codeRef === 'recurse') expect(after).toEqual([...before, before.at(-1)! + 1]);
        else if (s.codeRef === 'call-root') expect(after).toEqual([0]);
        else expect(after.length).toBeLessThanOrEqual(before.length);
        // the board always holds one queen per row above the running call
        if (after.length && s.codeRef !== 'place' && s.codeRef !== 'recurse') {
          const row = after.at(-1)!;
          if (s.codeRef !== 'remove') expect(s.board!.queens.length, `step ${s.id} ${s.codeRef}`).toBe(row);
        }
      }
    }
  });

  it('a solution is saved only when row == n, as a copy of the full board', () => {
    for (const steps of traces) {
      for (const [i, s] of steps.entries()) {
        if (i === 0) continue;
        const before = steps[i - 1].board!.solutions;
        const after = s.board!.solutions;
        if (s.codeRef === 'save') {
          expect(steps[i - 1]).toMatchObject({ codeRef: 'check-row', result: 'true' });
          expect(after.map(x => [...x])).toEqual([...before.map(x => [...x]), [...s.board!.queens]]);
          expect(steps[i + 1].codeRef).toBe('solution-return');
        } else {
          expect(after).toBe(before);
        }
      }
    }
  });

  it('n = 4 from the start: (0, 0) placed, then in row 1 column 0 is attacked along the column and column 1 along the upper-left diagonal', () => {
    const refs = run(4)
      .slice(0, 16)
      .map(s => s.codeRef);
    expect(refs).toEqual([
      'init',
      'call-root',
      'check-row', // row 0
      'try-col',
      'check-safe',
      'safe',
      'place', // (0, 0)
      'recurse',
      'check-row', // row 1
      'try-col',
      'check-safe',
      'conflict-column', // (1, 0): column of (0, 0)
      'try-col',
      'check-safe',
      'conflict-left', // (1, 1): (0, 0) is up and to the left, on the same diagonal
      'try-col',
    ]);
    // later, (0, 1)'s search finds (1, 0) attacked along the upper-right diagonal
    const s = run(4).find(x => x.codeRef === 'conflict-right')!;
    expect(s.board!.attacker!.col).toBeGreaterThan(s.board!.cell!.col);
  });

  it('every step explains itself', () => {
    for (const steps of traces) for (const s of steps) {
      expect(s.message.length, `step ${s.id}`).toBeGreaterThan(0);
      expect(s.explanation?.length ?? 0, `step ${s.id}`).toBeGreaterThan(0);
      expect(s.actionLabel?.length ?? 0, `step ${s.id}`).toBeGreaterThan(0);
    }
  });
});

describe('N-Queens — registration and input', () => {
  it('registered once under BACKTRACKING, drawn as a board, default n = 4, with the documented complexity', () => {
    expect(ALGORITHM_NAV.filter(a => a.id === 'backtracking-n-queens')).toEqual([
      expect.objectContaining({ name: 'N-Queens Problem', category: 'BACKTRACKING', implemented: true }),
    ]);
    // the planned placeholder entry it replaces is gone (no duplicate N-Queens)
    expect(ALGORITHM_NAV.filter(a => /queens/i.test(a.name))).toHaveLength(1);
    expect(def.category).toBe('BACKTRACKING');
    expect(visualKindOf(def)).toBe('board');
    expect(def.defaultInput).toEqual([4]);
    expect(def.inputSpec!.numbers).toEqual([expect.objectContaining({ label: 'n', min: 1, max: 8 })]);
    expect(def.complexity).toMatchObject({ best: 'O(n!)', worst: 'O(n!)', space: 'O(n)' });
    expect(def.description).toMatch(/grows quickly/);
  });

  it('n must be a whole number from 1 to 8: the field and the generator both refuse anything else', () => {
    for (const n of [1, 4, 8]) expect(validateAlgorithmInput(def, [n], null), String(n)).toEqual({ ok: true });
    for (const n of [0, -1, 9, 100]) {
      expect(validateAlgorithmInput(def, [n], null).ok, String(n)).toBe(false);
      expect(() => run(n), String(n)).toThrow(RangeError);
    }
    expect(validateNumberDraft(def, ['9'])).toMatchObject({ ok: false, field: 0, message: expect.stringMatching(/"n".*1.*8/) });
    expect(validateNumberDraft(def, ['0'])).toMatchObject({ ok: false, field: 0 });
    expect(validateNumberDraft(def, ['2.5'])).toMatchObject({ ok: false, field: 0 });
    expect(validateNumberDraft(def, [''])).toEqual({ ok: false, field: 0, message: 'Enter a value for "n".' });
    expect(validateNumberDraft(def, ['5'])).toEqual({ ok: true, values: [5] });
    expect(() => def.generateSteps([4, 5])).toThrow(RangeError);
    expect(() => def.generateSteps([4.5])).toThrow(RangeError);
  });
});
