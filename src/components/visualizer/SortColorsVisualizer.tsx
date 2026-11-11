import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, IndexRange, SortColorsView } from '../../types/algorithm';

interface SortColorsVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * what a cell shows. swapped: this step swapped it; current: the value this step read at mid; zero / one / two: in the
 * region of 0s, 1s or 2s; unknown: not checked yet
 */
type CellState = 'swapped' | 'current' | 'zero' | 'one' | 'two' | 'unknown';
type Pointer = 'low' | 'mid' | 'high';

const CELL_TONE: Record<CellState, string> = {
  swapped: 'bg-purple-500/20 border-purple-400 text-purple-200',
  current: 'bg-amber-500/20 border-amber-400 text-amber-200',
  zero: 'bg-rose-500/15 border-rose-400 text-rose-200',
  one: 'bg-slate-800/80 border-slate-600 text-slate-200',
  two: 'bg-sky-500/15 border-sky-400 text-sky-200',
  unknown: 'bg-slate-900/40 border-dashed border-slate-500 text-slate-300',
};

/** what a state means, in words (the legend and screen readers never rely on colour alone) */
const STATE_TEXT: Record<CellState, string> = {
  swapped: 'just swapped',
  current: 'nums[mid]: being checked',
  zero: '0s: before low',
  one: '1s: from low to mid',
  two: '2s: after high',
  unknown: 'not checked yet',
};

const POINTER_TONE: Record<Pointer, string> = { low: 'text-cyan-300', mid: 'text-amber-300', high: 'text-emerald-300' };
const POINTER_TEXT: Record<Pointer, string> = { low: 'next 0 goes here', mid: 'value being checked', high: 'next 2 goes here' };
const POINTERS: readonly Pointer[] = ['low', 'mid', 'high'];

const inRange = (k: number, [start, end]: IndexRange) => k >= start && k < end;

/** every cell's state, read from the step: the swap and the value read first, then the region the step puts it in */
function cellStates(view: SortColorsView): CellState[] {
  return view.nums.map((_, k) => {
    if (view.swapped?.includes(k)) return 'swapped';
    if (view.current?.index === k) return 'current';
    if (inRange(k, view.regions.zeros)) return 'zero';
    if (inRange(k, view.regions.ones)) return 'one';
    if (inRange(k, view.regions.twos)) return 'two';
    return 'unknown';
  });
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
const span = ([start, end]: IndexRange) => (end <= start ? 'none' : end - start === 1 ? `position ${start}` : `positions ${start} to ${end - 1}`);

/**
 * Sort Colors (visual: 'flag-cells'): the array as indexed cells, the low, mid and high pointers under them, the value
 * being checked, the swaps, and the four regions (0s, 1s, not checked yet, 2s). Every cell keeps its index and pointer
 * tags with it, so a long array wraps onto more rows on a phone instead of scrolling. Everything shown comes from the
 * step itself (ExecutionStep.sortColors): nothing is sorted or worked out here.
 */
export const SortColorsVisualizer: React.FC<SortColorsVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.sortColors;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const states = cellStates(view);
  const shown = new Set(states);
  const pointersAt = (k: number) => POINTERS.filter(p => view[p] === k);
  const n = view.nums.length;

  const described = view.nums
    .map((v, k) => {
      const tags = pointersAt(k);
      return `nums[${k}] = ${v}${tags.length ? ` (${tags.join(', ')})` : ''}, ${STATE_TEXT[states[k]]}`;
    })
    .join('; ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="flag-visualizer" data-length={n} data-operation={view.operation}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="flag-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="flag-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.result ? 'Done' : `${view.regions.unknown[1] - view.regions.unknown[0]} of ${n} not checked`}
        </span>

        {/* the cells: each with its index and the pointers on it; they wrap onto more rows when the screen is narrow */}
        <ol data-testid="flag-row" aria-hidden="true" className="relative z-10 w-full flex flex-wrap justify-center gap-x-1 gap-y-2 font-mono select-none">
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
                <span data-pointers={k} className="min-h-10 flex flex-col items-center text-[10px] font-bold leading-tight">
                  {tags.map(t => (
                    <span key={t} data-pointer={t} className={POINTER_TONE[t]}>
                      ▲ {t}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="sr-only" data-testid="flag-text">
          The array: {described}.
        </p>

        {/* the three pointers as values: a pointer can be off the array (high = -1, mid = n), where no cell carries its tag */}
        <dl className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] font-mono" data-testid="flag-pointers">
          {POINTERS.map(p => (
            <div key={p} data-var={p} data-value={view[p] ?? ''} data-moved={view.moved?.includes(p) ? 'true' : 'false'} className="flex items-baseline gap-1">
              <dt className={`font-bold ${POINTER_TONE[p]}`}>{p}</dt>
              <dd className="text-slate-200 tabular-nums">= {view[p] ?? '–'}</dd>
              <dd className="text-slate-400">({POINTER_TEXT[p]})</dd>
            </div>
          ))}
        </dl>

        {/* what this step did, in the trace's own words */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="flag-note" data-kind={view.operation}>
          <span
            className={`px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center break-words ${
              CELL_TONE[view.swapped ? 'swapped' : view.current ? 'current' : 'one']
            }`}
          >
            {currentStep.message}
          </span>
        </div>

        {/* what the colours mean (only the states this step shows) */}
        <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="flag-legend">
          {(Object.keys(STATE_TEXT) as CellState[])
            .filter(s => shown.has(s))
            .map(s => (
              <li key={s} data-legend={s} className="flex items-center gap-1 text-slate-300">
                <span className={`inline-block w-3 h-3 rounded border-2 ${CELL_TONE[s]}`} />
                {STATE_TEXT[s]}
              </li>
            ))}
        </ul>

        <div className="relative z-10 w-full flex flex-col gap-0.5 text-[11px] font-mono text-slate-400 break-words">
          <p data-testid="flag-input">
            input: <span className="text-slate-300">{list(view.input)}</span>
          </p>
          <p data-testid="flag-array" data-values={view.nums.join(',')}>
            nums: <span className="text-slate-200">{list(view.nums)}</span>
          </p>
          <p data-testid="flag-regions" data-zeros={view.regions.zeros.join(',')} data-ones={view.regions.ones.join(',')} data-unknown={view.regions.unknown.join(',')} data-twos={view.regions.twos.join(',')}>
            0s: <span className="text-slate-300">{span(view.regions.zeros)}</span> · 1s: <span className="text-slate-300">{span(view.regions.ones)}</span> · not checked:{' '}
            <span className="text-slate-300">{span(view.regions.unknown)}</span> · 2s: <span className="text-slate-300">{span(view.regions.twos)}</span>
          </p>
        </div>
      </div>

      {view.result && (
        <div role="status" data-testid="flag-result" className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words">
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{currentStep.outcomeText}</span>
        </div>
      )}
    </div>
  );
};
