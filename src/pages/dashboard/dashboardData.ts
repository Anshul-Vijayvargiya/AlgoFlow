/**
 * What the Dashboard shows, derived only from data the app really has: the progress API (UserProgressData and the
 * per-algorithm tracks) and the algorithm registry. Nothing here invents activity, time or difficulty.
 */
import type { AlgorithmTrack, RecentActivityEvent, TodayProgress, UserProgressData } from '../../api';
import type { AlgorithmId } from '../../types/algorithm';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { dailyGoalStatuses, type DailyGoalStatus } from '../../data/dailyGoals';
import { verdictOf, type VerdictTone } from '../practice/verdicts';
import { LEARNING_TRACKS, trackSummary, type LearningTrack } from '../learning/learningPaths';

const categoryLabel = (id: string) => ALGORITHM_CATEGORIES.find(c => c.id === id)?.label ?? id;

export interface ContinueItem {
  id: AlgorithmId;
  name: string;
  categoryLabel: string;
  /** when the track was last active (ISO string from the server) */
  lastActivityAt: string;
  /** the learning path this algorithm is a milestone of, if any (src/pages/learning/learningPaths.ts) */
  path: ContinuePath | null;
}

export interface ContinuePath {
  title: string;
  /** the path's level (algorithms themselves have no difficulty rating) */
  level: LearningTrack['level'];
  /** the milestone's authored estimate, not a measurement */
  estimatedMinutes: number;
  /** the path's milestones explored in the visualizer, from the progress tracks */
  explored: number;
  available: number;
}

/**
 * The algorithm to continue: the most recently active track that is still in progress and is implemented in the
 * visualizer. The visualizer does not restore a step, so only the algorithm is offered, never a step; and no step count
 * is shown, because only a few milestone steps of a trace are recorded (src/progress/visualizerActivity.ts).
 */
export function continueLearning(tracks: readonly AlgorithmTrack[]): ContinueItem | null {
  const candidates = tracks
    .filter(t => t.status === 'in_progress' && getAlgorithmDefinition(t.algorithmId as AlgorithmId))
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  const t = candidates[0];
  if (!t) return null;
  const def = getAlgorithmDefinition(t.algorithmId as AlgorithmId)!;
  return {
    id: def.id,
    name: def.name,
    categoryLabel: categoryLabel(def.category),
    lastActivityAt: t.lastActivityAt,
    path: pathOf(def.id, tracks),
  };
}

/** the first learning path that has the algorithm as a milestone, with the user's real progress through it */
function pathOf(algorithmId: string, tracks: readonly AlgorithmTrack[]): ContinuePath | null {
  for (const track of LEARNING_TRACKS) {
    const milestone = track.milestones.find(m => m.algorithmId === algorithmId);
    if (!milestone) continue;
    const { explored, available } = trackSummary(track, tracks);
    return { title: track.title, level: track.level, estimatedMinutes: milestone.estimatedMinutes, explored, available };
  }
  return null;
}

export interface Recommendation {
  id: AlgorithmId;
  name: string;
  categoryLabel: string;
  /** average time complexity from the algorithm's definition */
  complexity: string;
}

/**
 * Implemented algorithms the user has not completed, in the learning order of the algorithm list, skipping the one
 * offered under "Continue learning". Algorithms have no difficulty rating anywhere in the app, so none is shown.
 */
export function recommendAlgorithms(tracks: readonly AlgorithmTrack[], exclude: AlgorithmId | null, limit = 4): Recommendation[] {
  const completed = new Set(tracks.filter(t => t.status === 'completed').map(t => t.algorithmId));
  return ALGORITHM_NAV.filter(a => a.implemented && !completed.has(a.id) && a.id !== exclude)
    .map(a => getAlgorithmDefinition(a.id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .slice(0, limit)
    .map(d => ({ id: d.id, name: d.name, categoryLabel: categoryLabel(d.category), complexity: d.complexity.average }));
}

/**
 * Today's logged minutes against the account's daily goal. The server's weekly activity ends with today (UTC), so
 * today is its last day. Minutes are estimates (see weeklySummary), and the panel says so.
 */
export function dailyGoalSummary(weekly: UserProgressData['weeklyActivity'] | undefined, goalMinutes: number | undefined) {
  if (!goalMinutes || !Number.isFinite(goalMinutes) || goalMinutes <= 0) return null;
  const today = Math.max(0, weekly?.length ? weekly[weekly.length - 1].minutes || 0 : 0);
  return {
    today,
    goal: goalMinutes,
    percent: Math.min(100, Math.round((today / goalMinutes) * 100)),
    met: today >= goalMinutes,
  };
}

export interface WeeklyDay {
  /** short axis label, e.g. "Wed 21" */
  label: string;
  /** full date for the tooltip and screen readers, e.g. "Wednesday 21 Oct" */
  fullLabel: string;
  /** practice submissions made that day (judging failures are not counted) */
  submissions: number;
  /** algorithms stepped through in the visualizer that day, each once */
  walkthroughs: number;
}

export interface WeeklySummary {
  days: WeeklyDay[];
  /** days in the last 7 with at least one submission or walkthrough */
  activeDays: number;
  hasActivity: boolean;
  totals: { submissions: number; walkthroughs: number };
  /** screen-reader text listing every day */
  description: string;
}

// the server's days are UTC dates, so they are formatted in UTC (formatting in local time could show the wrong day)
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const FULL_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const submissionsText = (n: number) => count(n, 'practice submission', 'practice submissions');
export const walkthroughsText = (n: number) => count(n, 'visualizer walkthrough', 'visualizer walkthroughs');

/**
 * Weekly activity as recorded by the server: per day, the practice submissions made and the algorithms stepped
 * through in the visualizer. Both are counts of real records; the estimated minutes are not used here.
 */
export function weeklySummary(weekly: UserProgressData['weeklyActivity'] | undefined): WeeklySummary {
  const days: WeeklyDay[] = (weekly ?? []).map(d => {
    const date = d.date ? new Date(`${d.date}T00:00:00.000Z`) : null;
    const valid = date !== null && !Number.isNaN(date.getTime());
    return {
      label: valid ? SHORT_DAY.format(date) : d.day,
      fullLabel: valid ? FULL_DAY.format(date) : d.day,
      submissions: Math.max(0, d.submissions ?? 0),
      walkthroughs: Math.max(0, d.walkthroughs ?? 0),
    };
  });
  const active = days.filter(d => d.submissions > 0 || d.walkthroughs > 0);
  const totals = {
    submissions: days.reduce((n, d) => n + d.submissions, 0),
    walkthroughs: days.reduce((n, d) => n + d.walkthroughs, 0),
  };
  return {
    days,
    activeDays: active.length,
    hasActivity: active.length > 0,
    totals,
    description: days.length
      ? `Activity per day (UTC): ${days.map(d => `${d.fullLabel}: ${submissionsText(d.submissions)}, ${walkthroughsText(d.walkthroughs)}`).join('; ')}. ` +
        `In total: ${submissionsText(totals.submissions)} and ${walkthroughsText(totals.walkthroughs)}.`
      : 'No activity has been recorded.',
  };
}

export interface DifficultySummary {
  total: number;
  hasSolved: boolean;
  items: { name: 'Easy' | 'Medium' | 'Hard'; value: number; color: string }[];
  description: string;
}

/** Solved practice problems by difficulty (practice problems do carry a difficulty, unlike algorithms). */
export function difficultySummary(dist: UserProgressData['difficultyDistribution'] | undefined): DifficultySummary {
  const items = (['Easy', 'Medium', 'Hard'] as const).map(name => {
    const d = dist?.find(x => x.name === name);
    return { name, value: d?.value ?? 0, color: d?.color ?? '' };
  });
  const total = items.reduce((s, i) => s + i.value, 0);
  return {
    total,
    hasSolved: total > 0,
    items,
    description: total
      ? `Solved problems by difficulty: ${items.map(i => `${i.name} ${i.value}`).join(', ')} (${total} in total).`
      : 'No practice problems have been solved yet.',
  };
}

/** "today", "yesterday", "3 days ago" or a date, for "last active" text */
export function lastActiveText(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'recently';
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** a greeting for the local time of day */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export interface StreakView {
  current: number;
  longest: number;
  /** e.g. "3 Days" */
  value: string;
  /** what the number means right now */
  note: string;
}

/**
 * The streak as the server computed it (UTC days with recorded activity). A missed day ends the current streak but
 * not the record of the best one, which is shown so a reset never looks like lost history.
 */
export function streakView(progress: Pick<UserProgressData, 'streakDays' | 'longestStreakDays'>): StreakView {
  const current = Math.max(0, progress.streakDays || 0);
  const longest = Math.max(current, progress.longestStreakDays ?? 0);
  const value = `${current} ${current === 1 ? 'Day' : 'Days'}`;
  if (current > 0) return { current, longest, value, note: `Best: ${count(longest, 'day', 'days')}` };
  if (longest > 0) return { current, longest, value, note: `Best: ${count(longest, 'day', 'days')} · any activity today starts a new streak` };
  return { current, longest, value, note: 'Step through an algorithm or submit a solution to start one' };
}

export interface ChecklistSummary {
  goals: DailyGoalStatus[];
  done: number;
  total: number;
  percent: number;
  allDone: boolean;
  /** "2 of 4 goals complete" */
  text: string;
}

export function checklistSummary(today: TodayProgress): ChecklistSummary {
  const goals = dailyGoalStatuses(today.verified, today.manualCompleted);
  const done = goals.filter(g => g.done).length;
  return {
    goals,
    done,
    total: goals.length,
    percent: goals.length ? Math.round((done / goals.length) * 100) : 0,
    allDone: goals.length > 0 && done === goals.length,
    text: `${done} of ${goals.length} goals complete`,
  };
}

/** when the checklist resets, in the viewer's own time: "Resets at 00:00 UTC (5:30 am your time)" */
export function resetText(resetsAt: string, timeZone?: string): string {
  const t = new Date(resetsAt);
  if (Number.isNaN(t.getTime())) return 'Resets daily at 00:00 UTC';
  const local = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(t);
  return `Resets at 00:00 UTC (${local} your time)`;
}

export interface RecentEventView {
  id: string;
  kind: RecentActivityEvent['kind'];
  title: string;
  typeLabel: string;
  statusLabel: string;
  tone: VerdictTone;
  at: string;
  /** a date and time in the viewer's time zone */
  when: string;
  /** where the event can be continued: a practice problem, or an algorithm to open in the visualizer */
  link: { to: string; algorithmId?: AlgorithmId } | null;
}

export function recentEventView(e: RecentActivityEvent, timeZone?: string): RecentEventView {
  const t = new Date(e.at);
  const when = Number.isNaN(t.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(t);
  if (e.kind === 'submission') {
    const v = verdictOf(e.status);
    return {
      id: e.id,
      kind: e.kind,
      title: e.title,
      typeLabel: 'Practice submission',
      statusLabel: v.label,
      tone: v.tone,
      at: e.at,
      when,
      link: e.targetId ? { to: `/practice?problem=${encodeURIComponent(e.targetId)}` } : null,
    };
  }
  const def = getAlgorithmDefinition(e.targetId as AlgorithmId);
  return {
    id: e.id,
    kind: e.kind,
    title: def?.name ?? e.title,
    typeLabel: 'Visualizer walkthrough',
    // only milestone steps are recorded, so the step number would understate how far the learner went: none is shown
    statusLabel: 'Stepped through',
    tone: 'neutral',
    at: e.at,
    // a date-only record (no time kept) shows only its date
    when,
    link: def ? { to: '/visualizer', algorithmId: def.id } : null,
  };
}
