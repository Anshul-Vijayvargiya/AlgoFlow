import React from 'react';
import { CheckCircle2, XCircle, ArrowLeftRight, Equal } from 'lucide-react';
import type { ExecutionStep } from '../../types/algorithm';
import { ValueCard } from './ValueCards';
import { NumberSearchPanel } from './NumberSearchPanel';

interface NumberVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

const RESULT_TONE = {
  prime: { tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: CheckCircle2 },
  'not-prime': { tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300', Icon: XCircle },
  swapped: { tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: ArrowLeftRight },
  yes: { tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', Icon: CheckCircle2 },
  no: { tone: 'bg-rose-500/15 border-rose-500/40 text-rose-300', Icon: XCircle },
  answer: { tone: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300', Icon: Equal },
} as const;

/**
 * Number algorithms (visual: 'numbers'): the named values of the current step as cards, the divisors a prime check
 * has tried so far, and the final answer. Everything shown comes from the step itself (ExecutionStep.numbers).
 */
export const NumberVisualizer: React.FC<NumberVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.numbers;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const currentDivisor = currentStep.type === 'compare' || currentStep.type === 'loop-condition' ? currentStep.variables?.i : undefined;
  const checks = view.divisorChecks;
  const result = view.result ? RESULT_TONE[view.result.kind] : null;

  return (
    <div className="w-full flex flex-col gap-2" data-testid="number-visualizer" data-result={view.result?.kind ?? ''}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-5 relative overflow-hidden shadow-inner flex flex-col items-center justify-center gap-5">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="number-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}

        <dl aria-label="Values at this step" className="relative z-10 w-full flex flex-wrap justify-center gap-3">
          {view.cells.map(cell => (
            <ValueCard key={cell.name} cell={cell} transitionMs={transitionMs} />
          ))}
        </dl>

        {view.search && <NumberSearchPanel search={view.search} transitionMs={transitionMs} />}

        {checks && (
          <div className="relative z-10 w-full" data-testid="divisor-checks">
            <p className="text-[11px] font-mono text-slate-400 mb-1.5 text-center">
              {checks.length === 0 ? 'No divisors checked yet' : `Divisors checked (${checks.length})`}
            </p>
            {checks.length > 0 && (
              <ol className="flex flex-wrap justify-center gap-1.5">
                {checks.map(c => {
                  const isCurrent = c.divisor === currentDivisor;
                  const divides = c.remainder === 0;
                  return (
                    <li
                      key={c.divisor}
                      data-divisor={c.divisor}
                      data-current={isCurrent ? 'true' : 'false'}
                      data-divides={divides ? 'true' : 'false'}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono ${
                        divides
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-bold'
                          : isCurrent
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
                            : 'bg-slate-900/80 border-slate-700 text-slate-300'
                      }`}
                    >
                      i = {c.divisor} · n % i = {c.remainder}
                      {divides && <span className="sr-only"> (divides n)</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>

      {view.result && result && (
        <div
          role="status"
          data-testid="number-result"
          data-result-kind={view.result.kind}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold ${result.tone}`}
        >
          <result.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {view.result.text}
        </div>
      )}
    </div>
  );
};
