import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, ListChecks, RotateCcw, ShieldCheck } from 'lucide-react';
import type { TodayProgress } from '../../api';
import { checklistSummary, resetText } from './dashboardData';

interface Props {
  today: TodayProgress | null;
  loading: boolean;
  error: string | null;
  saving: string | null;
  saveError: string | null;
  onRetry: () => void;
  onToggle: (goalId: string, done: boolean) => void;
  /** the practice-time goal from Settings (estimated minutes), shown under the checklist when set */
  practiceTime: { today: number; goal: number; met: boolean } | null;
  className: string;
  headingClass: string;
}

/**
 * Today's learning checklist. Verified goals are completed by the activity the server recorded (they cannot be ticked
 * by hand); the manual goal is the learner's own intention, ticked here and saved to their account. No points are
 * awarded for ticking anything.
 */
export const DailyChecklist: React.FC<Props> = ({ today, loading, error, saving, saveError, onRetry, onToggle, practiceTime, className, headingClass }) => {
  const summary = today ? checklistSummary(today) : null;

  return (
    <section aria-labelledby="checklist-heading" data-testid="daily-checklist" className={`${className} p-5 space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="checklist-heading" className={headingClass}>
          <ListChecks className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Today&apos;s goals
        </h2>
        {summary && (
          <span data-testid="checklist-count" className={`text-xs font-mono px-2 py-1 rounded ${summary.allDone ? 'text-emerald-300 bg-emerald-500/10' : 'text-cyan-300 bg-cyan-500/10'}`}>
            {summary.text}
          </span>
        )}
      </div>

      {!today && error ? (
        <div role="alert" data-testid="checklist-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Today&apos;s goals could not be loaded. {error}</span>
          <button type="button" onClick={onRetry} disabled={loading} className="font-mono font-bold underline underline-offset-2 flex items-center gap-1 disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : !summary ? (
        <div aria-hidden="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-9 w-full rounded-lg bg-slate-800/70 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Today's goals"
            aria-valuemin={0}
            aria-valuemax={summary.total}
            aria-valuenow={summary.done}
            aria-valuetext={summary.text}
            className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800"
          >
            <div className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full motion-safe:transition-[width]" style={{ width: `${summary.percent}%` }} />
          </div>

          <ul className="space-y-1.5">
            {summary.goals.map(g => {
              const hintId = `goal-hint-${g.id}`;
              const tone = g.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60';
              if (g.kind === 'manual') {
                return (
                  <li key={g.id} data-goal={g.id} data-kind="manual" data-done={g.done} className={`rounded-xl border ${tone}`}>
                    <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer rounded-xl focus-within:ring-2 focus-within:ring-cyan-400">
                      <input
                        type="checkbox"
                        checked={g.done}
                        disabled={saving !== null}
                        onChange={e => onToggle(g.id, e.target.checked)}
                        aria-describedby={hintId}
                        className="mt-0.5 w-4 h-4 accent-cyan-500 shrink-0 focus:outline-none"
                      />
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm ${g.done ? 'text-emerald-300' : 'text-slate-200'}`}>{g.label}</span>
                        <span id={hintId} className="block text-[10px] leading-snug text-slate-400">{g.hint}</span>
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 border border-slate-700 rounded px-1.5 py-0.5 shrink-0">
                        Self-check
                      </span>
                    </label>
                  </li>
                );
              }
              return (
                <li key={g.id} data-goal={g.id} data-kind="verified" data-done={g.done} className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border ${tone}`}>
                  {g.done ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" aria-hidden="true" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${g.done ? 'text-emerald-300' : 'text-slate-200'}`}>
                      {g.label}
                      <span className="sr-only">{g.done ? ' (done)' : ' (not done yet)'}</span>
                    </span>
                    <span className="block text-[10px] leading-snug text-slate-400">{g.hint}</span>
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 border border-cyan-500/30 rounded px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                    Verified
                  </span>
                </li>
              );
            })}
          </ul>

          <div role="status" aria-live="polite" data-testid="checklist-feedback" className="text-xs min-h-[1rem]">
            {saveError ? (
              <span className="text-amber-300">Your tick could not be saved, so it was undone. {saveError}</span>
            ) : summary.allDone ? (
              <span className="text-emerald-300 font-semibold">All of today&apos;s goals are done. Nice work!</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-slate-400 border-t border-slate-800 pt-3">
            <span data-testid="checklist-reset">{resetText(today!.resetsAt)}. Earlier days are kept.</span>
            {practiceTime && (
              <span data-testid="daily-goal" title="Estimated: each practice submission counts as 5 minutes; visualizer time is not measured.">
                Practice time (estimated):{' '}
                <span data-testid="daily-goal-text" className={practiceTime.met ? 'text-emerald-400' : 'text-slate-300'}>
                  {practiceTime.today} of {practiceTime.goal} min today{practiceTime.met ? ' · goal reached' : ''}
                </span>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
};
