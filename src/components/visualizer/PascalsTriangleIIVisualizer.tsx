import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, PascalRowView } from '../../types/algorithm';

interface PascalsTriangleIIVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * what a cell shows. pending: a position the row has not reached yet (an empty outline); appended: the 1 just added at
 * the end; current: row[j], the cell being updated; addend: row[j - 1], the value added to it; updated: the cell that just
 * got its sum; fresh: updated earlier in this pass (row i's value); old: a middle cell this pass has not reached (still
 * the previous row's value); row-complete: the row is complete; result: the returned row; normal: anything else
 */
type CellState = 'pending' | 'appended' | 'current' | 'addend' | 'updated' | 'fresh' | 'old' | 'row-complete' | 'result' | 'normal';

const CELL_TONE: Record<CellState, string> = {
  pending: 'border-dashed border-slate-700/70 bg-transparent text-transparent',
  appended: 'bg-purple-500/20 border-purple-400 text-purple-200',
  current: 'bg-amber-500/20 border-amber-400 text-amber-200',
  addend: 'bg-cyan-500/20 border-cyan-400 text-cyan-200',
  updated: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
  fresh: 'bg-sky-500/15 border-sky-400/70 text-sky-200',
  old: 'bg-slate-900/80 border-dashed border-slate-500 text-slate-300',
  'row-complete': 'bg-emerald-500/10 border-emerald-500/70 text-emerald-200',
  result: 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200',
  normal: 'bg-slate-900/80 border-slate-700 text-slate-200',
};

/** what a state means, in words (the legend and screen readers never rely on colour alone) */
const STATE_TEXT: Partial<Record<CellState, string>> = {
  appended: 'new last 1',
  current: 'row[j]: being updated',
  addend: 'row[j − 1]: added to it',
  updated: 'just updated',
  fresh: 'already updated in this pass',
  old: 'still the previous row',
  'row-complete': 'row complete',
  result: 'final row',
};

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

function cellStates(view: PascalRowView): CellState[] {
  const size = view.rowIndex + 1;
  const focus = view.focus;
  const inPass = view.j !== null && view.i !== null && view.i >= 2 && !view.rowComplete;
  return Array.from({ length: size }, (_, k) => {
    if (k >= view.row.length) return 'pending';
    if (view.result) return 'result';
    if (view.rowComplete) return 'row-complete';
    if (focus?.index === k) return focus.kind === 'appended' ? 'appended' : focus.kind === 'updated' ? 'updated' : 'current';
    if (view.operands && focus && k === focus.index - 1) return 'addend';
    if (view.fresh.includes(k)) return 'fresh';
    if (inPass && k >= 1 && k < view.i!) return 'old';
    return 'normal';
  });
}

/**
 * Pascal's Triangle II (visual: 'dp-row'): the one DP array as a row of cells, the cell being updated (row[j]), the value
 * added to it (row[j - 1]), which cells this pass has updated and which still hold the previous row, the backward
 * direction, the calculation and the returned row. Everything shown comes from the step itself (ExecutionStep.dpRow).
 */
export const PascalsTriangleIIVisualizer: React.FC<PascalsTriangleIIVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.dpRow;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const size = view.rowIndex + 1;
  const states = cellStates(view);
  const shown = new Set(states);
  const focus = view.focus;
  const j = view.j;
  const backward = j !== null && view.i !== null && view.i >= 2 && !view.rowComplete;
  const pointer = (k: number) => (backward && j !== null ? (k === j ? 'j' : k === j - 1 && j >= 1 ? 'j − 1' : '') : '');

  // the calculation of this step, line by line
  let calc: { kind: string; lines: string[] } | null = null;
  if (focus?.kind === 'appended') calc = { kind: 'appended', lines: [`row[${focus.index}] = 1 — every row ends in 1`] };
  else if (focus) {
    const k = focus.index;
    const head = `row[${k}] = row[${k}] + row[${k - 1}]`;
    const pad = ' '.repeat(`row[${k}] `.length);
    const o = view.operands;
    calc = {
      kind: focus.kind,
      lines:
        focus.kind === 'selected' || !o
          ? [head]
          : [head, `${pad}= ${o.current} + ${o.left}`, `${pad}= ${view.sum ?? '?'}`],
    };
  } else if (view.rowComplete && view.i !== null) calc = { kind: 'row-complete', lines: [`Row ${view.i} complete: ${list(view.row)}`] };

  const described = states
    .map((s, k) => (s === 'pending' ? null : `row[${k}] = ${view.row[k]}${STATE_TEXT[s] ? ` (${STATE_TEXT[s]})` : ''}`))
    .filter(Boolean)
    .join(', ');
  const text = size <= 6 ? 'text-base sm:text-lg' : size <= 8 ? 'text-sm sm:text-base' : 'text-[10px] sm:text-sm';
  // ten cells on a 320px phone leave about 21px each: a narrower gap there keeps room for three digits (126)
  const gap = size <= 8 ? 'gap-1 sm:gap-1.5' : 'gap-0.5 sm:gap-1.5';

  return (
    <div className="w-full flex flex-col gap-2" data-testid="dp-row-visualizer" data-row-index={view.rowIndex}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="dp-row-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="dp-row-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.i !== null && view.i <= view.rowIndex ? `row ${view.i} of ${view.rowIndex}` : `row ${view.rowIndex}`}
        </span>

        {/* the array: rowIndex + 1 equal columns, so a cell keeps its place as the row grows */}
        <div className="relative z-10 flex flex-col items-center gap-1" style={{ width: `min(100%, ${size * 3.5}rem)` }}>
          <ol
            data-testid="dp-row-cells"
            aria-hidden="true"
            className={`w-full grid ${gap} font-mono font-bold select-none ${text}`}
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          >
            {states.map((state, k) => (
              <li
                key={k}
                data-dp-cell={k}
                data-value={state === 'pending' ? '' : view.row[k]}
                data-state={state}
                style={{ transitionDuration: `${transitionMs}ms` }}
                className={`aspect-square min-w-0 flex items-center justify-center rounded-lg ${size > 8 ? 'border sm:border-2' : 'border-2'} tabular-nums transition-colors motion-reduce:transition-none ${CELL_TONE[state]}`}
              >
                {state === 'pending' ? '' : view.row[k]}
              </li>
            ))}
          </ol>
          {/* the positions, and the loop variable j and its left neighbour */}
          <div className={`w-full grid ${gap} font-mono text-[10px]`} style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} aria-hidden="true">
            {states.map((_, k) => (
              <span key={k} className="flex flex-col items-center leading-tight">
                <span className="text-slate-400">{k}</span>
                <span data-dp-pointer={k} className="min-h-3.5 font-bold text-amber-200 whitespace-nowrap">
                  {pointer(k)}
                </span>
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only" data-testid="dp-row-text">
          {view.row.length ? `The row array: ${described}.` : 'The row array is empty.'}
        </p>

        {backward && (
          <p data-testid="dp-row-direction" className="relative z-10 text-[11px] font-mono text-slate-400">
            <span aria-hidden="true" className="text-amber-200 font-bold">
              ←{' '}
            </span>
            j runs from right to left, so row[j − 1] still holds the previous row
          </p>
        )}

        {/* the calculation of this step */}
        <div className="relative z-10 min-h-7 flex flex-wrap items-start justify-center gap-3" data-testid="dp-row-calc" data-kind={calc?.kind ?? ''}>
          {calc && (
            <pre
              className={`m-0 px-2 py-1 rounded-md border text-[11px] sm:text-xs font-mono font-bold whitespace-pre text-left ${
                CELL_TONE[calc.kind === 'appended' ? 'appended' : calc.kind === 'updated' ? 'updated' : calc.kind === 'row-complete' ? 'row-complete' : 'current']
              }`}
            >
              {calc.lines.join('\n')}
            </pre>
          )}
          {view.i !== null && view.i <= view.rowIndex && !view.result && (
            <span data-testid="dp-row-vars" className="text-[11px] font-mono text-slate-400 pt-1">
              i = <span className="text-slate-200">{view.i}</span>
              {j !== null && (
                <>
                  , j = <span className="text-slate-200">{j}</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* what the colours mean (only the states this step shows) */}
        {[...shown].some(s => STATE_TEXT[s]) && (
          <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="dp-row-legend">
            {(Object.keys(STATE_TEXT) as CellState[])
              .filter(s => shown.has(s))
              .map(s => (
                <li key={s} data-legend={s} className="flex items-center gap-1 text-slate-300">
                  <span className={`inline-block w-3 h-3 rounded border-2 ${CELL_TONE[s]}`} />
                  {STATE_TEXT[s]}
                </li>
              ))}
          </ul>
        )}

        <p className="relative z-10 w-full text-[11px] font-mono text-slate-400 break-words" data-testid="dp-row-array" data-values={view.row.join(',')}>
          row: <span className="text-slate-200">{view.row.length ? list(view.row) : '[ ]'}</span>
        </p>
      </div>

      {view.result && (
        <div role="status" data-testid="dp-row-result" className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words">
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{currentStep.outcomeText}</span>
        </div>
      )}
    </div>
  );
};
