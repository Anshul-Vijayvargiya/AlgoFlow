import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, PascalTriangleView } from '../../types/algorithm';

interface PascalsTriangleVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * what a cell shows. pending: a row not reached yet (an empty outline); unset: a cell of the current row not set yet;
 * set: a cell of the current row set earlier; boundary: a first or last cell just set to 1; current: the cell being
 * calculated (its parents are read or added); assigned: the cell that just got its sum; parent: one of the two cells
 * above the current one; row-complete: the current row, every cell set; appended: the row just appended to the
 * triangle; complete: a row of the triangle; result: the finished triangle
 */
type CellState = 'pending' | 'unset' | 'set' | 'boundary' | 'current' | 'assigned' | 'parent' | 'row-complete' | 'appended' | 'complete' | 'result';

const CELL_TONE: Record<CellState, string> = {
  pending: 'border-dashed border-slate-700/70 bg-transparent text-transparent',
  unset: 'border-dashed border-slate-500 bg-slate-900/60 text-slate-400',
  set: 'bg-slate-900/80 border-sky-400/60 text-sky-200',
  boundary: 'bg-purple-500/20 border-purple-400 text-purple-200',
  current: 'bg-amber-500/20 border-amber-400 text-amber-200',
  assigned: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
  parent: 'bg-cyan-500/20 border-cyan-400 text-cyan-200',
  'row-complete': 'bg-emerald-500/10 border-emerald-500/70 text-emerald-200',
  appended: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
  complete: 'bg-slate-900/80 border-slate-700 text-slate-200',
  result: 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200',
};

/** what a state means, in words (the legend and screen readers never rely on colour alone) */
const STATE_TEXT: Partial<Record<CellState, string>> = {
  boundary: 'boundary element = 1',
  current: 'being calculated',
  parent: 'parent of the current cell',
  assigned: 'just assigned',
  unset: 'not set yet',
  'row-complete': 'row complete',
  appended: 'row just appended',
  result: 'final triangle',
};

/** the legend: the states above, and the cells set earlier in the row being built (screen readers get their values) */
const LEGEND_TEXT: Partial<Record<CellState, string>> = { ...STATE_TEXT, set: 'set in this row' };

const show = (rows: readonly (readonly number[])[]) => `[${rows.map(r => `[${r.join(', ')}]`).join(', ')}]`;

/** every cell's value (null: none to show) and state, row by row, from the step alone */
function cells(view: PascalTriangleView): { value: number | null; state: CellState }[][] {
  const isParent = (r: number, c: number) => Boolean(view.parents?.some(p => p.row === r && p.col === c));
  return Array.from({ length: view.numRows }, (_, r) =>
    Array.from({ length: r + 1 }, (_, c) => {
      if (r < view.triangle.length) {
        const value = view.triangle[r][c];
        if (view.result) return { value, state: 'result' as const };
        if (isParent(r, c)) return { value, state: 'parent' as const };
        if (view.appended === r) return { value, state: 'appended' as const };
        return { value, state: 'complete' as const };
      }
      if (view.row && r === view.i) {
        const value = view.row[c];
        if (view.focus?.col === c) {
          const kind = view.focus.kind;
          return { value, state: kind === 'boundary' ? ('boundary' as const) : kind === 'assigned' ? ('assigned' as const) : ('current' as const) };
        }
        if (value === null) return { value, state: 'unset' as const };
        return { value, state: view.rowComplete ? ('row-complete' as const) : ('set' as const) };
      }
      return { value: null, state: 'pending' as const };
    })
  );
}

/**
 * Pascal's Triangle (visual: 'triangle'): the rows as a centred triangle, the row being built, the cell this step works
 * on, its two parents and their sum, and the triangle generated so far as an array. Everything shown comes from the step
 * itself (ExecutionStep.triangle): nothing is calculated here.
 */
export const PascalsTriangleVisualizer: React.FC<PascalsTriangleVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.triangle;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const n = view.numRows;
  const grid = cells(view);
  const states = new Set(grid.flat().map(c => c.state));
  // the cells shrink with the number of rows, and with a narrow screen (the triangle never scrolls the page)
  const text = n <= 5 ? 'text-sm sm:text-base' : n <= 7 ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs';
  // with more than 7 rows a phone leaves about 21px per cell: a thinner border keeps room for three digits (126)
  const border = n <= 7 ? 'border-2' : 'border sm:border-2';
  const [left, right] = view.parents ?? [];
  const focus = view.focus;
  const rowState = (r: number) =>
    view.result ? 'result' : r < view.triangle.length ? (view.appended === r ? 'appended' : 'complete') : view.row && r === view.i ? (view.rowComplete ? 'row-complete' : 'building') : 'pending';

  // the calculation of this step, in words and numbers
  let calc: { kind: string; text: string } | null = null;
  if (focus?.kind === 'boundary') calc = { kind: 'boundary', text: 'Boundary element = 1' };
  else if (focus && left && right) {
    calc =
      focus.kind === 'parents'
        ? { kind: 'parents', text: `${left.value} + ${right.value} = ?` }
        : { kind: focus.kind, text: `${left.value} + ${right.value} = ${view.sum}${focus.kind === 'assigned' ? `  → row[${focus.col}]` : ''}` };
  } else if (view.rowComplete && view.row && view.i !== null) calc = { kind: 'row-complete', text: `Row ${view.i} complete: [${view.row.join(', ')}]` };
  else if (view.appended !== undefined) calc = { kind: 'appended', text: `Row ${view.appended} appended: [${view.triangle[view.appended].join(', ')}]` };

  const described = grid.map((row, r) => {
    const values = row.map(c => (c.state === 'pending' ? null : c.value === null ? (c.state === 'current' ? 'being calculated' : 'not set') : `${c.value}${STATE_TEXT[c.state] ? ` (${STATE_TEXT[c.state]})` : ''}`));
    return values.every(v => v === null) ? null : `Row ${r}: ${values.join(', ')}.`;
  });

  return (
    <div className="w-full flex flex-col gap-2" data-testid="triangle-visualizer" data-rows={n}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="triangle-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="triangle-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.triangle.length} / {n} rows
        </span>

        {/* the triangle: 2n equal columns, every cell two wide, row r starting n - r - 1 columns in */}
        <div
          data-testid="triangle-grid"
          aria-hidden="true"
          className={`relative z-10 grid gap-x-0.5 sm:gap-x-1 gap-y-1.5 font-mono font-bold select-none ${text}`}
          style={{ width: `min(100%, ${n * 3.25}rem)`, gridTemplateColumns: `repeat(${2 * n}, minmax(0, 1fr))` }}
        >
          {grid.map((row, r) => (
            <div key={r} className="contents" data-tri-row={r} data-row-state={rowState(r)}>
              {row.map((cell, c) => (
                <div
                  key={c}
                  data-tri-cell={`${r},${c}`}
                  data-value={cell.value ?? ''}
                  data-state={cell.state}
                  style={{ gridRow: r + 1, gridColumn: `${n - r + 2 * c} / span 2`, transitionDuration: `${transitionMs}ms` }}
                  className={`aspect-[4/3] min-w-0 flex items-center justify-center rounded-lg ${border} tabular-nums transition-colors motion-reduce:transition-none ${CELL_TONE[cell.state]}`}
                >
                  {cell.state === 'pending' ? '' : cell.value ?? (cell.state === 'current' ? '?' : '')}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="sr-only" data-testid="triangle-text">
          {described.some(Boolean) ? described.filter(Boolean).join(' ') : 'The triangle has no rows yet.'}
        </p>

        {/* the calculation of this step */}
        <div className="relative z-10 w-full flex flex-wrap items-center justify-center gap-2 text-[11px] sm:text-xs font-mono min-h-7" data-testid="triangle-calc" data-kind={calc?.kind ?? ''}>
          {calc && (
            <span className={`px-2 py-1 rounded-md border font-bold ${CELL_TONE[calc.kind === 'parents' || calc.kind === 'sum' ? 'current' : (calc.kind as CellState)]}`}>{calc.text}</span>
          )}
          {view.i !== null && !view.result && (
            <span data-testid="triangle-vars" className="text-slate-400">
              i = <span className="text-slate-200">{view.i}</span>
              {view.j !== null && (
                <>
                  , j = <span className="text-slate-200">{view.j}</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* what the colours mean (only the states this step shows) */}
        {[...states].some(s => LEGEND_TEXT[s]) && (
          <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="triangle-legend">
            {(Object.keys(LEGEND_TEXT) as CellState[])
              .filter(s => states.has(s))
              .map(s => (
                <li key={s} data-legend={s} className="flex items-center gap-1 text-slate-300">
                  <span className={`inline-block w-3 h-3 rounded border-2 ${CELL_TONE[s]}`} />
                  {LEGEND_TEXT[s]}
                </li>
              ))}
          </ul>
        )}

        {/* the triangle generated so far, as the array the code returns */}
        <p className="relative z-10 w-full text-[11px] font-mono text-slate-400 break-words" data-testid="triangle-array" data-rows-built={view.triangle.length}>
          triangle: <span className="text-slate-200">{view.triangle.length ? show(view.triangle) : '[ ]'}</span>
        </p>
      </div>

      {view.result && (
        <div role="status" data-testid="triangle-result" className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words">
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{currentStep.outcomeText}</span>
        </div>
      )}
    </div>
  );
};
