import type { AlgorithmTotals, TopicCoverage, UserProgressData } from '../../api';

/** a whole percentage of part in total (0 when there is nothing to count) */
export const percent = (part: number, total: number) => (total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0);

/** the algorithm counts, or null when the server did not report them (they are then shown as unavailable) */
export function algorithmTotals(progress: UserProgressData | null): AlgorithmTotals | null {
  const t = progress?.algorithmTotals;
  if (!t || ![t.available, t.implemented, t.practised, t.completed].every(n => Number.isFinite(n) && n >= 0)) return null;
  return t;
}

/** visualizer steps recorded per day over the last 7 days (furthest checkpoint per algorithm), as chart data and text */
export function dailyStepsSummary(weekly: UserProgressData['weeklyActivity'] | undefined) {
  const days = (weekly ?? []).map(d => ({ day: d.day, steps: d.steps || 0 }));
  const activeDays = days.filter(d => d.steps > 0).length;
  return {
    days,
    activeDays,
    hasSteps: activeDays > 0,
    description: days.length
      ? `Visualizer steps recorded per day: ${days.map(d => `${d.day} ${d.steps}`).join(', ')}.`
      : 'No visualizer activity has been recorded.',
  };
}

/** topics with implemented algorithms: the share explored (stepped through) in each, as chart data and text */
export function topicCoverageSummary(coverage: TopicCoverage[] | undefined) {
  const topics = (coverage ?? []).filter(t => t.implemented > 0).map(t => ({ ...t, exploredPercent: percent(t.practised, t.implemented) }));
  return {
    topics,
    description: topics.length
      ? `Algorithms explored per topic: ${topics.map(t => `${t.topic} ${t.practised} of ${t.implemented}`).join(', ')}.`
      : 'Topic coverage is not available.',
  };
}

/** the radar's default radius: a share of the chart's smaller side */
const RADAR_RADIUS_SHARE = 0.65;
/** width of one character of an 11px axis label, rounded up, and the gap between the label and its vertex */
const LABEL_CHAR_PX = 6.5;
const LABEL_GAP_PX = 12;

/**
 * The topic radar's outer radius for a chart of this size: the default share of the smaller side, reduced on narrow
 * screens so the longest topic name still fits beside the left and right vertices (it is drawn outside the radius).
 */
export function radarOuterRadius(width: number, height: number, labels: readonly string[]): number | string {
  if (!(width > 0 && height > 0)) return `${RADAR_RADIUS_SHARE * 100}%`;
  const preferred = (RADAR_RADIUS_SHARE * Math.min(width, height)) / 2;
  const labelRoom = Math.max(0, ...labels.map(l => l.length)) * LABEL_CHAR_PX + LABEL_GAP_PX;
  return Math.max(40, Math.min(preferred, width / 2 - labelRoom));
}
