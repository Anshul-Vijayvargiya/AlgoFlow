/**
 * What the Dashboard shows, derived only from data the app really has: the progress API (UserProgressData and the
 * per-algorithm tracks) and the algorithm registry. Nothing here invents activity, time or difficulty.
 */
import type { AlgorithmTrack, UserProgressData } from '../../api';
import type { AlgorithmId } from '../../types/algorithm';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';

export interface ContinueItem {
  id: AlgorithmId;
  name: string;
  /** when the track was last active (ISO string from the server) */
  lastActivityAt: string;
}

/**
 * The algorithm to continue: the most recently active track that is still in progress and is implemented in the
 * visualizer. The visualizer does not restore a step, so only the algorithm is offered, never a step.
 */
export function continueLearning(tracks: readonly AlgorithmTrack[]): ContinueItem | null {
  const candidates = tracks
    .filter(t => t.status === 'in_progress' && getAlgorithmDefinition(t.algorithmId as AlgorithmId))
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  const t = candidates[0];
  if (!t) return null;
  return { id: t.algorithmId as AlgorithmId, name: getAlgorithmDefinition(t.algorithmId as AlgorithmId)!.name, lastActivityAt: t.lastActivityAt };
}

export interface Recommendation {
  id: AlgorithmId;
  name: string;
  categoryLabel: string;
  /** average time complexity from the algorithm's definition */
  complexity: string;
}

const categoryLabel = (id: string) => ALGORITHM_CATEGORIES.find(c => c.id === id)?.label ?? id;

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

export interface WeeklySummary {
  /** days in the last 7 with any logged minutes or steps */
  activeDays: number;
  hasActivity: boolean;
  /** screen-reader text listing every day */
  description: string;
}

/**
 * Weekly activity as logged by the server. Minutes are estimates (a practice submission is logged as 5 minutes and
 * visualizer time is not tracked), so no total time is derived from them; the count of active days is exact.
 */
export function weeklySummary(weekly: UserProgressData['weeklyActivity'] | undefined): WeeklySummary {
  const days = weekly ?? [];
  const active = days.filter(d => d.minutes > 0 || d.steps > 0);
  return {
    activeDays: active.length,
    hasActivity: active.length > 0,
    description: days.length
      ? `Minutes logged per day: ${days.map(d => `${d.day} ${d.minutes}`).join(', ')}.`
      : 'No activity has been logged.',
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
