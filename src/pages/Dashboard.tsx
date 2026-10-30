import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  Play,
  Code2,
  Flame,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Compass,
  Info,
  Clock,
  Route,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { useChartColors } from '../theme/chartColors';

import { isMockApi } from '../api';
import { useProgressStore } from '../store/useProgressStore';
import { useAuthStore } from '../store/useAuthStore';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { AlgorithmId } from '../types/algorithm';
import {
  continueLearning,
  dailyGoalSummary,
  difficultySummary,
  greeting,
  lastActiveText,
  recommendAlgorithms,
  streakView,
  submissionsText,
  walkthroughsText,
  weeklySummary,
} from './dashboard/dashboardData';
import { DifficultyBadge } from './dashboard/DifficultyBadge';
import { DailyChecklist } from './dashboard/DailyChecklist';
import { RecentActivity } from './dashboard/RecentActivity';

const card = 'bg-surface border border-cyan-500/15 rounded-2xl shadow-xl';
const sectionHeading = 'text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2';

/** A grey placeholder shape while data loads (no numbers are shown until they are real) */
const Skeleton: React.FC<{ className: string }> = ({ className }) => (
  <div aria-hidden="true" className={`rounded-lg bg-slate-800/70 motion-safe:animate-pulse ${className}`} />
);

/** a quiet mountain ridge with a dotted path to the summit, drawn inline (no image request); decorative only */
const SummitArt: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 320 120" preserveAspectRatio="xMaxYMax slice" className="absolute inset-y-0 right-0 h-full w-2/3 md:w-1/2 opacity-40 pointer-events-none">
    <path d="M0 120 L70 62 L110 88 L170 30 L215 70 L250 48 L320 96 L320 120 Z" className="fill-cyan-500/10" />
    <path d="M60 120 L130 74 L170 92 L230 54 L320 108 L320 120 Z" className="fill-cyan-400/10" />
    <path d="M86 118 C120 104 140 100 150 86 S180 66 196 52 S168 40 170 32" fill="none" className="stroke-orange-400/70" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" />
    <circle cx="170" cy="30" r="3.5" className="fill-orange-400" />
  </svg>
);

export const Dashboard: React.FC = () => {
  const chart = useChartColors();
  const {
    progress,
    tracks,
    isLoading,
    error,
    fetchProgress,
    today,
    todayLoading,
    todayError,
    goalSaving,
    goalError,
    fetchToday,
    setManualGoal,
    recent,
    recentLoaded,
    recentLoading,
    recentError,
    fetchRecent,
  } = useProgressStore();
  // the practice-time goal from Settings, against today's estimated minutes
  const goalMinutes = useAuthStore(s => s.user?.preferences?.dailyGoalMinutes);
  const userName = useAuthStore(s => s.user?.name);
  const setAlgorithm = useVisualizerStore(s => s.setAlgorithm);
  // the greeting follows the local time when the page opened
  const [hour] = React.useState(() => new Date().getHours());

  React.useEffect(() => {
    fetchProgress();
    fetchToday();
    fetchRecent();
  }, [fetchProgress, fetchToday, fetchRecent]);

  // the first load has not finished (or not started): show placeholders, never numbers
  const status: 'loading' | 'error' | 'ready' = progress ? 'ready' : error ? 'error' : 'loading';
  const refreshFailed = Boolean(progress && error);

  const resume = continueLearning(tracks);
  const recommendations = recommendAlgorithms(tracks, resume?.id ?? null);
  const weekly = weeklySummary(progress?.weeklyActivity);
  const difficulty = difficultySummary(progress?.difficultyDistribution);
  const streak = progress ? streakView(progress) : null;
  const practiceTime = progress ? dailyGoalSummary(progress.weeklyActivity, goalMinutes) : null;
  const firstName = userName?.trim().split(/\s+/)[0];
  const totals = progress?.algorithmTotals;
  const pathPercent = resume?.path && resume.path.available > 0 ? Math.round((resume.path.explored / resume.path.available) * 100) : 0;

  /** select the algorithm in the visualizer store, then the link opens /visualizer showing it */
  const openAlgorithm = (id: AlgorithmId) => () => setAlgorithm(id);

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Welcome: a short greeting, the two ways to learn, and (in demo mode) where the data lives */}
      <div className="relative rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/20 px-5 py-4 md:px-6 md:py-5 overflow-hidden shadow-xl">
        <SummitArt />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink font-sans">
              {greeting(hour)}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm text-slate-300">One step at a time: watch an algorithm run, then write it yourself.</p>
            {isMockApi && (
              <p data-testid="demo-badge" className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-mono">
                <Info className="w-3 h-3" aria-hidden="true" />
                Demo mode: progress is kept in this browser, not on a server
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <NavLink
              to="/visualizer"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-sm font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-2 motion-safe:transition-all motion-safe:hover:scale-105"
            >
              <Play className="w-4 h-4 fill-white" aria-hidden="true" />
              Launch Visualizer
            </NavLink>
            <NavLink
              to="/practice"
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-cyan-500/40 text-slate-200 font-mono text-sm font-medium flex items-center gap-2 transition-all"
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

      {/* about 70% main content, 30% sidebar on desktop; one column (main first) on smaller screens */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-5" data-testid="dashboard-columns">
        <div className="space-y-5 min-w-0" data-testid="dashboard-main">
          {/* Continue Learning: the most recent algorithm still in progress, from the progress tracks (hidden when the
              tracks failed to load: "nothing in progress" would not be known to be true) */}
          {status !== 'error' && (
            <section aria-labelledby="continue-heading" data-testid="continue-learning" className={`${card} border-cyan-500/25 p-5 flex flex-col md:flex-row md:items-center gap-5`}>
              <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 items-center justify-center shrink-0">
                <Route className="w-7 h-7 text-cyan-300" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
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
                    <p className="text-xs text-slate-400" data-testid="continue-meta">
                      {resume.categoryLabel} · in progress · last active {lastActiveText(resume.lastActivityAt)}
                    </p>
                    {resume.path ? (
                      <div className="space-y-1.5 pt-1" data-testid="continue-path">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded border border-orange-400/40 bg-orange-500/10 text-orange-300 font-mono" data-testid="continue-level">
                            {resume.path.level} path
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-300" data-testid="continue-estimate">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            About {resume.path.estimatedMinutes} min (estimate)
                          </span>
                          <span className="text-slate-400 truncate">{resume.path.title}</span>
                        </div>
                        <div className="flex items-center gap-3 max-w-md">
                          <div
                            role="progressbar"
                            aria-label="Learning path progress"
                            aria-valuemin={0}
                            aria-valuemax={resume.path.available}
                            aria-valuenow={resume.path.explored}
                            aria-valuetext={`${resume.path.explored} of ${resume.path.available} algorithms in this path explored`}
                            className="flex-1 bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800"
                          >
                            <div className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full" style={{ width: `${pathPercent}%` }} />
                          </div>
                          <span className="text-[11px] font-mono text-slate-300 shrink-0" data-testid="continue-path-progress">
                            {resume.path.explored} of {resume.path.available} explored
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Not part of a learning path yet, so there is no path progress or time estimate.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-ink">Nothing in progress yet</p>
                    <p className="text-xs text-slate-400">Open an algorithm in the visualizer to start; recommendations are listed on this page.</p>
                  </>
                )}
              </div>
              {resume && status !== 'loading' && (
                <div className="flex flex-col items-start md:items-end gap-1 shrink-0">
                  <Link
                    to="/visualizer"
                    onClick={openAlgorithm(resume.id)}
                    data-testid="continue-resume"
                    className="px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center gap-2 transition-colors"
                  >
                    Resume {resume.name}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <span className="text-[10px] text-slate-400">Opens at the first step</span>
                </div>
              )}
            </section>
          )}

          {/* Weekly Activity Chart */}
          {status !== 'error' && (
            <section aria-labelledby="weekly-heading" data-testid="weekly-activity" className={`${card} p-5 space-y-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="weekly-heading" className={sectionHeading}>
                    <TrendingUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    Weekly activity
                  </h2>
                  <p className="text-xs text-slate-400">
                    Practice submissions and visualizer walkthroughs per day, last 7 days (UTC). A walkthrough is an
                    algorithm you stepped through in the visualizer; each algorithm counts once a day.
                  </p>
                </div>
                {status === 'ready' && (
                  <span data-testid="weekly-active-days" className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">
                    Active on {weekly.activeDays} of 7 days
                  </span>
                )}
              </div>

              {status === 'loading' ? (
                <Skeleton className="h-64 w-full" />
              ) : weekly.hasActivity ? (
                <>
                  <p data-testid="weekly-totals" className="text-xs text-slate-300">
                    This week: {submissionsText(weekly.totals.submissions)} · {walkthroughsText(weekly.totals.walkthroughs)}
                  </p>
                  {/* the chart is drawn for sighted users; its data is in the text summary, so it is hidden and not focusable */}
                  <figure aria-labelledby="weekly-heading" aria-describedby="weekly-summary" className="h-72 w-full pt-2 m-0">
                    <p id="weekly-summary" className="sr-only">{weekly.description}</p>
                    <div aria-hidden="true" className="h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weekly.days} accessibilityLayer={false} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                          <XAxis dataKey="label" stroke={chart.axis} fontSize={10} interval={0} tickMargin={4} />
                          <YAxis stroke={chart.axis} fontSize={11} allowDecimals={false} width={40} />
                          <Tooltip
                            contentStyle={chart.tooltip}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel ?? label}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="submissions" name="Practice submissions" stackId="activity" fill={chart.primary} />
                          <Bar dataKey="walkthroughs" name="Visualizer walkthroughs" stackId="activity" fill={chart.secondary} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </figure>
                </>
              ) : (
                <div data-testid="weekly-empty" className="h-56 flex flex-col items-center justify-center gap-2 text-center rounded-xl border border-dashed border-slate-700 px-6">
                  <p className="text-sm font-semibold text-slate-300">No activity in the last 7 days</p>
                  <p className="text-xs text-slate-400">
                    Step through an algorithm in the{' '}
                    <Link to="/visualizer" className="text-cyan-400 underline underline-offset-2">visualizer</Link> or submit a practice
                    problem, and it will appear here.
                  </p>
                </div>
              )}
            </section>
          )}

          <RecentActivity
            events={recent}
            loaded={recentLoaded}
            loading={recentLoading}
            error={recentError}
            onRetry={() => fetchRecent()}
            onOpenAlgorithm={id => setAlgorithm(id)}
            className={card}
            headingClass={sectionHeading}
          />
        </div>

        <aside className="space-y-5 min-w-0" data-testid="dashboard-sidebar" aria-label="Your progress, today's goals and recommendations">
          {/* Stats: the streak, solved problems (by difficulty) and algorithms explored, in one panel */}
          {status !== 'error' && (
            <section aria-labelledby="dashboard-stats-heading" className={`${card} p-5 space-y-4`}>
              <h2 id="dashboard-stats-heading" className={sectionHeading}>
                <Flame className="w-4 h-4 text-orange-400" aria-hidden="true" />
                Your progress
              </h2>
              <div data-testid="dashboard-stats" aria-busy={status === 'loading'} className="space-y-4">
                {status === 'loading' || !progress || !streak ? (
                  <>
                    <Skeleton className="h-14 w-full" />
                    <div className="grid grid-cols-2 gap-3">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  </>
                ) : (
                  <>
                    <div data-stat="Current Streak" className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl border border-orange-400/30 bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Flame className="w-6 h-6 text-orange-400" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-2xl font-bold font-mono text-orange-300">{streak.value}</div>
                        <div className="text-xs text-slate-300">
                          Current Streak
                          {streak.current > 0 && <span aria-hidden="true"> 🔥</span>}
                        </div>
                        <div className="text-[11px] text-slate-400" data-testid="streak-note">{streak.note}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3">
                      <div data-stat="Problems Solved" className="min-w-0">
                        <div className="text-xl font-bold font-mono text-ink flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                          {progress.solvedCount}
                        </div>
                        <div className="text-xs text-slate-300">Problems Solved</div>
                        <div className="text-[11px] text-slate-400">Accepted at least once</div>
                      </div>
                      {totals ? (
                        <div data-stat="Algorithms Explored" className="min-w-0">
                          <div className="text-xl font-bold font-mono text-ink flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                            {totals.practised} / {totals.implemented}
                          </div>
                          <div className="text-xs text-slate-300">Algorithms Explored</div>
                          <div className="text-[11px] text-slate-400">Stepped through</div>
                        </div>
                      ) : (
                        <div data-stat="Algorithms Learned" className="min-w-0">
                          <div className="text-xl font-bold font-mono text-ink flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                            {progress.algorithmsLearned}
                          </div>
                          <div className="text-xs text-slate-300">Algorithms Learned</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* solved problems by difficulty: distinct problems with an accepted submission (attempts are not counted) */}
              {status === 'ready' && (
                <div data-testid="difficulty-distribution" className="border-t border-slate-800 pt-3 space-y-2">
                  <h3 id="difficulty-heading" className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Solved by difficulty</h3>
                  {difficulty.hasSolved ? (
                    <>
                      <p id="difficulty-summary" className="sr-only">{difficulty.description}</p>
                      <ul className="flex flex-wrap gap-2" aria-labelledby="difficulty-heading" aria-describedby="difficulty-summary">
                        {difficulty.items.map(d => (
                          <li key={d.name}>
                            <DifficultyBadge level={d.name}>
                              <span className="text-ink">{d.value}</span>
                            </DifficultyBadge>
                          </li>
                        ))}
                      </ul>
                      <NavLink to="/practice" className="text-xs font-mono font-bold text-cyan-400 underline underline-offset-2 inline-flex items-center gap-1">
                        Practise another problem
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </NavLink>
                    </>
                  ) : (
                    <div data-testid="difficulty-empty" className="text-xs text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">No solved problems yet</p>
                      <NavLink to="/practice" className="font-mono font-bold text-cyan-400 underline underline-offset-2">
                        Solve your first practice problem
                      </NavLink>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">A problem counts once a submission is accepted; other attempts are not counted.</p>
                </div>
              )}
            </section>
          )}

          <DailyChecklist
            today={today}
            loading={todayLoading}
            error={todayError}
            saving={goalSaving}
            saveError={goalError}
            onRetry={() => fetchToday()}
            onToggle={(id, done) => setManualGoal(id, done)}
            practiceTime={practiceTime}
            className={card}
            headingClass={sectionHeading}
          />

          {/* Recommended Algorithms: implemented, not yet completed, in the learning order of the algorithm list */}
          <section aria-labelledby="recommended-heading" className={`${card} p-5 space-y-3`}>
            <div className="space-y-1">
              <h2 id="recommended-heading" className={sectionHeading}>
                <Compass className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Recommended algorithms
              </h2>
              <p className="text-[11px] text-slate-400" data-testid="recommendations-basis">
                The next algorithms in the course order that you have not completed, skipping the one you are continuing.
              </p>
            </div>
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
        </aside>
      </div>
    </div>
  );
};
