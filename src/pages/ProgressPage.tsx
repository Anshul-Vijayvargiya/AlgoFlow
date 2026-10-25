import React, { useEffect, useState } from 'react';
import {
  BarChart2,
  Trophy,
  Flame,
  CheckCircle2,
  Brain,
  TrendingUp,
  Award,
  AlertTriangle,
  RotateCcw,
  Footprints,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { useChartColors } from '../theme/chartColors';
import { useProgressStore } from '../store/useProgressStore';
import { algorithmTotals, dailyStepsSummary, percent, radarOuterRadius, topicCoverageSummary } from './progress/progressData';

const card = 'bg-surface border border-cyan-500/15 rounded-2xl shadow-lg';
const sectionHeading = 'text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2';

/** A grey placeholder shape while data loads (no numbers are shown until they are real) */
const Skeleton: React.FC<{ className: string }> = ({ className }) => (
  <div aria-hidden="true" className={`rounded-lg bg-slate-800/70 motion-safe:animate-pulse ${className}`} />
);

/** a labelled progress bar; value and max are counts */
const Meter: React.FC<{ label: string; value: number; max: number; testId: string }> = ({ label, value, max, testId }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={`${value} of ${max} (${percent(value, max)}%)`}
    data-testid={testId}
    className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800"
  >
    <div className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full motion-safe:transition-all motion-safe:duration-500" style={{ width: `${percent(value, max)}%` }} />
  </div>
);

export const ProgressPage: React.FC = () => {
  const chart = useChartColors();
  const { progress, isLoading, error, recordingError, fetchProgress } = useProgressStore();
  // the radar's drawn size, so its radius leaves room for the topic names on narrow screens
  const [radarSize, setRadarSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // the first load has not finished (or not started): show placeholders, never numbers
  const status: 'loading' | 'error' | 'ready' = progress ? 'ready' : error ? 'error' : 'loading';
  const refreshFailed = Boolean(progress && error);
  const syncing = status === 'ready' && isLoading;

  const totals = algorithmTotals(progress);
  const daily = dailyStepsSummary(progress?.weeklyActivity);
  const topics = topicCoverageSummary(progress?.topicCoverage);
  const streakDays = progress?.streakDays ?? 0;

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="border-b border-slate-800 pb-6 space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
          <BarChart2 className="w-3.5 h-3.5" aria-hidden="true" />
          ANALYTICS & PROGRESS
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-extrabold font-mono text-ink">Learning Progress</h1>
          {syncing && (
            <span aria-hidden="true" className="text-xs font-mono text-cyan-400">
              Syncing progress…
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 max-w-2xl">
          What you have explored in the visualizer, your solved problems and your daily streak. Stepping through an
          algorithm counts as exploring it; it is not counted as learned or completed.
        </p>
      </div>

      {/* loading / syncing feedback, announced politely */}
      <div role="status" aria-live="polite" data-testid="progress-status" className="sr-only">
        {status === 'loading' ? 'Loading your progress…' : syncing ? 'Syncing your progress…' : status === 'ready' ? 'Your progress is up to date.' : ''}
      </div>

      {recordingError && (
        <div role="status" data-testid="progress-recording-error" className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{recordingError}</span>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" data-testid="progress-error" className={`${card} p-6 flex flex-col sm:flex-row sm:items-center gap-4 border-rose-500/40`}>
          <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-bold text-ink">Your progress could not be loaded</h2>
            <p className="text-sm text-slate-400">{error} Your saved progress is not lost; try again.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchProgress()}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono font-bold flex items-center gap-2 hover:border-cyan-500/50 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            {isLoading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {refreshFailed && (
        <div role="status" data-testid="progress-refresh-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn&apos;t refresh your progress. Showing what was loaded earlier.</span>
          <button type="button" onClick={() => fetchProgress()} className="font-mono font-bold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {status !== 'error' && (
        <section aria-labelledby="progress-stats-heading">
          <h2 id="progress-stats-heading" className="sr-only">Your statistics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="progress-stats" aria-busy={status === 'loading'}>
            {status === 'loading' || !progress ? (
              [0, 1, 2, 3].map(i => (
                <div key={i} className={`${card} p-5 space-y-3`}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))
            ) : (
              <>
                {/* Learned: completed algorithms (the same figure as the Dashboard's "Algorithms Learned") */}
                <div className={`${card} p-5 space-y-2`} data-testid="stat-learned">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono text-slate-400">Algorithms learned</h3>
                    <Trophy className="w-5 h-5 text-purple-400" aria-hidden="true" />
                  </div>
                  {totals ? (
                    <>
                      <div className="text-3xl font-bold font-mono text-ink">
                        {totals.completed} <span className="text-lg text-slate-400">/ {totals.implemented}</span>
                      </div>
                      <Meter label="Algorithms learned" value={totals.completed} max={totals.implemented} testId="learned-meter" />
                      <p className="text-[11px] text-slate-400 font-mono" data-testid="learned-percent">
                        {progress.overallProgressPercent}% of the {totals.implemented} visualized algorithms ({totals.available} listed)
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400" data-testid="totals-unavailable">Not available from the server.</p>
                  )}
                </div>

                {/* Explored: algorithms the user has stepped through in the visualizer */}
                <div className={`${card} p-5 space-y-2`} data-testid="stat-explored">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono text-slate-400">Algorithms explored</h3>
                    <Brain className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                  </div>
                  {totals ? (
                    <>
                      <div className="text-3xl font-bold font-mono text-cyan-300">
                        {totals.practised} <span className="text-lg text-slate-400">/ {totals.implemented}</span>
                      </div>
                      <Meter label="Algorithms explored" value={totals.practised} max={totals.implemented} testId="explored-meter" />
                      <p className="text-[11px] text-slate-400 font-mono">Stepped through in the visualizer</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Not available from the server.</p>
                  )}
                </div>

                <div className={`${card} p-5 space-y-2`} data-testid="stat-solved">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono text-slate-400">Problems solved</h3>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="text-3xl font-bold font-mono text-emerald-400">{progress.solvedCount}</div>
                  <p className="text-[11px] text-slate-400 font-mono">Accepted practice submissions</p>
                </div>

                <div className={`${card} p-5 space-y-2`} data-testid="stat-streak">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono text-slate-400">Active streak</h3>
                    <Flame className="w-5 h-5 text-amber-400" aria-hidden="true" />
                  </div>
                  <div className="text-3xl font-bold font-mono text-amber-400">
                    {streakDays} {streakDays === 1 ? 'Day' : 'Days'}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {streakDays > 0 ? 'Consecutive days with recorded activity' : 'No activity recorded today or yesterday'}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {status !== 'error' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section aria-labelledby="daily-steps-heading" data-testid="daily-steps" className={`lg:col-span-8 ${card} shadow-xl p-6 space-y-4`}>
            <div>
              <h2 id="daily-steps-heading" className={sectionHeading}>
                <TrendingUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Visualizer steps per day
              </h2>
              <p className="text-xs text-slate-400">
                For each algorithm you stepped through, the furthest checkpoint saved (its first, middle or last step), added
                up per day for the last 7 days. Steps between checkpoints are not counted.
              </p>
            </div>

            {!progress ? (
              <Skeleton className="h-72 w-full" />
            ) : daily.hasSteps ? (
              <figure aria-labelledby="daily-steps-heading" aria-describedby="daily-steps-summary" className="m-0">
                <p id="daily-steps-summary" className="sr-only">{daily.description}</p>
                <div className="h-72 w-full pt-2" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily.days} accessibilityLayer={false}>
                      <XAxis dataKey="day" stroke={chart.axis} fontSize={11} />
                      <YAxis stroke={chart.axis} fontSize={11} allowDecimals={false} width={32} />
                      <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.grid, opacity: 0.3 }} />
                      <Bar dataKey="steps" name="Steps viewed" fill={chart.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </figure>
            ) : (
              <div data-testid="daily-steps-empty" className="h-72 flex flex-col items-center justify-center gap-2 text-center rounded-xl border border-dashed border-slate-700">
                <Footprints className="w-8 h-8 text-slate-500" aria-hidden="true" />
                <p className="text-sm text-slate-300">No visualizer steps recorded in the last 7 days.</p>
                <p className="text-xs text-slate-400">Step through an algorithm in the visualizer while signed in to see it here.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="topic-coverage-heading" data-testid="topic-coverage" className={`lg:col-span-4 ${card} shadow-xl p-6 space-y-4`}>
            <div>
              <h2 id="topic-coverage-heading" className={sectionHeading}>
                <Award className="w-4 h-4 text-purple-400" aria-hidden="true" />
                Topic coverage
              </h2>
              <p className="text-xs text-slate-400">Share of each topic&apos;s visualized algorithms you have explored</p>
            </div>

            {!progress ? (
              <Skeleton className="h-72 w-full" />
            ) : topics.topics.length === 0 ? (
              <p className="text-sm text-slate-400" data-testid="topic-coverage-unavailable">Topic coverage is not available from the server.</p>
            ) : (
              <figure aria-labelledby="topic-coverage-heading" aria-describedby="topic-coverage-summary" className="m-0 space-y-4">
                <p id="topic-coverage-summary" className="sr-only">{topics.description}</p>
                {/* a radar needs three or more axes; with fewer topics the list below is the whole view */}
                {topics.topics.length >= 3 && (
                  <div className="h-60 sm:h-72 w-full" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%" onResize={(width, height) => setRadarSize({ width, height })}>
                      <RadarChart
                        cx="50%"
                        cy="50%"
                        outerRadius={radarOuterRadius(radarSize.width, radarSize.height, topics.topics.map(t => t.topic))}
                        data={topics.topics}
                        accessibilityLayer={false}
                      >
                        <PolarGrid stroke={chart.grid} />
                        <PolarAngleAxis dataKey="topic" stroke={chart.polarAngle} fontSize={11} />
                        {/* no tick labels: they crowd the centre on small screens; the list gives the exact values */}
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Explored (%)" dataKey="exploredPercent" stroke={chart.radar} fill={chart.radar} fillOpacity={0.5} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <ul className="space-y-1 text-xs font-mono" data-testid="topic-coverage-list" aria-hidden="true">
                  {topics.topics.map(t => (
                    <li key={t.topic} className="flex justify-between gap-2">
                      <span className="text-slate-300">{t.topic}</span>
                      <span className="text-slate-400">
                        {t.practised} of {t.implemented} explored
                      </span>
                    </li>
                  ))}
                </ul>
              </figure>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
