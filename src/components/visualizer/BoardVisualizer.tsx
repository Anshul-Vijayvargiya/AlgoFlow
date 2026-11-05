import React from 'react';
import { Equal } from 'lucide-react';
import type { BoardView, ExecutionStep } from '../../types/algorithm';

interface BoardVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * what a square shows. empty: no queen; queen: a queen placed earlier; checking / safe / conflict: the square being
 * tested and the outcome; placed: the queen just placed; attacker: the queen that attacks the square being tested;
 * removed: the queen just taken away (backtracking)
 */
type SquareState = 'empty' | 'queen' | 'checking' | 'safe' | 'conflict' | 'placed' | 'attacker' | 'removed';

const SQUARE_TONE: Record<SquareState, string> = {
  empty: '',
  queen: 'text-cyan-200',
  checking: 'ring-2 ring-inset ring-amber-400 bg-amber-500/20 text-amber-200',
  safe: 'ring-2 ring-inset ring-emerald-400 bg-emerald-500/20 text-emerald-200',
  conflict: 'ring-2 ring-inset ring-rose-400 bg-rose-500/25 text-rose-200',
  placed: 'ring-2 ring-inset ring-emerald-400 bg-emerald-500/25 text-emerald-200',
  attacker: 'ring-2 ring-inset ring-rose-400 bg-rose-500/15 text-rose-200',
  removed: 'outline-2 outline-dashed outline-amber-400 -outline-offset-4 bg-amber-500/10 text-amber-200',
};

/** how each state is said (the colour is never the only signal) */
const SQUARE_TEXT: Record<SquareState, string> = {
  empty: 'empty',
  queen: 'queen',
  checking: 'being checked',
  safe: 'safe',
  conflict: 'attacked: not safe',
  placed: 'queen just placed',
  attacker: 'queen attacking the square being checked',
  removed: 'queen removed (backtracking)',
};

/** the squares that show a queen glyph */
const HAS_QUEEN = new Set<SquareState>(['queen', 'placed', 'attacker', 'removed']);

const LINE_TEXT = { column: 'same column', 'upper-left': 'upper-left diagonal', 'upper-right': 'upper-right diagonal' } as const;

function squareStates(view: BoardView): SquareState[][] {
  const states: SquareState[][] = Array.from({ length: view.n }, (_, r) => Array.from({ length: view.n }, (_, c) => (view.queens[r] === c ? 'queen' : 'empty')));
  if (view.attacker) states[view.attacker.row][view.attacker.col] = 'attacker';
  if (view.cell) states[view.cell.row][view.cell.col] = view.cell.status;
  return states;
}

const placement = (q: readonly number[]) => `[${q.join(', ')}]`;

/**
 * Board algorithms (visual: 'board', N-Queens): the n × n board with its queens, the square this step works on and what
 * it turned out to be (checking, safe, attacked by a named queen, a queen placed or removed), the row being filled, the
 * calls in progress and the solutions found. Everything shown comes from the step itself (ExecutionStep.board).
 */
export const BoardVisualizer: React.FC<BoardVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.board;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const states = squareStates(view);
  const n = view.n;
  // the row being filled: the running call's row (none once the board is full or the search is over)
  const row = view.calls.length && view.calls.at(-1)! < n ? view.calls.at(-1)! : null;
  const focus = view.cell;
  const done = currentStep.type === 'complete';
  // squares shrink with the board, and with a narrow screen (the board never scrolls the page)
  const glyph = n <= 5 ? 'text-2xl' : n <= 6 ? 'text-xl' : 'text-lg';

  return (
    <div className="w-full flex flex-col gap-2" data-testid="board-visualizer" data-n={n}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-4">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="board-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        <table
          data-testid="board"
          // fixed layout: every column the same width whatever it holds (the label column is narrower)
          className="relative z-10 table-fixed border-collapse font-mono select-none"
          style={{ width: `min(100%, ${(n + 1) * 3}rem)` }}
        >
          <caption className="sr-only">
            {n} × {n} board{row !== null ? `; filling row ${row}` : ''}. Queens: {view.queens.length ? view.queens.map((c, r) => `row ${r} column ${c}`).join(', ') : 'none'}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-6" aria-hidden="true" />
              {Array.from({ length: n }, (_, c) => (
                <th
                  key={c}
                  scope="col"
                  data-col-label={c}
                  className={`pb-1 text-[10px] font-bold ${focus?.col === c && !done ? 'text-amber-300' : 'text-slate-400'}`}
                >
                  <span className="sr-only">column </span>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map((cells, r) => (
              <tr key={r} data-row={r} data-current-row={r === row ? 'true' : 'false'}>
                <th scope="row" data-row-label={r} className={`pr-1.5 text-[10px] font-bold text-right ${r === row ? 'text-amber-300' : 'text-slate-400'}`}>
                  <span className="sr-only">row </span>
                  {r}
                  {r === row && <span aria-hidden="true">▸</span>}
                </th>
                {cells.map((s, c) => (
                  <td
                    key={c}
                    data-row={r}
                    data-col={c}
                    data-square={s}
                    data-shade={(r + c) % 2 ? 'dark' : 'light'}
                    style={{ transitionDuration: `${transitionMs}ms` }}
                    className={`relative p-0 text-center align-middle border border-slate-700/60 transition-colors motion-reduce:transition-none ${
                      (r + c) % 2 ? 'bg-slate-800/70' : 'bg-slate-900/40'
                    } ${r === row && s === 'empty' ? 'bg-amber-500/5' : ''} ${SQUARE_TONE[s]}`}
                  >
                    {/* a table cell ignores aspect-ratio: the box inside keeps the square square */}
                    <div className="aspect-square flex items-center justify-center">
                      {HAS_QUEEN.has(s) ? (
                        <span aria-hidden="true" className={`${glyph} leading-none ${s === 'removed' ? 'opacity-70' : ''}`}>
                          ♛
                        </span>
                      ) : null}
                      {(s === 'conflict' || s === 'safe' || s === 'checking') && (
                        <span aria-hidden="true" className="text-xs font-bold">
                          {s === 'conflict' ? '✕' : s === 'safe' ? '✓' : '?'}
                        </span>
                      )}
                    </div>
                    <span className="sr-only">
                      Row {r}, column {c}: {SQUARE_TEXT[s]}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400" aria-label="Legend" data-testid="board-legend">
          <li><span aria-hidden="true" className="text-cyan-200">♛</span> queen</li>
          <li><span aria-hidden="true" className="text-amber-200">?</span> checking</li>
          <li><span aria-hidden="true" className="text-emerald-200">✓</span> safe / placed</li>
          <li><span aria-hidden="true" className="text-rose-200">✕</span> attacked (the attacker is ringed red)</li>
          <li><span aria-hidden="true" className="text-amber-200">♛</span> dashed: removed (backtracking)</li>
        </ul>

        <div className="relative z-10 w-full flex flex-col gap-2 text-[11px] font-mono">
          <p data-testid="board-focus" data-row={focus?.row ?? ''} data-col={focus?.col ?? ''} data-status={focus?.status ?? ''} className="text-slate-300">
            {focus ? (
              <>
                <span className="text-slate-400">square: </span>
                <span className="font-bold text-amber-200">
                  row {focus.row}, column {focus.col}
                </span>{' '}
                — {SQUARE_TEXT[focus.status]}
                {view.attacker && (
                  <span className="text-rose-300">
                    {' '}
                    by the queen at row {view.attacker.row}, column {view.attacker.col} ({LINE_TEXT[view.attacker.line]})
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">
                {done
                  ? 'search complete'
                  : row !== null
                    ? `filling row ${row}`
                    : view.calls.at(-1) === n
                      ? 'board full: every row has a queen'
                      : 'no square being checked'}
              </span>
            )}
          </p>
          <p data-testid="board-queens" data-queens={view.queens.join(',')} className="text-slate-300">
            <span className="text-slate-400">queens (column per row): </span>
            <span className="font-bold text-cyan-200">{placement(view.queens)}</span>
          </p>

          {/* the solve(row) calls in progress, outermost first; a deep stack scrolls with the running call in view */}
          <div className="flex flex-col gap-1" data-testid="board-calls" data-depth={view.calls.length}>
            <span className="text-slate-400">call stack (outermost first):</span>
            <div tabIndex={0} role="region" aria-label="Call stack" className="max-h-32 overflow-y-auto flex flex-col-reverse rounded-md">
              <ol aria-label={`Calls in progress: ${view.calls.length || 'none'}`} className="flex flex-col gap-0.5">
                {view.calls.length === 0 && <li className="text-slate-500">no call in progress</li>}
                {view.calls.map((r, k) => {
                  const active = k === view.calls.length - 1;
                  return (
                    <li
                      key={k}
                      data-frame={k}
                      data-frame-row={r}
                      data-frame-status={active ? 'active' : 'waiting'}
                      style={{ marginLeft: `${Math.min(k, 8) * 10}px` }}
                      className={`w-fit px-1.5 py-0.5 rounded border ${active ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold' : 'bg-slate-900/80 border-slate-700 text-slate-300'}`}
                    >
                      {k > 0 && <span aria-hidden="true">└─ </span>}
                      solve(row = {r})
                      {r === n && <span> — board full</span>}
                      {!active && <span className="text-slate-500"> (waiting)</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <div className="flex flex-col gap-1" data-testid="board-solutions" data-count={view.solutions.length}>
            <span className="text-slate-400">
              solutions found: <span className="font-bold text-emerald-300">{view.solutions.length}</span>
            </span>
            {view.solutions.length > 0 && (
              <ol
                aria-label={`Solutions found (the column of the queen in each row): ${view.solutions.map(placement).join('; ')}`}
                className="flex flex-wrap gap-1 max-h-32 overflow-y-auto"
              >
                {view.solutions.map((s, k) => (
                  <li
                    key={k}
                    data-solution={s.join(',')}
                    className={`px-1.5 py-0.5 rounded-md border font-bold ${
                      k === view.solutions.length - 1 && currentStep.codeRef === 'save' ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    }`}
                  >
                    {placement(s)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {done && currentStep.outcomeText && (
        <div
          role="status"
          data-testid="board-result"
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
        >
          <Equal className="w-4 h-4 shrink-0" aria-hidden="true" />
          {currentStep.outcomeText}
        </div>
      )}
    </div>
  );
};
