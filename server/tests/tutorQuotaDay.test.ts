import { describe, it, expect } from 'vitest';
import { tutorQuotaDay } from '../services/tutor/quotaDay';
import { utcDay } from '../services/execution/quota';

// The AI Tutor's daily counters follow Google's quota day (midnight Pacific Time), including daylight saving.
const day = (iso: string) => tutorQuotaDay(new Date(iso));

describe('AI Tutor quota day (Pacific Time)', () => {
  it('winter (PST, UTC-8): the day changes at 08:00 UTC', () => {
    expect(day('2026-01-15T07:59:59.999Z')).toBe('2026-01-14');
    expect(day('2026-01-15T08:00:00.000Z')).toBe('2026-01-15');
  });

  it('summer (PDT, UTC-7): the day changes at 07:00 UTC', () => {
    expect(day('2026-07-01T06:59:59.999Z')).toBe('2026-06-30');
    expect(day('2026-07-01T07:00:00.000Z')).toBe('2026-07-01');
  });

  it('the day daylight saving starts (8 March 2026, 02:00 PST → 03:00 PDT) begins at 08:00 UTC and lasts 23 hours', () => {
    expect(day('2026-03-08T07:59:59.999Z')).toBe('2026-03-07');
    expect(day('2026-03-08T08:00:00.000Z')).toBe('2026-03-08');
    expect(day('2026-03-09T06:59:59.999Z')).toBe('2026-03-08');
    expect(day('2026-03-09T07:00:00.000Z')).toBe('2026-03-09');
  });

  it('the day daylight saving ends (1 November 2026, 02:00 PDT → 01:00 PST) begins at 07:00 UTC and lasts 25 hours', () => {
    expect(day('2026-11-01T06:59:59.999Z')).toBe('2026-10-31');
    expect(day('2026-11-01T07:00:00.000Z')).toBe('2026-11-01');
    expect(day('2026-11-02T07:59:59.999Z')).toBe('2026-11-01');
    expect(day('2026-11-02T08:00:00.000Z')).toBe('2026-11-02');
  });

  it('UTC midnight does not start a new tutor day, so the global cap cannot be spent twice in one Google day', () => {
    const before = new Date('2026-10-21T23:59:00.000Z');
    const after = new Date('2026-10-22T00:01:00.000Z');
    expect(utcDay(before)).not.toBe(utcDay(after));
    expect(tutorQuotaDay(before)).toBe(tutorQuotaDay(after));
    expect(tutorQuotaDay(after)).toBe('2026-10-21');
  });

  it('every instant of one Pacific day maps to the same key, and the next instant to the next day', () => {
    // 21 October 2026 (PDT) runs from 07:00 UTC on the 21st to 06:59:59.999 UTC on the 22nd
    const start = Date.parse('2026-10-21T07:00:00.000Z');
    for (let min = 0; min < 24 * 60; min += 7) expect(tutorQuotaDay(new Date(start + min * 60_000))).toBe('2026-10-21');
    expect(tutorQuotaDay(new Date(start + 24 * 3_600_000 - 1))).toBe('2026-10-21');
    expect(tutorQuotaDay(new Date(start + 24 * 3_600_000))).toBe('2026-10-22');
  });
});
