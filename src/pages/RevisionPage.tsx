import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Bookmark, CheckCircle2, Clock, Layers, Loader2, RotateCcw, Search, Trash2 } from 'lucide-react';
import { revisionReasonLabel, type RevisionStatus } from '../data/revisions';
import { revisionCounts, useRevisionStore } from '../store/useRevisionStore';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { AlgorithmId } from '../types/algorithm';
import { filterRevisions, revisedPercent, toRevisionRow, type RevisionFilter, type RevisionRow } from './revision/revisionData';

const FILTERS: { id: RevisionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'revised', label: 'Revised' },
];

const PENDING_MARK = 'bg-purple-500';
const REVISED_MARK = 'bg-cyan-600';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';
const PANEL = 'bg-surface border border-purple-500/20 rounded-2xl shadow-lg shadow-black/20';

/** decoration only: a small binary tree above an array */
const HeroIllustration: React.FC = () => (
  <svg viewBox="0 0 220 120" aria-hidden="true" className="hidden md:block w-56 h-28 shrink-0 opacity-70" fill="none" strokeWidth="1.5">
    <g className="text-cyan-400/50" stroke="currentColor">
      <path d="M110 16 70 42M110 16l40 26M70 42 50 68M70 42l20 26M150 42l-20 26M150 42l20 26" />
    </g>
    <g className="text-purple-400" stroke="currentColor">
      <circle cx="110" cy="16" r="8" className="fill-purple-500/20" />
      <circle cx="70" cy="42" r="8" className="fill-purple-500/20" />
      <circle cx="150" cy="42" r="8" className="fill-purple-500/20" />
    </g>
    <g className="text-cyan-400" stroke="currentColor">
      {[50, 90, 130, 170].map(cx => <circle key={cx} cx={cx} cy="68" r="8" className="fill-cyan-500/20" />)}
    </g>
    <g className="text-blue-400/70" stroke="currentColor">
      {[40, 68, 96, 124, 152].map(x => <rect key={x} x={x} y="92" width="28" height="20" rx="3" className="fill-blue-500/10" />)}
    </g>
  </svg>
);

const STATS = [
  { id: 'pending', label: 'Pending', Icon: Clock, tile: 'bg-purple-500/15 text-purple-300', card: 'border-purple-400/30 from-purple-500/10' },
  { id: 'revised', label: 'Revised', Icon: CheckCircle2, tile: 'bg-cyan-500/15 text-cyan-300', card: 'border-cyan-400/30 from-cyan-500/10' },
  { id: 'total', label: 'Total', Icon: Layers, tile: 'bg-blue-500/15 text-blue-300', card: 'border-blue-400/30 from-blue-500/10' },
] as const;

const RevisionStats: React.FC<{ pending: number; revised: number; total: number }> = counts => (
  <dl className="grid grid-cols-3 gap-2 sm:gap-4">
    {STATS.map(({ id, label, Icon, tile, card }) => (
      <div key={id} className={`min-w-0 rounded-2xl border bg-surface bg-gradient-to-br bg-origin-border to-transparent p-3 sm:p-5 shadow-lg shadow-black/20 ${card}`}>
        <dt className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 text-xs sm:text-sm font-mono text-slate-300">
          <span className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${tile}`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </span>
          {label}
        </dt>
        <dd data-testid={`revision-stat-${id}`} className="mt-1.5 sm:mt-3 text-2xl sm:text-4xl leading-none font-bold font-mono text-ink">{counts[id]}</dd>
      </div>
    ))}
  </dl>
);

/** the share revised as a ring; the number inside it carries the meaning */
const RevisedRing: React.FC<{ percent: number }> = ({ percent }) => (
  <div role="img" aria-label={`${percent}% revised`} className="relative w-20 h-20 shrink-0">
    <svg viewBox="0 0 80 80" aria-hidden="true" className="w-full h-full -rotate-90" fill="none" strokeWidth="6">
      <circle cx="40" cy="40" r="34" className="stroke-slate-800" />
      {percent > 0 && <circle data-testid="revision-ring-arc" cx="40" cy="40" r="34" pathLength={100} strokeDasharray={`${percent} 100`} className="stroke-cyan-600" />}
    </svg>
    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-lg font-bold font-mono text-ink">{percent}%</span>
  </div>
);

/** the split of the list: each mark sits beside its label, and the numbers carry the meaning */
const RevisionProgress: React.FC<{ pending: number; revised: number; total: number }> = ({ pending, revised, total }) => (
  <section aria-labelledby="revision-progress-title" data-testid="revision-progress" className={`${PANEL} p-4 sm:p-5 flex items-center gap-4 sm:gap-6`}>
    <RevisedRing percent={revisedPercent(revised, total)} />
    <div className="flex-1 min-w-0 space-y-2.5">
      <div>
        <h2 id="revision-progress-title" className="text-base font-semibold text-ink">Revision Progress</h2>
        <p className="text-sm text-slate-400">{revised} of {total} {total === 1 ? 'algorithm' : 'algorithms'} revised</p>
      </div>
      <div role="img" aria-label={`${revised} of ${total} revised, ${pending} pending`} className="flex gap-0.5 h-2.5 rounded-full overflow-hidden bg-slate-800">
        {revised > 0 && <div title={`Revised: ${revised}`} className={REVISED_MARK} style={{ width: `${(revised / total) * 100}%` }} />}
        {pending > 0 && <div title={`Pending: ${pending}`} className={`flex-1 ${PENDING_MARK}`} />}
      </div>
      <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
        <li className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${REVISED_MARK}`} />Revised</li>
        <li className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${PENDING_MARK}`} />Pending</li>
      </ul>
    </div>
  </section>
);

const StatusBadge: React.FC<{ status: RevisionStatus }> = ({ status }) =>
  status === 'revised' ? (
    <span data-testid="revision-status" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[11px] font-mono font-bold">
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
      Revised
    </span>
  ) : (
    <span data-testid="revision-status" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-purple-400/40 bg-purple-500/10 text-purple-300 text-[11px] font-mono font-bold">
      <Clock className="w-3 h-3" aria-hidden="true" />
      Pending
    </span>
  );

const ACTION = `inline-flex items-center justify-center gap-1.5 min-h-10 px-3 py-2 rounded-xl text-xs font-mono font-bold transition-colors ${FOCUS_RING}`;
const BUTTON_ACTION = `${ACTION} cursor-pointer disabled:opacity-60 disabled:cursor-wait`;
const PRIMARY_ACTION = 'data-revision-primary';

const RevisionCard: React.FC<{
  row: RevisionRow;
  busy: boolean;
  onOpen: () => void;
  onStatus: (status: RevisionStatus) => void;
  onRemove: () => void;
}> = ({ row, busy, onOpen, onStatus, onRemove }) => {
  const rootRef = useRef<HTMLLIElement>(null);
  const moveFocus = useRef(false);
  const reason = revisionReasonLabel(row.reason);

  // the button just pressed is replaced when the status changes: keep keyboard users on this card
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[${PRIMARY_ACTION}]`)?.focus();
  }, [row.status]);

  const changeStatus = (next: RevisionStatus) => {
    moveFocus.current = true;
    onStatus(next);
  };

  const removeButton = (
    <button
      type="button"
      disabled={busy}
      onClick={onRemove}
      aria-label={`Remove from Revision: ${row.name}`}
      className={`${BUTTON_ACTION} border border-rose-500/30 text-rose-300 hover:bg-rose-500/10`}
    >
      <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Remove
    </button>
  );

  return (
    <li
      ref={rootRef}
      data-testid="revision-card"
      data-algorithm={row.algorithmId}
      data-status={row.status}
      className={`${PANEL} relative overflow-hidden hover:border-purple-400/50 p-5 pt-6 flex flex-col gap-4 min-w-0 transition-[border-color,box-shadow,transform] hover:shadow-xl motion-safe:hover:-translate-y-0.5`}
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${row.status === 'revised' ? 'from-cyan-500 to-blue-500' : 'from-purple-500 to-blue-500'}`} />

      <div className="space-y-2.5">
        <h2 className="break-words text-lg leading-snug font-semibold text-ink">{row.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 text-[11px] font-mono">{row.category}</span>
          <StatusBadge status={row.status} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 space-y-1">
        <p data-testid="revision-reason" className="text-sm text-slate-400">
          {reason ? <>Reason: <span className="text-slate-200">{reason}</span></> : 'No reason given'}
        </p>
        {row.status === 'revised' && row.revisedAt && (
          <p className="text-xs font-mono text-slate-400">Revised on {new Date(row.revisedAt).toLocaleDateString()}</p>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        {row.status === 'pending' ? (
          <>
            <Link
              to="/visualizer"
              onClick={onOpen}
              aria-label={`Revise Now: ${row.name}`}
              {...{ [PRIMARY_ACTION]: '' }}
              className={`${ACTION} col-span-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg shadow-purple-500/20`}
            >
              Revise Now
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => changeStatus('revised')}
              aria-label={`Mark as Revised: ${row.name}`}
              className={`${BUTTON_ACTION} border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Mark as Revised
            </button>
            {removeButton}
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => changeStatus('pending')}
              aria-label={`Revise Again: ${row.name}`}
              {...{ [PRIMARY_ACTION]: '' }}
              className={`${BUTTON_ACTION} border border-purple-400/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300`}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Revise Again
            </button>
            {removeButton}
          </>
        )}
      </div>
    </li>
  );
};

export const RevisionPage: React.FC = () => {
  const { items, status, error, busy, load, setStatus, remove } = useRevisionStore();
  const setAlgorithm = useVisualizerStore(s => s.setAlgorithm);
  const [filter, setFilter] = useState<RevisionFilter>('all');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => items.map(toRevisionRow), [items]);
  const shown = useMemo(() => filterRevisions(rows, filter, search), [rows, filter, search]);
  const counts = revisionCounts(items);
  const countOf: Record<RevisionFilter, number> = { all: counts.total, pending: counts.pending, revised: counts.revised };

  /** runs a change, and says whether it worked */
  const run = async (action: () => Promise<void>, done: string) => {
    setActionError(null);
    try {
      await action();
      setAnnouncement(done);
      return true;
    } catch (err) {
      setActionError((err as Error)?.message || 'That did not work. Please try again.');
      return false;
    }
  };

  /** the card that held the keyboard focus has gone: start again from the title, without moving the page */
  const focusTitle = () => titleRef.current?.focus({ preventScroll: true });

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <div className="sr-only" aria-live="polite" data-testid="revision-announcer">{announcement}</div>

      <div data-testid="revision-hero" className="rounded-3xl bg-gradient-to-r bg-origin-border from-purple-950 via-slate-900 to-cyan-950 border border-purple-500/25 px-5 py-6 md:px-8 md:py-7 flex items-center justify-between gap-6 shadow-xl shadow-black/20">
        <div className="min-w-0">
          <h1 ref={titleRef} tabIndex={-1} className="text-[28px] sm:text-[34px] leading-tight font-bold font-mono text-ink flex items-center gap-3 outline-none">
            <span className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center shrink-0">
              <Bookmark className="w-6 h-6 text-purple-300" aria-hidden="true" />
            </span>
            Revision List
          </h1>
          <p className="text-base text-slate-300 mt-3">Algorithms you&apos;ve marked to revise later.</p>
        </div>
        <HeroIllustration />
      </div>

      {actionError && (
        <div role="alert" data-testid="revision-action-error" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-300 flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {status === 'error' ? (
        <div role="alert" data-testid="revision-error" className="bg-surface border border-rose-500/30 rounded-3xl p-10 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" aria-hidden="true" />
          <p className="text-base font-mono text-rose-300">{error}</p>
          <button type="button" onClick={() => load({ force: true })} className={`px-4 py-2 rounded-xl border border-purple-400/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-sm font-mono font-bold cursor-pointer ${FOCUS_RING}`}>
            Retry
          </button>
        </div>
      ) : status !== 'ready' ? (
        <div data-testid="revision-loading" className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" aria-hidden="true" />
          <span className="text-sm font-mono text-slate-400">Loading your Revision List...</span>
        </div>
      ) : items.length === 0 ? (
        <div data-testid="revision-empty" className={`${PANEL} rounded-3xl p-8 sm:p-12 text-center space-y-4`}>
          <span className="w-16 h-16 rounded-2xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center mx-auto">
            <Bookmark className="w-8 h-8 text-purple-300" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-mono font-semibold text-ink">Nothing to revise yet</h2>
          <p className="text-base leading-[1.6] text-slate-400 max-w-md mx-auto">
            Open an algorithm in the Visualizer and use the bookmark beside its name, Mark for Revision. It will appear here, ready for when you want to come back to it.
          </p>
          <Link to="/visualizer" className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-mono font-bold shadow-lg shadow-purple-500/20 transition-colors ${FOCUS_RING}`}>
            Go to the Visualizer
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <RevisionStats pending={counts.pending} revised={counts.revised} total={counts.total} />
          <RevisionProgress pending={counts.pending} revised={counts.revised} total={counts.total} />

          <div className={`${PANEL} p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3`}>
            <div role="group" aria-label="Filter by status" className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  data-testid={`revision-filter-${f.id}`}
                  onClick={() => setFilter(f.id)}
                  className={`flex-1 md:flex-none min-h-9 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-mono whitespace-nowrap transition-colors cursor-pointer ${FOCUS_RING} ${
                    filter === f.id ? 'bg-purple-500/20 text-purple-200 border border-purple-400/50 font-bold shadow-sm shadow-purple-500/20' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {f.label} ({countOf[f.id]})
                </button>
              ))}
            </div>
            <div className="relative flex-1 md:max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search by algorithm name"
                placeholder="Search algorithms..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-base font-mono text-slate-200 focus:outline-none focus:border-purple-400/60 focus:ring-1 focus:ring-purple-400/40"
              />
            </div>
          </div>

          {shown.length === 0 ? (
            <div data-testid="revision-no-results" role="status" className={`${PANEL} rounded-3xl p-10 text-center`}>
              <p className="text-base font-mono text-slate-300">No algorithms match this filter and search.</p>
            </div>
          ) : (
            <ul data-testid="revision-list" aria-label="Algorithms to revise" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {shown.map(row => (
                <RevisionCard
                  key={row.algorithmId}
                  row={row}
                  busy={busy.includes(row.algorithmId)}
                  onOpen={() => setAlgorithm(row.algorithmId as AlgorithmId)}
                  onStatus={async next => {
                    const done = await run(() => setStatus(row.algorithmId, next), `${row.name} is now ${next}.`);
                    if (done && filter !== 'all' && filter !== next) focusTitle();
                  }}
                  onRemove={async () => {
                    if (await run(() => remove(row.algorithmId), `${row.name} removed from your Revision List.`)) focusTitle();
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
