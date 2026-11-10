import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, MoveZeroesView } from '../../types/algorithm';

interface MoveZeroesVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * what a cell shows. kept: a non-zero value already in place at the front (before slow); zero-found: the value being
 * checked is a zero; nonzero-found: it is not; in-place: slow == fast, no swap needed; swapped: this step swapped it;
 * gap: between slow and fast (only zeroes there); unvisited: fast has not reached it; final-value / final-zero: the
 * result; normal: anything else
 */
type CellState = 'kept' | 'zero-found' | 'nonzero-found' | 'in-place' | 'swapped' | 'gap' | 'unvisited' | 'final-value' | 'final-zero' | 'normal';

const CELL_TONE: Record<CellState, string> = {
  kept: 'bg-emerald-500/10 border-emerald-500/70 text-emerald-200',
  'zero-found': 'bg-rose-500/15 border-rose-400 text-rose-200',
  'nonzero-found': 'bg-amber-500/20 border-amber-400 text-amber-200',
  'in-place': 'bg-sky-500/15 border-sky-400 text-sky-200',
  swapped: 'bg-purple-500/20 border-purple-400 text-purple-200',
  gap: 'bg-slate-900/60 border-dashed border-slate-500 text-slate-300',
  unvisited: 'bg-slate-900/80 border-slate-700 text-slate-200',
  'final-value': 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200',
  'final-zero': 'bg-slate-900/60 border-dashed border-slate-500 text-slate-400',
  normal: 'bg-slate-900/80 border-slate-700 text-slate-200',
};

/** what a state means, in words (the legend and screen readers never rely on colour alone) */
const STATE_TEXT: Partial<Record<CellState, string>> = {
  kept: 'non-zero, already in place',
  'zero-found': 'zero: skipped',
  'nonzero-found': 'non-zero: goes to slow',
  'in-place': 'slow = fast: no swap needed',
  swapped: 'just swapped',
  gap: 'between slow and fast: zeroes',
  'final-value': 'final non-zero values',
  'final-zero': 'zeroes moved to the end',
};

function cellStates(view: MoveZeroesView): CellState[] {
  const { nums, slow, fast, kept } = view;
  return nums.map((_, k) => {
    if (view.result) return k < kept ? 'final-value' : 'final-zero';
    if (view.swapped?.includes(k)) return 'swapped';
    if (view.pair?.same && view.pair.fast === k) return 'in-place';
    if (view.examined?.index === k) return view.examined.zero ? 'zero-found' : 'nonzero-found';
    if (k < kept) return 'kept';
    if (slow !== null && fast !== null && k >= slow && k < fast) return 'gap';
    if (fast !== null && k > fast) return 'unvisited';
    return 'normal';
  });
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/**
 * Move Zeroes (visual: 'cells'): the array as indexed cells, the slow and fast pointers under them, the value being
 * checked (zero or not), the swaps, the non-zero values already in place and the zeroes gathering between the pointers.
 * Every cell keeps its index and pointer tags with it, so a long array wraps onto more rows on a phone instead of
 * scrolling. Everything shown comes from the step itself (ExecutionStep.cells).
 */
export const MoveZeroesVisualizer: React.FC<MoveZeroesVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.cells;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const states = cellStates(view);
  const shown = new Set(states);
  const pointersAt = (k: number) => [view.slow === k ? 'slow' : '', view.fast === k ? 'fast' : ''].filter(Boolean);

  // the decision or action of this step
  let note: { kind: string; text: string } | null = null;
  if (view.swapped) {
    const [s, f] = view.swapped;
    note = { kind: 'swap', text: `swap nums[${s}] ↔ nums[${f}]: ${view.nums[s]} moves to position ${s}, the 0 to position ${f}` };
  } else if (view.pair) {
    note = view.pair.same
      ? { kind: 'in-place', text: `slow = fast = ${view.pair.fast}: already in place, no swap` }
      : { kind: 'swap-needed', text: `slow = ${view.pair.slow} ≠ fast = ${view.pair.fast}: swap needed` };
  } else if (view.examined) {
    const v = view.nums[view.examined.index];
    note = view.examined.zero
      ? { kind: 'zero', text: `nums[${view.examined.index}] = 0: a zero, skip it (slow stays at ${view.slow})` }
      : { kind: 'nonzero', text: `nums[${view.examined.index}] = ${v} ≠ 0: a non-zero value` };
  } else if (view.moved === 'slow' && view.slow !== null && view.slow > 0) {
    note = { kind: 'advance-slow', text: `slow → ${view.slow}: ${view.kept} non-zero value${view.kept === 1 ? '' : 's'} in place` };
  }

  const described = view.nums
    .map((v, k) => {
      const tags = pointersAt(k);
      return `nums[${k}] = ${v}${tags.length ? ` (${tags.join(' and ')})` : ''}${STATE_TEXT[states[k]] ? `, ${STATE_TEXT[states[k]]}` : ''}`;
    })
    .join('; ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="cells-visualizer" data-length={view.nums.length}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="cells-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="cells-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.kept} non-zero in place
        </span>

        {/* the cells: each with its index and the pointers on it; they wrap onto more rows when the screen is narrow */}
        <ol data-testid="cells-row" aria-hidden="true" className="relative z-10 w-full flex flex-wrap justify-center gap-x-1 gap-y-2 font-mono select-none">
          {view.nums.map((v, k) => {
            const tags = pointersAt(k);
            return (
              <li key={k} className="flex flex-col items-center gap-0.5 w-11 sm:w-12">
                <span
                  data-cell={k}
                  data-value={v}
                  data-state={states[k]}
                  style={{ transitionDuration: `${transitionMs}ms` }}
                  className={`w-full h-11 sm:h-12 flex items-center justify-center rounded-lg border-2 text-sm sm:text-base font-bold tabular-nums transition-colors motion-reduce:transition-none ${CELL_TONE[states[k]]}`}
                >
                  {v}
                </span>
                <span className="text-[10px] text-slate-400">{k}</span>
                <span data-pointers={k} className="min-h-7 flex flex-col items-center text-[10px] font-bold leading-tight">
                  {tags.map(t => (
                    <span key={t} data-pointer={t} className={t === 'slow' ? 'text-cyan-300' : 'text-amber-300'}>
                      {t === 'slow' ? '▲ slow' : '▲ fast'}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="sr-only" data-testid="cells-text">
          The array: {described}.
        </p>

        {/* the decision or action of this step */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="cells-note" data-kind={note?.kind ?? ''}>
          {note && (
            <span
              className={`px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center ${
                CELL_TONE[note.kind === 'zero' ? 'zero-found' : note.kind === 'nonzero' ? 'nonzero-found' : note.kind === 'in-place' ? 'in-place' : note.kind === 'advance-slow' ? 'kept' : 'swapped']
              }`}
            >
              {note.text}
            </span>
          )}
        </div>

        {/* what the colours mean (only the states this step shows) */}
        {[...shown].some(s => STATE_TEXT[s]) && (
          <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="cells-legend">
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

        <div className="relative z-10 w-full flex flex-col gap-0.5 text-[11px] font-mono text-slate-400 break-words">
          <p data-testid="cells-input">
            input: <span className="text-slate-300">{list(view.input)}</span>
          </p>
          <p data-testid="cells-array" data-values={view.nums.join(',')}>
            nums: <span className="text-slate-200">{list(view.nums)}</span>
          </p>
        </div>
      </div>

      {view.result && (
        <div role="status" data-testid="cells-result" className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words">
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{currentStep.outcomeText}</span>
        </div>
      )}
    </div>
  );
};
