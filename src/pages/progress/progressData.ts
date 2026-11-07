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
/** a topic name up to this many characters stays on one line on the radar (every topic up to "Bit Manipulation") */
export const RADAR_LABEL_LINE_CHARS = 16;
/** the smallest radius the radar is drawn with, and the tick length between a vertex and its name (recharts' default) */
const RADAR_MIN_RADIUS = 40;
const RADAR_TICK_PX = 8;
/**
 * the width of one character of an 11px label for deciding where to wrap: the widest measured (WebKit, about 5.2px for
 * "Bit Manipulation") with a margin. The radius above keeps the rounder 6.5px, as before. With it, a 16-character name
 * stays on one line on charts from about 272px wide (a 360px phone's is about 278px in every browser).
 */
const WRAP_CHAR_PX = 5.5;

/**
 * How many characters a line of a topic name may have on a radar this wide: 16 while that fits beside a side vertex at
 * the smallest radius (390px and 360px phones included), fewer on narrower charts (a 320px phone), never under 8.
 * Before the chart is measured: 16.
 */
export function radarLineChars(width: number): number {
  if (!(width > 0)) return RADAR_LABEL_LINE_CHARS;
  const fits = Math.floor((width / 2 - RADAR_MIN_RADIUS - RADAR_TICK_PX) / WRAP_CHAR_PX);
  return Math.max(8, Math.min(RADAR_LABEL_LINE_CHARS, fits));
}

/**
 * A topic name as the radar draws it: one line when it is short enough, otherwise two lines split at the space that
 * makes the longer line as short as possible ("Heap & Priority Queue" → "Heap &" / "Priority Queue"). A name with no
 * space stays whole.
 */
export function wrapRadarLabel(label: string, lineChars: number = RADAR_LABEL_LINE_CHARS): string[] {
  if (label.length <= lineChars) return [label];
  let best: string[] = [label];
  for (let k = label.indexOf(' '); k !== -1; k = label.indexOf(' ', k + 1)) {
    const lines = [label.slice(0, k), label.slice(k + 1)];
    if (Math.max(...lines.map(l => l.length)) < Math.max(...best.map(l => l.length))) best = lines;
  }
  return best;
}

/**
 * The topic radar's outer radius for a chart of this size: the default share of the smaller side, reduced on narrow
 * screens so the longest line of a topic name (as wrapRadarLabel draws it) still fits beside the left and right
 * vertices (it is drawn outside the radius).
 */
export function radarOuterRadius(width: number, height: number, labels: readonly string[], lineChars: number = RADAR_LABEL_LINE_CHARS): number | string {
  if (!(width > 0 && height > 0)) return `${RADAR_RADIUS_SHARE * 100}%`;
  const preferred = (RADAR_RADIUS_SHARE * Math.min(width, height)) / 2;
  const longestLine = Math.max(0, ...labels.flatMap(l => wrapRadarLabel(l, lineChars).map(line => line.length)));
  const labelRoom = longestLine * LABEL_CHAR_PX + LABEL_GAP_PX;
  return Math.max(RADAR_MIN_RADIUS, Math.min(preferred, width / 2 - labelRoom));
}
