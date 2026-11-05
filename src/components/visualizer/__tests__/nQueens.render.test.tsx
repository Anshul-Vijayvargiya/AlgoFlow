import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { BoardVisualizer } from '../BoardVisualizer';

// The real BoardVisualizer for steps of the real N-Queens trace: the n × n board, each square's state (empty, queen,
// checking, safe, conflict with its attacker, placed, removed), the row being filled, the call stack and the solutions.
const run = (n: number) => getAlgorithmDefinition('backtracking-n-queens')!.generateSteps([n]);
const render = (s: ExecutionStep) => renderToStaticMarkup(<BoardVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/<!-- -->/g, '');
/** the squares that are not empty, as "row,col:state" */
const squares = (html: string) => [...html.matchAll(/<td data-row="(\d)" data-col="(\d)" data-square="([a-z]+)"/g)].filter(m => m[3] !== 'empty').map(m => `${m[1]},${m[2]}:${m[3]}`);
const squareCount = (html: string) => [...html.matchAll(/<td data-row=/g)].length;
const calls = (html: string) => [...html.matchAll(/data-frame-row="(\d)" data-frame-status="([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`);

const four = run(4);
const at = (codeRef: string, n = 0) => four.filter(s => s.codeRef === codeRef)[n];

describe('BoardVisualizer — N-Queens', () => {
  it('draws an n × n board for every n from 1 to 8, with row and column labels', () => {
    for (let n = 1; n <= 8; n++) {
      const html = render(run(n)[0]);
      expect(squareCount(html), `n = ${n}`).toBe(n * n);
      expect([...html.matchAll(/data-col-label="\d"/g)], `n = ${n}`).toHaveLength(n);
      expect([...html.matchAll(/data-row-label="\d"/g)], `n = ${n}`).toHaveLength(n);
      expect(html).toMatch(new RegExp(`data-testid="board-visualizer" data-n="${n}"`));
    }
  });

  it('the start: an empty board, no square checked, no solution yet', () => {
    const html = render(four[0]);
    expect(squares(html)).toEqual([]);
    expect(html).toMatch(/data-testid="board-solutions" data-count="0"/);
    expect(html).toContain('no call in progress');
  });

  it('checking a square: it is marked, its row is the current row, and its row and column labels stand out', () => {
    const html = render(at('check-safe'));
    expect(squares(html)).toEqual(['0,0:checking']);
    expect(html).toMatch(/<tr data-row="0" data-current-row="true">/);
    expect(html).toMatch(/data-testid="board-focus" data-row="0" data-col="0" data-status="checking"/);
  });

  it('a conflict: the square is attacked, the attacking queen is ringed, and the line is named', () => {
    const html = render(at('conflict-column'));
    expect(squares(html)).toEqual(['0,0:attacker', '1,0:conflict']);
    expect(decode(html)).toContain('by the queen at row 0, column 0 (same column)');
    expect(decode(html)).toContain('Row 1, column 0: attacked: not safe');
    expect(decode(html)).toContain('Row 0, column 0: queen attacking the square being checked');
    const left = render(at('conflict-left'));
    expect(squares(left)).toEqual(['0,0:attacker', '1,1:conflict']);
    expect(decode(left)).toContain('(upper-left diagonal)');
  });

  it('safe, placed, and removed when backtracking: each square says so; the queens line follows the board', () => {
    expect(squares(render(at('safe', 1)))).toEqual(['0,0:queen', '1,2:safe']);
    const placed = render(at('place', 1));
    expect(squares(placed)).toEqual(['0,0:queen', '1,2:placed']);
    expect(placed).toMatch(/data-testid="board-queens" data-queens="0,2"/);
    const removed = render(at('remove'));
    expect(squares(removed)).toContainEqual(expect.stringMatching(/:removed$/));
    expect(removed).toMatch(/outline-dashed/);
  });

  it('the call stack: solve(row = 0) … the running call last; a full board says so', () => {
    const save = at('save');
    const html = render(save);
    expect(calls(html)).toEqual(['0:waiting', '1:waiting', '2:waiting', '3:waiting', '4:active']);
    expect(html).toMatch(/solve\(row = 4\)<span> — board full<\/span>/);
    expect(html).toContain('board full: every row has a queen');
    expect(html).toMatch(/data-solution="1,3,0,2"/);
  });

  it('the end: both solutions listed, the count, an empty board, and the result', () => {
    const html = render(four.at(-1)!);
    expect([...html.matchAll(/data-solution="([\d,]+)"/g)].map(m => m[1])).toEqual(['1,3,0,2', '2,0,3,1']);
    expect(html).toMatch(/data-testid="board-solutions" data-count="2"/);
    expect(squares(html)).toEqual([]);
    expect(html).toMatch(/data-testid="board-result"[^>]*>.*2 solutions for n = 4: \[1, 3, 0, 2\], \[2, 0, 3, 1\]/);
    expect(decode(html)).toContain('aria-label="Solutions found (the column of the queen in each row): [1, 3, 0, 2]; [2, 0, 3, 1]"');
  });

  it('no solution (n = 3): the count is 0 and the result says why', () => {
    const html = render(run(3).at(-1)!);
    expect(html).toMatch(/data-testid="board-solutions" data-count="0"/);
    expect(html).toMatch(/No solution for n = 3/);
  });

  it('queens are drawn as ♛ (hidden from assistive technology, which reads each square in words) and a legend explains the marks', () => {
    const html = render(at('place', 1));
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>♛<\/span>/);
    expect(html).toContain('data-testid="board-legend"');
    expect(decode(html)).toMatch(/<caption class="sr-only">4 × 4 board; filling row 1\. Queens: row 0 column 0, row 1 column 2\.<\/caption>/);
  });

  it('renders nothing for a step without a board (another visual kind)', () => {
    const tree = getAlgorithmDefinition('tree-inorder')!.generateSteps([])[0];
    expect(render(tree)).toBe('');
  });
});
