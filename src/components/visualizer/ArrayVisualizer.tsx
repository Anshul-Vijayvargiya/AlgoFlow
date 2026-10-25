import React from 'react';
import type { ExecutionStep } from '../../types/algorithm';
import { Bar } from './Bar';
import { barHeightPercent, barTransitionMs, deriveStepVisuals, pointerLabel } from './barVisuals';
import type { Outcome } from './barVisuals';
import { CheckCircle2, SearchX, Flag, Inbox } from 'lucide-react';
import { ValueCard } from './ValueCards';
import { HashMapPanel } from './HashMapPanel';

interface ArrayVisualizerProps {
  currentStep: ExecutionStep;
  /** from AlgorithmDefinition.positionPointers — which pointers are array positions */
  positionPointers?: string[];
  /** derived from the trace by deriveOutcome(); only set on the final step */
  outcome?: Outcome | null;
  /** current playback interval (ms per step); bar animations are kept shorter than it (see barTransitionMs) */
  stepIntervalMs?: number;
}

const OUTCOME_TEXT: Record<Outcome, { text: string; tone: string; Icon: React.ElementType }> = {
  sorted: { text: 'Array sorted', tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: CheckCircle2 },
  found: { text: 'Target found', tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: CheckCircle2 },
  'not-found': { text: 'Target not found — no element matched', tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300', Icon: SearchX },
  complete: { text: 'Execution complete', tone: 'bg-slate-500/15 border-slate-500/40 text-slate-300', Icon: Flag },
  empty: { text: 'Empty array — nothing to display', tone: 'bg-slate-500/15 border-slate-500/40 text-slate-300', Icon: Inbox },
};

const fmtBuffer = (b: { values: number[]; cursor?: number }, i: number) => (
  <span
    key={i}
    data-buffer-cell={i}
    data-buffer-active={b.cursor === i ? 'true' : 'false'}
    className={`px-1.5 py-0.5 rounded border text-[11px] font-mono ${
      b.cursor === i
        ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
        : 'bg-slate-900/80 border-slate-700 text-slate-300'
    }`}
  >
    {b.values[i]}
  </span>
);

export const ArrayVisualizer: React.FC<ArrayVisualizerProps> = ({
  currentStep,
  positionPointers,
  outcome = null,
  stepIntervalMs,
}) => {
  const transitionMs = barTransitionMs(stepIntervalMs);
  const { bars, offArray } = deriveStepVisuals(currentStep, { positionPointers, outcome });
  const state = currentStep.state;
  const compact = state.length > 10;
  const heightFor = barHeightPercent(state);
  const vars = currentStep.variables ?? {};
  const target = typeof vars.target === 'number' ? vars.target : undefined;
  const pivot = typeof vars.pivot === 'number' ? vars.pivot : undefined;
  const buffers = currentStep.buffers ?? [];
  const tracker = currentStep.tracker ?? [];
  const hashMap = currentStep.hashMap;
  const outcomeInfo = outcome ? OUTCOME_TEXT[outcome] : null;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="array-visualizer" data-outcome={outcome ?? ''}>
      <div className={`w-full h-72 sm:h-80 md:h-96 bg-[#0B0F19]/90 light:bg-surface/90 border border-cyan-500/15 rounded-2xl px-2 sm:px-6 pb-4 pt-10 flex items-end justify-center ${compact ? 'gap-0.5 sm:gap-1' : 'gap-2 sm:gap-4'} relative overflow-hidden shadow-inner`}>
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {/* Values the algorithm is looking for / around (only when the trace defines them) */}
        {(target !== undefined || pivot !== undefined) && (
          <div className="absolute top-2 left-3 flex gap-2 z-10">
            {target !== undefined && (
              <span data-testid="target-pill" className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200">
                target = {target}
              </span>
            )}
            {pivot !== undefined && (
              <span data-testid="pivot-pill" className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-400/50 text-purple-200">
                pivot = {pivot}
              </span>
            )}
          </div>
        )}

        {bars.map((b, i) => (
          <Bar
            key={`bar-${b.index}`}
            visual={b}
            heightPercent={heightFor(b.value)}
            compact={compact}
            transitionMs={transitionMs}
            edge={bars.length < 2 ? undefined : i === 0 ? 'start' : i === bars.length - 1 ? 'end' : undefined}
          />
        ))}
      </div>

      {/* Values kept beside the array (Two Sum's complement, Boyer–Moore's candidate and count) and a hash map */}
      {(tracker.length > 0 || hashMap) && (
        <div className="flex flex-col md:flex-row md:items-start gap-2 px-1">
          {tracker.length > 0 && (
            <dl aria-label="Values at this step" data-testid="tracker" className="flex flex-wrap gap-2">
              {tracker.map(cell => (
                <ValueCard key={cell.name} cell={cell} transitionMs={transitionMs} size="compact" />
              ))}
            </dl>
          )}
          {hashMap && <HashMapPanel map={hashMap} transitionMs={transitionMs} />}
        </div>
      )}

      {/* Temporary buffers (e.g. Merge Sort): values that are NOT on any bar */}
      {buffers.length > 0 && (
        <div data-testid="buffers" className="flex flex-wrap gap-x-6 gap-y-2 px-1">
          {buffers.map(b => (
            <div key={b.name} data-buffer={b.name} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">{b.name} buffer</span>
              <div className="flex gap-1">{b.values.map((_, i) => fmtBuffer(b, i))}</div>
              {b.cursor !== undefined && (
                <span className="text-[10px] font-mono text-slate-400">
                  {b.cursor < b.values.length ? `${b.name === 'left' ? 'i' : 'j'} = ${b.cursor}` : 'exhausted'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pointers whose value is not an index of the array — listed, never drawn on a bar */}
      {offArray.length > 0 && (
        <p data-testid="off-array" className="text-[11px] font-mono text-slate-400 px-1">
          Off-array: {offArray.map(o => `${pointerLabel(o.name)} = ${o.value}`).join(', ')}
        </p>
      )}

      {outcomeInfo && (
        <div
          role="status"
          data-testid="outcome-banner"
          data-outcome-kind={outcome ?? ''}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold ${outcomeInfo.tone}`}
        >
          <outcomeInfo.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {/* the trace's own words for what it found (e.g. the pair), when it gives them */}
          {currentStep.outcomeText ?? outcomeInfo.text}
        </div>
      )}
    </div>
  );
};
