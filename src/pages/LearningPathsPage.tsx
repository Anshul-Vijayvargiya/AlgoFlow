import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Eye, Hourglass, ArrowRight, Sparkles, BookOpen, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { useProgressStore } from '../store/useProgressStore';
import { useVisualizerStore } from '../store/useVisualizerStore';
import { getNavItemById } from '../data/algorithmMetadata';
import { LEARNING_TRACKS, milestoneStatus, trackSummary, type MilestoneStatus } from './learning/learningPaths';

const STATUS_TEXT: Record<MilestoneStatus, string> = {
  'not-started': 'Not started',
  explored: 'Explored',
  'coming-soon': 'Coming soon',
};

export const LearningPathsPage: React.FC = () => {
  const { tracks, tracksLoaded, tracksLoading, tracksError, fetchTracks } = useProgressStore();
  const setAlgorithm = useVisualizerStore(s => s.setAlgorithm);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // statuses are shown only once the user's own progress has loaded: never a guess while loading or after a failure
  const status: 'loading' | 'error' | 'ready' = tracksLoaded ? 'ready' : tracksError ? 'error' : 'loading';
  const refreshFailed = status === 'ready' && Boolean(tracksError);

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Title */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono">
          <Compass className="w-3.5 h-3.5" aria-hidden="true" />
          STRUCTURED LEARNING ROADMAPS
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink font-sans">
          DSA <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Mastery Roadmap</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Follow curated step-by-step tracks to build intuition from fundamental searching to advanced divide-and-conquer partition techniques.
          A milestone is marked explored once you step through its algorithm in the visualizer.
        </p>
      </div>

      {/* loading feedback, announced politely */}
      <div role="status" aria-live="polite" data-testid="roadmap-status" className="sr-only">
        {status === 'loading' ? 'Loading your progress…' : status === 'ready' && !tracksLoading ? 'Your progress is up to date.' : ''}
      </div>

      {status === 'error' && (
        <div role="alert" data-testid="roadmap-error" className="bg-surface border border-rose-500/40 rounded-2xl shadow-xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-bold text-ink">Your progress could not be loaded</h2>
            <p className="text-sm text-slate-400">{tracksError} The roadmap is still available; milestone progress is shown once it loads.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchTracks()}
            disabled={tracksLoading}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono font-bold flex items-center gap-2 hover:border-cyan-500/50 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            {tracksLoading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {refreshFailed && (
        <div role="status" data-testid="roadmap-refresh-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn&apos;t refresh your progress. Showing what was loaded earlier.</span>
          <button type="button" onClick={() => fetchTracks()} className="font-mono font-bold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Tracks List */}
      <div className="space-y-8" aria-busy={status === 'loading'} data-testid="roadmap-tracks">
        {LEARNING_TRACKS.map((track) => {
          const summary = trackSummary(track, tracks);
          return (
          <section
            key={track.id}
            aria-labelledby={`track-${track.id}-heading`}
            data-track={track.id}
            className="bg-surface border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${track.iconColor} flex items-center justify-center text-white font-bold shadow-lg`}>
                  <BookOpen className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id={`track-${track.id}-heading`} className="text-lg font-bold text-ink">{track.title}</h2>
                  <p className="text-xs text-slate-400">{track.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {status === 'ready' && (
                  <span data-testid="track-summary" className="text-xs font-mono text-slate-300">
                    {summary.explored} of {summary.available} explored
                  </span>
                )}
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-cyan-400 w-fit">
                  {track.level} Track
                </span>
              </div>
            </div>

            {/* Milestones timeline */}
            <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {track.milestones.map((m, idx) => {
                const ms = milestoneStatus(m.algorithmId, tracks);
                const comingSoon = ms === 'coming-soon';
                // the user's status is known only once their progress has loaded; coming soon never depends on it
                const shown: MilestoneStatus | null = comingSoon ? ms : status === 'ready' ? ms : null;
                const name = comingSoon ? m.title : getNavItemById(m.algorithmId).name;
                return (
                <li
                  key={m.id}
                  data-milestone={m.id}
                  data-status={shown ?? 'unknown'}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    shown === 'explored'
                      ? 'bg-cyan-950/30 border-cyan-500/40'
                      : comingSoon
                      ? 'bg-slate-950/40 border-slate-800/50 border-dashed'
                      : 'bg-slate-900/80 border-slate-700/60 hover:border-cyan-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      STEP {idx + 1}
                    </span>
                    {shown === null ? (
                      <span aria-hidden="true" className="h-4 w-20 rounded bg-slate-800/70 motion-safe:animate-pulse" />
                    ) : (
                      <span data-testid="milestone-status" className={`flex items-center gap-1 text-[11px] font-mono ${
                        shown === 'explored' ? 'text-cyan-300' : 'text-slate-400'
                      }`}>
                        {shown === 'explored' ? (
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        ) : comingSoon ? (
                          <Hourglass className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Sparkles className="w-4 h-4" aria-hidden="true" />
                        )}
                        {STATUS_TEXT[shown]}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-100 font-sans">{m.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" aria-hidden="true" />
                      <span>about {m.estimatedMinutes} mins</span>
                    </div>
                  </div>

                  {comingSoon ? (
                    <div className="w-full py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono text-center">
                      Coming soon
                    </div>
                  ) : (
                    <Link
                      to="/visualizer"
                      onClick={() => setAlgorithm(m.algorithmId)}
                      data-algorithm={m.algorithmId}
                      aria-label={`Visualize ${name}`}
                      className="w-full py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <span>Visualize</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </li>
                );
              })}
            </ol>
          </section>
          );
        })}
      </div>
    </div>
  );
};
