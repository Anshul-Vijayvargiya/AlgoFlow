import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Code2, History, PlayCircle, RotateCcw } from 'lucide-react';
import type { RecentActivityEvent } from '../../api';
import type { AlgorithmId } from '../../types/algorithm';
import { TONE_TEXT } from '../practice/verdicts';
import { recentEventView } from './dashboardData';

interface Props {
  events: RecentActivityEvent[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenAlgorithm: (id: AlgorithmId) => void;
  className: string;
  headingClass: string;
}

/** The latest practice submissions and visualizer walkthroughs the server recorded, newest first. */
export const RecentActivity: React.FC<Props> = ({ events, loaded, loading, error, onRetry, onOpenAlgorithm, className, headingClass }) => {
  const views = events.map(e => recentEventView(e));

  return (
    <section aria-labelledby="recent-heading" data-testid="recent-activity" className={`${className} p-5 space-y-3`}>
      <h2 id="recent-heading" className={headingClass}>
        <History className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        Recent activity
      </h2>

      {error && !loaded ? (
        <div role="alert" data-testid="recent-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Recent activity could not be loaded. {error}</span>
          <button type="button" onClick={onRetry} disabled={loading} className="font-mono font-bold underline underline-offset-2 flex items-center gap-1 disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : !loaded ? (
        <div aria-hidden="true" className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-12 w-full rounded-lg bg-slate-800/70 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : views.length === 0 ? (
        <div data-testid="recent-empty" className="flex flex-col items-center justify-center gap-2 text-center rounded-xl border border-dashed border-slate-700 px-6 py-8">
          <p className="text-sm font-semibold text-slate-300">No activity yet</p>
          <p className="text-xs text-slate-400">
            Submit a solution in{' '}
            <Link to="/practice" className="text-cyan-400 underline underline-offset-2">Practice</Link> or step through an algorithm in the{' '}
            <Link to="/visualizer" className="text-cyan-400 underline underline-offset-2">Visualizer</Link>, and it will be listed here.
          </p>
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full table-fixed text-left text-xs" data-testid="recent-list">
            <caption className="sr-only">Your latest practice submissions and visualizer walkthroughs, newest first</caption>
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <th scope="col" className="py-2 px-1 font-semibold">Activity</th>
                <th scope="col" className="py-2 px-1 font-semibold hidden sm:table-cell w-40">Type</th>
                <th scope="col" className="py-2 px-1 font-semibold w-[5.5rem] sm:w-36">Result</th>
                <th scope="col" className="py-2 px-1 font-semibold w-[4.5rem] sm:w-32 text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {views.map(v => {
                const Icon = v.kind === 'submission' ? Code2 : PlayCircle;
                const name = (
                  <>
                    <Icon className={`w-4 h-4 shrink-0 ${v.kind === 'submission' ? 'text-cyan-400' : 'text-purple-300'}`} aria-hidden="true" />
                    <span className="truncate">{v.title}</span>
                  </>
                );
                return (
                  <tr key={v.id} data-event-kind={v.kind} className="hover:bg-slate-900/50">
                    <td className="py-2.5 px-1 min-w-0">
                      {v.link ? (
                        <Link
                          to={v.link.to}
                          onClick={v.link.algorithmId ? () => onOpenAlgorithm(v.link!.algorithmId!) : undefined}
                          data-testid="recent-link"
                          className="flex items-center gap-2 min-w-0 font-semibold text-slate-200 hover:text-cyan-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        >
                          {name}
                          <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2 min-w-0 font-semibold text-slate-200">{name}</span>
                      )}
                      <span className="block sm:hidden text-[10px] text-slate-400 pl-6">{v.typeLabel}</span>
                    </td>
                    <td className="py-2.5 px-1 text-slate-400 hidden sm:table-cell">{v.typeLabel}</td>
                    <td className={`py-2.5 px-1 font-mono text-[10px] sm:text-xs ${TONE_TEXT[v.tone]}`} data-testid="recent-status">{v.statusLabel}</td>
                    <td className="py-2.5 px-1 text-right font-mono text-[10px] sm:text-xs text-slate-400">
                      {v.when ? <time dateTime={v.at}>{v.when}</time> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
