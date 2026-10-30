/**
 * The daily learning checklist and the activity streak. Shared by the server (which runs from the repository with tsx)
 * and the client, so both agree on the goals, on what completes them and on how days are counted.
 *
 * Days are UTC calendar days (YYYY-MM-DD), the same days the activity log, the weekly chart and the execution quota use:
 * one consistent reset at 00:00 UTC for every user, whatever their time zone. Past days are never deleted, so a missed
 * day ends the current streak without erasing any history (the longest streak still counts it).
 */

export type DailyGoalKind = 'verified' | 'manual';

export interface DailyGoalDefinition {
  id: string;
  label: string;
  kind: DailyGoalKind;
  /** how the goal is completed, shown under it */
  hint: string;
}

/** what the server counted today (UTC) from its own records */
export interface VerifiedActivityToday {
  /** algorithms stepped through in the visualizer (each once a day) */
  walkthroughs: number;
  /** practice submissions (judging failures excluded) */
  submissions: number;
  /** submissions accepted by the judge */
  accepted: number;
}

export const DAILY_GOALS: readonly DailyGoalDefinition[] = [
  { id: 'visualize', label: 'Step through an algorithm in the visualizer', kind: 'verified', hint: 'Checked automatically when you step past the first step of a trace.' },
  { id: 'submit', label: 'Submit a practice solution', kind: 'verified', hint: 'Checked automatically when a submission is recorded.' },
  { id: 'solve', label: 'Get a practice solution accepted', kind: 'verified', hint: 'Checked automatically when the judge accepts a submission.' },
  { id: 'review', label: 'Review an algorithm you found hard', kind: 'manual', hint: 'Your own check: tick it when you have done it.' },
];

export const MANUAL_GOAL_IDS: readonly string[] = DAILY_GOALS.filter(g => g.kind === 'manual').map(g => g.id);

export const isManualGoal = (id: unknown): id is string => typeof id === 'string' && MANUAL_GOAL_IDS.includes(id);

const VERIFIED_RULES: Record<string, (a: VerifiedActivityToday) => boolean> = {
  visualize: a => a.walkthroughs > 0,
  submit: a => a.submissions > 0,
  solve: a => a.accepted > 0,
};

export interface DailyGoalStatus extends DailyGoalDefinition {
  done: boolean;
}

/** every goal with whether it is done: verified goals from the counted activity, manual ones from the user's ticks */
export function dailyGoalStatuses(activity: VerifiedActivityToday, manualDone: readonly string[]): DailyGoalStatus[] {
  return DAILY_GOALS.map(g => ({ ...g, done: g.kind === 'verified' ? VERIFIED_RULES[g.id](activity) : manualDone.includes(g.id) }));
}

/** the UTC calendar day of an instant, YYYY-MM-DD */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

/** the start of the next UTC day: when today's checklist resets */
export function nextUtcMidnight(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
}

/** a real calendar day written YYYY-MM-DD (anything else is ignored rather than looped over) */
const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00.000Z`));

/** the UTC day before a YYYY-MM-DD day */
function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDay(d);
}

/**
 * The current streak: consecutive active days ending today, or ending yesterday (today is not over, so a streak is
 * kept until a whole day passes without activity). 0 once a day was missed.
 */
export function currentStreak(activeDays: Iterable<string>, today: string): number {
  const days = new Set([...activeDays].filter(isDay));
  let day = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

/** the longest run of consecutive active days ever recorded */
export function longestStreak(activeDays: Iterable<string>): number {
  const days = new Set([...activeDays].filter(isDay));
  let longest = 0;
  for (const day of days) {
    if (days.has(previousDay(day))) continue; // not the first day of a run
    let length = 1;
    const next = new Date(`${day}T00:00:00.000Z`);
    for (;;) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (!days.has(utcDay(next))) break;
      length++;
    }
    longest = Math.max(longest, length);
  }
  return longest;
}
