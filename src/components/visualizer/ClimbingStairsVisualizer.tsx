import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep } from '../../types/algorithm';

interface ClimbingStairsVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * what a stair shows. current: the step whose ways this pass computes (i); prev1 / prev2: the steps whose ways the two
 * variables hold; known: a step whose ways the run has established; unknown: not reached yet; result: step n, answered
 */
type StairState = 'current' | 'prev1' | 'prev2' | 'known' | 'unknown' | 'result';

const STAIR_TONE: Record<StairState, string> = {
  current: 'bg-amber-500/20 border-amber-400 text-amber-200',
  prev1: 'bg-cyan-500/20 border-cyan-400 text-cyan-200',
  prev2: 'bg-purple-500/20 border-purple-400 text-purple-200',
  known: 'bg-slate-800/80 border-slate-600 text-slate-200',
  unknown: 'bg-slate-900/40 border-dashed border-slate-700 text-slate-500',
  result: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
};

/** what a state means, in words (the legend and screen readers never rely on colour alone) */
const STATE_TEXT: Partial<Record<StairState, string>> = {
  current: 'step i: being computed',
  prev1: 'prev1 = ways(i − 1)',
  prev2: 'prev2 = ways(i − 2)',
  known: 'computed earlier',
  result: 'the answer',
};

/** a variable card: its name, its value (– while unset) and which ways(step) it holds */
const VAR_TONE = { prev2: STAIR_TONE.prev2, prev1: STAIR_TONE.prev1, current: STAIR_TONE.current } as const;

/**
 * Climbing Stairs (visual: 'stairs'): the staircase with its steps numbered, the step being computed, the steps whose
 * ways the two rolling variables hold, the variables themselves, the addition, and a display-only history of the ways
 * established so far. Everything shown comes from the step itself (ExecutionStep.stairs): nothing is computed here.
 */
export const ClimbingStairsVisualizer: React.FC<ClimbingStairsVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.stairs;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const n = view.n;
  const known = new Map(view.history.map(h => [h.step, h.ways]));
  // during a pass, step i is the one being computed; its value is known once current is set
  const computing = view.stage === 'loop' && view.i !== null && view.i <= n ? view.i : null;
  const stateOf = (k: number): StairState => {
    if (view.result && k === n) return 'result';
    if (computing === k) return 'current';
    if (view.stage !== 'done' && view.prev1Of === k) return 'prev1';
    if (view.stage !== 'done' && view.prev2Of === k) return 'prev2';
    return known.has(k) ? 'known' : 'unknown';
  };
  const stairs = Array.from({ length: n }, (_, idx) => ({ k: idx + 1, state: stateOf(idx + 1), ways: known.get(idx + 1) }));
  const shown = new Set(stairs.map(s => s.state));
  const tag = (k: number) => [view.stage !== 'done' && view.prev2Of === k ? 'prev2' : '', view.stage !== 'done' && view.prev1Of === k ? 'prev1' : '', computing === k ? 'i' : ''].filter(Boolean);
  const text = n <= 6 ? 'text-sm sm:text-base' : 'text-[11px] sm:text-sm';
  const add = view.addition;
  const described = stairs.map(s => `step ${s.k}: ${s.ways !== undefined ? `${s.ways} way${s.ways === 1 ? '' : 's'}` : 'not computed'}${STATE_TEXT[s.state] ? ` (${STATE_TEXT[s.state]})` : ''}`).join('; ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="stairs-visualizer" data-n={n}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col items-center gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="stairs-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="stairs-progress"
          data-stage={view.stage}
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.stage === 'done' ? 'Done' : computing !== null ? `i = ${computing} of ${n}` : `n = ${n}`}
        </span>

        {/* the staircase: step k is k / n of the full height; ways(k) on the step once it is known */}
        <div className="relative z-10 flex flex-col items-center gap-1" style={{ width: `min(100%, ${n * 3.25}rem)` }}>
          <ol
            data-testid="stairs-steps"
            aria-hidden="true"
            className={`w-full h-36 sm:h-44 grid gap-0.5 sm:gap-1 items-end font-mono font-bold select-none ${text}`}
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          >
            {stairs.map(s => (
              <li
                key={s.k}
                data-stair={s.k}
                data-ways={s.ways ?? ''}
                data-state={s.state}
                style={{ height: `${Math.max(18, (s.k / n) * 100)}%`, transitionDuration: `${transitionMs}ms` }}
                className={`min-w-0 flex items-start justify-center pt-1 rounded-t-lg border-2 border-b-0 tabular-nums transition-colors motion-reduce:transition-none ${STAIR_TONE[s.state]}`}
              >
                {s.ways ?? (s.state === 'current' ? '?' : '')}
              </li>
            ))}
          </ol>
          {/* step numbers, and which variable holds which step */}
          <div className="w-full grid gap-0.5 sm:gap-1 font-mono text-[10px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
            {stairs.map(s => (
              <span key={s.k} className="flex flex-col items-center leading-tight">
                <span className="text-slate-400">{s.k}</span>
                <span data-stair-tag={s.k} className="min-h-3.5 font-bold text-slate-200 whitespace-nowrap">
                  {tag(s.k).join(' ')}
                </span>
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only" data-testid="stairs-text">
          Staircase of {n} step{n === 1 ? '' : 's'}: {described}.
        </p>

        {/* the two rolling variables (and current, while a pass computes it) */}
        <div className="relative z-10 flex flex-wrap justify-center gap-2 font-mono text-[11px] sm:text-xs" data-testid="stairs-vars">
          {(['prev2', 'prev1', 'current'] as const).map(name => {
            const value = view[name];
            const of = name === 'prev2' ? view.prev2Of : name === 'prev1' ? view.prev1Of : value !== null ? view.i : null;
            const active = view.highlight === name;
            return (
              <div
                key={name}
                data-var={name}
                data-value={value ?? ''}
                data-active={active ? 'true' : 'false'}
                className={`min-w-24 px-2 py-1 rounded-lg border-2 text-center ${value === null ? STAIR_TONE.unknown : VAR_TONE[name]} ${active ? 'ring-2 ring-offset-0 ring-amber-300/60' : ''}`}
              >
                <div className="text-[10px] opacity-80">{name}</div>
                <div className="text-base font-bold tabular-nums">{value ?? '–'}</div>
                <div className="text-[10px] opacity-80">{of !== null && value !== null ? `ways(${of})` : ' '}</div>
              </div>
            );
          })}
        </div>

        {/* the addition */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="stairs-calc" data-kind={add ? 'add' : view.highlight === 'base' ? 'base' : ''}>
          {add && (
            <span className={`px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs ${STAIR_TONE.current}`}>
              current = prev1 + prev2 = {add.prev1} + {add.prev2} = {add.current}
            </span>
          )}
          {!add && view.highlight === 'base' && (
            <span className={`px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs ${STAIR_TONE.result}`}>n ≤ 2: the answer is n = {n}</span>
          )}
        </div>

        {/* what the colours mean (only the states this step shows) */}
        {[...shown].some(s => STATE_TEXT[s]) && (
          <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="stairs-legend">
            {(Object.keys(STATE_TEXT) as StairState[])
              .filter(s => shown.has(s))
              .map(s => (
                <li key={s} data-legend={s} className="flex items-center gap-1 text-slate-300">
                  <span className={`inline-block w-3 h-3 rounded border-2 ${STAIR_TONE[s]}`} />
                  {STATE_TEXT[s]}
                </li>
              ))}
          </ul>
        )}

        {/* the history: display only, never stored by the code */}
        <div className="relative z-10 w-full flex flex-col gap-1 text-[11px] font-mono" data-testid="stairs-history" data-count={view.history.length}>
          <span className="text-slate-400">
            history <span className="text-slate-500">(display only — the code keeps just prev2 and prev1, no array)</span>
          </span>
          {view.history.length === 0 ? (
            <span className="text-slate-500">nothing computed yet</span>
          ) : (
            <ol className="flex flex-wrap gap-1" aria-label={`History, display only: ${view.history.map(h => `ways(${h.step}) = ${h.ways}`).join(', ')}`}>
              {view.history.map(h => (
                <li key={h.step} data-history={`${h.step},${h.ways}`} className="px-1.5 py-0.5 rounded-md border bg-slate-900/80 border-slate-700 text-slate-200">
                  ways({h.step}) = {h.ways}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {view.result && (
        <div role="status" data-testid="stairs-result" className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words">
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{view.result.text}</span>
        </div>
      )}
    </div>
  );
};
