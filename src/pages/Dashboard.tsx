import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Play, Code2, Flame, BookOpen, ArrowRight, CheckCircle2, AlertTriangle, RotateCcw, Info, Route, ListChecks, Gauge, Clock } from 'lucide-react';

import { isMockApi } from '../api';
import { useProgressStore } from '../store/useProgressStore';
import { RECENT_ACTIVITY_LIMIT, RECENT_ACTIVITY_MAX } from '../progress/recentActivityLimits';
import { useAuthStore } from '../store/useAuthStore';
import { useVisualizerStore } from '../store/useVisualizerStore';
import { checklistSummary, continueLearning, difficultySummary, greeting, lastActiveText, streakView } from './dashboard/dashboardData';
import { DifficultyBadge } from './dashboard/DifficultyBadge';
import { DailyChecklist } from './dashboard/DailyChecklist';
import { RecentActivity } from './dashboard/RecentActivity';

const card = 'bg-surface border border-cyan-500/15 rounded-2xl shadow-xl';
const sectionHeading = 'text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2';
const statCard = `${card} p-4 flex flex-col gap-2.5 min-w-0`;
const statIcon = 'w-9 h-9 rounded-xl border flex items-center justify-center shrink-0';

/** A grey placeholder shape while data loads (no numbers are shown until they are real) */
const Skeleton: React.FC<{ className: string }> = ({ className }) => (
  <div aria-hidden="true" className={`rounded-lg bg-slate-800/70 motion-safe:animate-pulse ${className}`} />
);

/** a laptop with a few lines of code, drawn inline (no image request); decorative only, colours follow the theme */
const CodingArt: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 240 150" className="hidden md:block w-56 lg:w-64 h-auto shrink-0 pointer-events-none" data-testid="welcome-art">
    <ellipse cx="120" cy="140" rx="104" ry="7" className="fill-cyan-500/10" />
    <rect x="34" y="10" width="172" height="110" rx="10" className="fill-slate-900 stroke-cyan-400/40" strokeWidth="2" />
    <rect x="44" y="20" width="152" height="90" rx="5" className="fill-cyan-500/5" />
    {/* code lines: keyword, call, string and comment colours of the code panel */}
    <rect x="54" y="32" width="26" height="6" rx="3" className="fill-purple-400/70" />
    <rect x="84" y="32" width="48" height="6" rx="3" className="fill-cyan-300/70" />
    <rect x="64" y="46" width="34" height="6" rx="3" className="fill-blue-400/70" />
    <rect x="102" y="46" width="56" height="6" rx="3" className="fill-emerald-400/60" />
    <rect x="64" y="60" width="22" height="6" rx="3" className="fill-purple-400/70" />
    <rect x="90" y="60" width="40" height="6" rx="3" className="fill-cyan-300/70" />
    <rect x="74" y="74" width="62" height="6" rx="3" className="fill-slate-500/60" />
    <rect x="54" y="88" width="14" height="6" rx="3" className="fill-purple-400/70" />
    {/* a small bar chart: the visualizer */}
    <rect x="160" y="84" width="7" height="16" rx="2" className="fill-cyan-400/60" />
    <rect x="170" y="74" width="7" height="26" rx="2" className="fill-purple-400/60" />
    <rect x="180" y="64" width="7" height="36" rx="2" className="fill-cyan-400/60" />
    <path d="M18 122 H222 L210 134 H30 Z" className="fill-slate-800 stroke-cyan-400/30" strokeWidth="1.5" />
    <rect x="100" y="124" width="40" height="4" rx="2" className="fill-slate-600" />
  </svg>
);

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The dashboard, in reading order: welcome (greeting, streak, today's goals, algorithms explored, the two ways in) ·
 * continue learning with three progress cards beside today's goals (one column below lg) · recent activity across the
 * full width. Every number comes from the signed-in user's own records (the progress API); nothing is invented.
 */
export const Dashboard: React.FC = () => {
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
  const userName = useAuthStore(s => s.user?.name);
  const setAlgorithm = useVisualizerStore(s => s.setAlgorithm);
  // the greeting follows the local time when the page opened
  const [hour] = React.useState(() => new Date().getHours());
  // "View all" in recent activity: the most events the server returns
  const [allActivity, setAllActivity] = React.useState(false);

  React.useEffect(() => {
    fetchProgress();
    fetchToday();
    fetchRecent();
  }, [fetchProgress, fetchToday, fetchRecent]);

  // the first load has not finished (or not started): show placeholders, never numbers
  const status: 'loading' | 'error' | 'ready' = progress ? 'ready' : error ? 'error' : 'loading';
  const refreshFailed = Boolean(progress && error);

  const resume = continueLearning(tracks);
  const difficulty = difficultySummary(progress?.difficultyDistribution);
  const streak = progress ? streakView(progress) : null;
  const goals = today ? checklistSummary(today) : null;
  const firstName = userName?.trim().split(/\s+/)[0];
  const totals = progress?.algorithmTotals;
  // stepped through in the visualizer: the server's totals, or the older count from a server without them
  const explored = progress ? (totals?.practised ?? progress.algorithmsLearned) : null;

  const toggleAllActivity = async () => {
    if (allActivity) {
      setAllActivity(false);
      return;
    }
    // listed only if loading them worked (otherwise the first events stay, with a note)
    if (await fetchRecent(RECENT_ACTIVITY_MAX)) setAllActivity(true);
  };

  const welcomeChip = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border';

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-6 space-y-5 max-w-7xl mx-auto overflow-x-hidden">
      {/* 1. Welcome: the greeting, today at a glance, and the two ways to learn */}
      <div data-testid="dashboard-welcome" className="relative rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-purple-950/30 border border-cyan-500/20 px-5 py-5 md:px-7 md:py-6 overflow-hidden shadow-xl">
        <div className="relative z-10 flex items-center justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="space-y-1.5">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink font-sans">
                {greeting(hour)}
                {firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-sm text-slate-300">Ready to master DSA? Continue where you left off or start a new practice.</p>
            </div>
            <ul className="flex flex-wrap gap-2 text-[11px] font-mono" aria-label="Today at a glance" data-testid="welcome-summary">
              <li data-testid="welcome-streak" className={`${welcomeChip} border-orange-400/40 bg-orange-500/10 text-orange-300`}>
                <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                {streak ? `${streak.value} streak` : status === 'error' ? 'Streak unavailable' : 'Loading streak…'}
              </li>
              <li data-testid="welcome-goals" className={`${welcomeChip} border-cyan-500/40 bg-cyan-500/10 text-cyan-300`}>
                <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
                {goals ? `Today: ${goals.text}` : todayError ? "Today's goals unavailable" : "Loading today's goals…"}
              </li>
              <li data-testid="welcome-explored" className={`${welcomeChip} border-purple-400/40 bg-purple-500/10 text-purple-300`}>
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                {explored !== null ? `${count(explored, 'algorithm', 'algorithms')} explored` : status === 'error' ? 'Explored count unavailable' : 'Loading algorithms explored…'}
              </li>
            </ul>
            {isMockApi && (
              <p data-testid="demo-badge" className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-mono">
                <Info className="w-3 h-3" aria-hidden="true" />
                Demo mode: progress is kept in this browser, not on a server
              </p>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              <NavLink
                to="/visualizer"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-sm font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-2 motion-safe:transition-all motion-safe:hover:scale-105"
              >
                <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                Launch Visualizer
              </NavLink>
              <NavLink
                to="/practice"
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-cyan-500/40 text-slate-200 font-mono text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <Code2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Start Practice
              </NavLink>
            </div>
          </div>
          <CodingArt />
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
          <button type="button" onClick={() => fetchProgress()} disabled={isLoading} className="font-mono font-bold underline underline-offset-2 disabled:opacity-50">
            Retry
          </button>
        </div>
      )}

      {/* 2. Main: continue learning and the three cards on the left, today's goals on the right (stacked below lg). Each
          column sizes to its own content, so neither card is stretched into empty space. */}
      <div
        data-testid="dashboard-main"
        className={`grid grid-cols-1 gap-5 items-start ${status === 'error' ? '' : 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'}`}
      >
        {status !== 'error' && (
          <div className="flex flex-col gap-5 min-w-0">
            {/* Continue learning: the most recent algorithm still in progress, from the progress tracks (hidden when the
                tracks failed to load: "nothing in progress" would not be known to be true) */}
            <section aria-labelledby="continue-heading" data-testid="continue-learning" className={`${card} border-cyan-500/25 p-5 space-y-3 min-w-0`}>
              <h2 id="continue-heading" className={sectionHeading}>
                <Route className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Continue learning
              </h2>
              {status === 'loading' ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
              ) : resume ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-xl font-bold text-ink truncate">{resume.name}</p>
                    <ul className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      <li data-testid="continue-topic" className="px-2 py-0.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                        {resume.topic}
                      </li>
                      <li data-testid="continue-complexity" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-purple-400/30 bg-purple-500/10 text-purple-300">
                        <Gauge className="w-3 h-3" aria-hidden="true" />
                        <span className="sr-only">Average time complexity: </span>
                        {resume.complexity}
                      </li>
                      <li data-testid="continue-meta" className="inline-flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        Last active {lastActiveText(resume.lastActivityAt)}
                      </li>
                    </ul>
                  </div>
                  <Link
                    to="/visualizer"
                    onClick={() => setAlgorithm(resume.id)}
                    data-testid="continue-resume"
                    // named with the algorithm, starting with the visible word (a hidden span would be read "Continue : …")
                    aria-label={`Continue: ${resume.name}`}
                    className="self-start sm:self-center shrink-0 px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center gap-2 transition-colors"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-lg font-bold text-ink">Nothing in progress yet</p>
                  <p className="text-xs text-slate-400">Step through an algorithm in the visualizer and it will be waiting for you here.</p>
                </div>
              )}
            </section>

            {/* the three progress cards */}
            <section aria-labelledby="dashboard-stats-heading" className="min-w-0">
              <h2 id="dashboard-stats-heading" className="sr-only">
                Your numbers
              </h2>
              <div data-testid="dashboard-stats" aria-busy={status === 'loading'} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {status === 'loading' || !progress || !streak ? (
                  [0, 1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)
                ) : (
                  <>
                    <div data-stat="Problems Solved" className={statCard}>
                      <div className="flex items-center gap-3">
                        <div className={`${statIcon} border-emerald-400/30 bg-emerald-500/10`}>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-2xl font-bold font-mono text-ink">{progress.solvedCount}</div>
                          <div className="text-xs text-slate-300">Problems Solved</div>
                        </div>
                      </div>
                      {/* solved problems by difficulty: distinct problems with an accepted submission (attempts are not counted) */}
                      <div data-testid="difficulty-distribution">
                        <h3 id="difficulty-heading" className="sr-only">Solved by difficulty</h3>
                        {difficulty.hasSolved ? (
                          <>
                            <p id="difficulty-summary" className="sr-only">{difficulty.description}</p>
                            <ul className="flex flex-wrap gap-1.5" aria-labelledby="difficulty-heading" aria-describedby="difficulty-summary">
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
                          <p data-testid="difficulty-empty" className="text-[11px] text-slate-400">No solved problems yet</p>
                        )}
                      </div>
                    </div>

                    <div data-stat="Algorithms Explored" className={statCard}>
                      <div className="flex items-center gap-3">
                        <div className={`${statIcon} border-cyan-400/30 bg-cyan-500/10`}>
                          <BookOpen className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-2xl font-bold font-mono text-ink">
                            {totals ? `${totals.practised} / ${totals.implemented}` : progress.algorithmsLearned}
                          </div>
                          <div className="text-xs text-slate-300">Algorithms Explored</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400" data-testid="explored-note">
                        {totals ? `${totals.completed} completed in the visualizer` : 'Stepped through in the visualizer'}
                      </p>
                    </div>

                    <div data-stat="Current Streak" className={statCard}>
                      <div className="flex items-center gap-3">
                        <div className={`${statIcon} border-orange-400/30 bg-orange-500/10`}>
                          <Flame className="w-4 h-4 text-orange-400" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-2xl font-bold font-mono text-orange-300">{streak.value}</div>
                          <div className="text-xs text-slate-300">
                            Current Streak
                            {streak.current > 0 && <span aria-hidden="true"> 🔥</span>}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400" data-testid="streak-note">{streak.note}</p>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Today's goals: verified by recorded activity, plus the learner's own manual goal */}
        <DailyChecklist
          today={today}
          loading={todayLoading}
          error={todayError}
          saving={goalSaving}
          saveError={goalError}
          onRetry={() => fetchToday()}
          onToggle={(id, done) => setManualGoal(id, done)}
          className={`${card} min-w-0`}
          headingClass={sectionHeading}
        />
      </div>

      {/* 3. Recent activity across the full width, with times and links back to each problem or algorithm */}
      <RecentActivity
        events={recent}
        loaded={recentLoaded}
        loading={recentLoading}
        error={recentError}
        onRetry={() => fetchRecent()}
        onOpenAlgorithm={id => setAlgorithm(id)}
        pageSize={RECENT_ACTIVITY_LIMIT}
        expanded={allActivity}
        onToggleAll={toggleAllActivity}
        className={`${card} min-w-0 flex flex-col`}
        headingClass={sectionHeading}
      />
    </div>
  );
};
