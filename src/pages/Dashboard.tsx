import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  Play,
  Sparkles,
  Code2,
  Flame,
  Trophy,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Compass,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useChartColors } from '../theme/chartColors';

import { useProgressStore } from '../store/useProgressStore';
import { useAuthStore } from '../store/useAuthStore';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { AlgorithmId } from '../types/algorithm';
import { continueLearning, dailyGoalSummary, difficultySummary, lastActiveText, recommendAlgorithms, weeklySummary } from './dashboard/dashboardData';
import { DifficultyBadge } from './dashboard/DifficultyBadge';

const card = 'bg-surface border border-cyan-500/15 rounded-2xl shadow-xl';
const sectionHeading = 'text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2';

/** A grey placeholder shape while data loads (no numbers are shown until they are real) */
const Skeleton: React.FC<{ className: string }> = ({ className }) => (
  <div aria-hidden="true" className={`rounded-lg bg-slate-800/70 motion-safe:animate-pulse ${className}`} />
);

export const Dashboard: React.FC = () => {
  const chart = useChartColors();
  const { progress, tracks, isLoading, error, fetchProgress } = useProgressStore();
  // the daily goal from Settings, against today's logged minutes
  const goalMinutes = useAuthStore(s => s.user?.preferences?.dailyGoalMinutes);
  const setAlgorithm = useVisualizerStore(s => s.setAlgorithm);

  React.useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // the first load has not finished (or not started): show placeholders, never numbers
  const status: 'loading' | 'error' | 'ready' = progress ? 'ready' : error ? 'error' : 'loading';
  const refreshFailed = Boolean(progress && error);

  const resume = continueLearning(tracks);
  const recommendations = recommendAlgorithms(tracks, resume?.id ?? null);
  const weekly = weeklySummary(progress?.weeklyActivity);
  // the chart plots minutes; days active only in the visualizer (steps, no minutes) would draw an empty chart
  const hasMinutes = Boolean(progress?.weeklyActivity?.some(d => d.minutes > 0));
  const difficulty = difficultySummary(progress?.difficultyDistribution);

  /** select the algorithm in the visualizer store, then the link opens /visualizer showing it */
  const openAlgorithm = (id: AlgorithmId) => () => setAlgorithm(id);

  const stats = progress
    ? [
        { label: 'Problems Solved', value: String(progress.solvedCount), icon: CheckCircle2, tone: 'emerald', valueClass: 'text-ink' },
        { label: 'Algorithms Learned', value: String(progress.algorithmsLearned), icon: BookOpen, tone: 'cyan', valueClass: 'text-ink' },
        {
          label: 'Current Streak',
          value: `${progress.streakDays} ${progress.streakDays === 1 ? 'Day' : 'Days'}`,
          icon: Flame,
          tone: 'amber',
          valueClass: 'text-amber-400',
          emoji: '🔥',
        },
        { label: 'Learning Progress', value: `${progress.overallProgressPercent}%`, icon: Trophy, tone: 'purple', valueClass: 'text-purple-300' },
      ]
    : [];
  const TONE: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  };

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="relative rounded-3xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-purple-950/40 border border-cyan-500/20 p-6 md:p-10 overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            CORE USP: WATCH ALGORITHMS EXECUTE LIVE
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink font-sans">
            Master DSA by <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">Watching It Execute</span>
          </h1>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            Understand algorithms through synchronized code, live vertical visualizations and line-by-line step explanations.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <NavLink
              to="/visualizer"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-sm font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-2 motion-safe:transition-all motion-safe:hover:scale-105"
            >
              <Play className="w-4 h-4 fill-white" aria-hidden="true" />
              Launch Visualizer
            </NavLink>
            <NavLink
              to="/practice"
              className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-cyan-500/40 text-slate-200 font-mono text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Code2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Start Practice
            </NavLink>
          </div>
        </div>
      </div>

      {/* Loading / error feedback for the progress data (announced politely) */}
      <div role="status" aria-live="polite" data-testid="dashboard-status" className="sr-only">
        {status === 'loading' ? 'Loading your progress…' : status === 'ready' && !isLoading ? 'Your progress is up to date.' : ''}
      </div>

      {status === 'error' && (
        <div role="alert" data-testid="dashboard-error" className={`${card} p-6 flex flex-col sm:flex-row sm:items-center gap-4 border-rose-500/40`}>
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
        <div role="status" data-testid="dashboard-refresh-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn&apos;t refresh your progress. Showing what was loaded earlier.</span>
          <button type="button" onClick={() => fetchProgress()} className="font-mono font-bold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      {status !== 'error' && (
        <section aria-labelledby="dashboard-stats-heading">
          <h2 id="dashboard-stats-heading" className="sr-only">Your statistics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-stats" aria-busy={status === 'loading'}>
            {status === 'loading'
              ? [0, 1, 2, 3].map(i => (
                  <div key={i} className={`${card} p-5 flex items-center gap-4`}>
                    <Skeleton className="w-12 h-12" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              : stats.map(s => (
                  <div key={s.label} className={`${card} p-5 flex items-center gap-4`}>
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${TONE[s.tone]}`}>
                      <s.icon className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div>
                      <div className={`text-2xl font-bold font-mono ${s.valueClass}`}>{s.value}</div>
                      <div className="text-xs text-slate-400">
                        {s.label}
                        {s.emoji && <span aria-hidden="true"> {s.emoji}</span>}
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        </section>
      )}

      {/* Daily goal (Settings) against today's logged minutes */}
      {status === 'ready' && (() => {
        const goal = dailyGoalSummary(progress?.weeklyActivity, goalMinutes);
        if (!goal) return null;
        return (
          <section aria-labelledby="daily-goal-heading" data-testid="daily-goal" className={`${card} p-5 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="daily-goal-heading" className={sectionHeading}>
                <Clock className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Daily goal
              </h2>
              <span data-testid="daily-goal-text" className={`text-sm font-mono ${goal.met ? 'text-emerald-400' : 'text-slate-300'}`}>
                {goal.today} of {goal.goal} min today{goal.met ? ' · goal reached' : ''}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Daily goal"
              aria-valuemin={0}
              aria-valuemax={goal.goal}
              aria-valuenow={Math.min(goal.today, goal.goal)}
              aria-valuetext={`${goal.today} of ${goal.goal} minutes today`}
              className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800"
            >
              <div className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full" style={{ width: `${goal.percent}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">
              Minutes are estimated: each practice submission counts as 5 minutes, and visualizer time is not measured.
              Change the goal in Settings.
            </p>
          </section>
        );
      })()}

      {/* Main Grid: Continue Learning + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Continue Learning: the most recent algorithm still in progress, from the progress tracks (hidden when the
              tracks failed to load: "nothing in progress" would not be known to be true) */}
          {status !== 'error' && (
          <section aria-labelledby="continue-heading" data-testid="continue-learning" className={`${card} border-cyan-500/20 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
            <div className="space-y-1">
              <h2 id="continue-heading" className="inline-block text-[10px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                Continue learning
              </h2>
              {status === 'loading' ? (
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ) : resume ? (
                <>
                  <p className="text-lg font-bold text-ink">{resume.name}</p>
                  <p className="text-xs text-slate-400">In progress · last active {lastActiveText(resume.lastActivityAt)}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-ink">Nothing in progress yet</p>
                  <p className="text-xs text-slate-400">Open an algorithm in the visualizer to start; recommendations are listed on this page.</p>
                </>
              )}
            </div>
            {resume && status !== 'loading' && (
              <Link
                to="/visualizer"
                onClick={openAlgorithm(resume.id)}
                className="px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center gap-2 shrink-0 transition-colors"
              >
                Open {resume.name}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            )}
          </section>
          )}

          {/* Weekly Activity Chart */}
          {status !== 'error' && (
            <section aria-labelledby="weekly-heading" data-testid="weekly-activity" className={`${card} p-6 space-y-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="weekly-heading" className={sectionHeading}>
                    <TrendingUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    Weekly activity
                  </h2>
                  <p className="text-xs text-slate-400">
                    Minutes logged per day. Practice submissions are logged as 5 minutes each; visualizer time is not tracked yet.
                  </p>
                </div>
                {status === 'ready' && (
                  <span data-testid="weekly-active-days" className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">
                    Active on {weekly.activeDays} of 7 days
                  </span>
                )}
              </div>

              {status === 'loading' ? (
                <Skeleton className="h-56 w-full" />
              ) : hasMinutes ? (
                // the chart is drawn for sighted users; its data is in the text summary, so it is hidden and not focusable
                <figure aria-labelledby="weekly-heading" aria-describedby="weekly-summary" className="h-56 w-full pt-2 m-0">
                  <p id="weekly-summary" className="sr-only">{weekly.description}</p>
                  <div aria-hidden="true" className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={progress!.weeklyActivity} accessibilityLayer={false}>
                        <XAxis dataKey="day" stroke={chart.axis} fontSize={11} />
                        <YAxis stroke={chart.axis} fontSize={11} />
                        <Tooltip contentStyle={chart.tooltip} />
                        <Bar dataKey="minutes" name="Minutes logged" fill={chart.primary} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </figure>
              ) : (
                <div data-testid="weekly-empty" className="h-56 flex flex-col items-center justify-center gap-2 text-center rounded-xl border border-dashed border-slate-700 px-6">
                  {weekly.hasActivity ? (
                    <>
                      <p className="text-sm font-semibold text-slate-300">No minutes logged in the last 7 days</p>
                      <p className="text-xs text-slate-400">
                        Your visualizer activity is on the <Link to="/progress" className="text-cyan-400 underline underline-offset-2">Progress page</Link>.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-slate-300">No activity logged in the last 7 days</p>
                      <p className="text-xs text-slate-400">Submit a practice problem and it will appear here.</p>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {/* Difficulty Distribution of solved practice problems */}
          {status !== 'error' && (
            <section aria-labelledby="difficulty-heading" data-testid="difficulty-distribution" className={`${card} p-6 space-y-4`}>
              <h2 id="difficulty-heading" className={sectionHeading}>
                Solved by difficulty
              </h2>
              {status === 'loading' ? (
                <Skeleton className="h-44 w-full" />
              ) : difficulty.hasSolved ? (
                <>
                  <figure aria-labelledby="difficulty-heading" aria-describedby="difficulty-summary" className="h-44 w-full m-0">
                    <p id="difficulty-summary" className="sr-only">{difficulty.description}</p>
                    <div aria-hidden="true" className="h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer={false}>
                          <Pie data={difficulty.items} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value" nameKey="name" rootTabIndex={-1}>
                            {difficulty.items.map(entry => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={chart.tooltip} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </figure>
                  <ul className="flex flex-wrap justify-around gap-2" aria-label="Solved problems by difficulty">
                    {difficulty.items.map(d => (
                      <li key={d.name}>
                        <DifficultyBadge level={d.name}>
                          <span className="text-ink">{d.value}</span>
                        </DifficultyBadge>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div data-testid="difficulty-empty" className="h-44 flex flex-col items-center justify-center gap-2 text-center rounded-xl border border-dashed border-slate-700 px-4">
                  <p className="text-sm font-semibold text-slate-300">No solved problems yet</p>
                  <NavLink to="/practice" className="text-xs font-mono font-bold text-cyan-400 underline underline-offset-2">
                    Solve your first practice problem
                  </NavLink>
                </div>
              )}
            </section>
          )}

          {/* Recommended Algorithms: implemented, not yet completed, from the algorithm registry */}
          <section aria-labelledby="recommended-heading" className={`${card} p-6 space-y-3`}>
            <h2 id="recommended-heading" className={sectionHeading}>
              <Compass className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Recommended algorithms
            </h2>
            {status === 'loading' ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : recommendations.length ? (
              <ul className="space-y-2" data-testid="recommendations">
                {recommendations.map(alg => (
                  <li key={alg.id}>
                    <Link
                      to="/visualizer"
                      onClick={openAlgorithm(alg.id)}
                      data-algorithm={alg.id}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 flex items-center justify-between text-xs transition-colors group"
                    >
                      <span>
                        <span className="block font-bold text-slate-200 group-hover:text-cyan-300">{alg.name}</span>
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {alg.categoryLabel} • {alg.complexity}
                        </span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">You have completed every algorithm in the visualizer.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
