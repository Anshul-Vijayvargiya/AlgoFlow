/**
 * The day the AI Tutor's daily counters belong to, as YYYY-MM-DD in Pacific Time (America/Los_Angeles, so daylight
 * saving is followed: UTC-8 in winter, UTC-7 in summer). Google's Gemini API daily request limits reset at midnight
 * Pacific; counting by UTC day instead would start a new global allowance at 00:00 UTC, part-way through Google's day,
 * and let up to about twice TUTOR_DAILY_LIMIT_GLOBAL reach Google within one of its days.
 */
const PACIFIC = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });

export function tutorQuotaDay(d = new Date()): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => PACIFIC.formatToParts(d).find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
