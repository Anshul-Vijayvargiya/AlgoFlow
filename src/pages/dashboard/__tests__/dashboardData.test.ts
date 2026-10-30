import { describe, it, expect } from 'vitest';
import type { AlgorithmTrack } from '../../../api';
import { ALGORITHM_NAV } from '../../../data/algorithmMetadata';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import { continueLearning, difficultySummary, lastActiveText, recommendAlgorithms, submissionsText, walkthroughsText, weeklySummary } from '../dashboardData';

const track = (algorithmId: string, status: AlgorithmTrack['status'], lastActivityAt: string): AlgorithmTrack => ({
  algorithmId,
  status,
  lastActivityAt,
  stepsCompleted: 3,
  totalSteps: 10,
  lastStepIndex: 2,
  executionCount: 1,
});

describe('continue learning', () => {
  it('is the most recently active algorithm still in progress', () => {
    const tracks = [
      track('bubble-sort', 'in_progress', '2026-10-18T10:00:00Z'),
      track('quick-sort', 'in_progress', '2026-10-20T09:00:00Z'),
      track('merge-sort', 'completed', '2026-10-20T12:00:00Z'),
    ];
    // with its category; no step count (only milestone steps are recorded, so it would understate the progress)
    // Quick Sort is milestone m8 of the sorting path; Bubble Sort (in progress) and Merge Sort (completed) are explored there
    expect(continueLearning(tracks)).toEqual({
      id: 'quick-sort',
      name: 'Quick Sort',
      categoryLabel: 'SORTING',
      lastActivityAt: '2026-10-20T09:00:00Z',
      path: { title: 'Track 2: Core Sorting Algorithms', level: 'Intermediate', estimatedMinutes: 35, explored: 3, available: 5 },
    });
  });

  it('is nothing when no algorithm is in progress, or only unimplemented ones are', () => {
    expect(continueLearning([])).toBeNull();
    expect(continueLearning([track('bubble-sort', 'completed', '2026-10-20T00:00:00Z'), track('heap-sort', 'not_started', '2026-10-20T00:00:00Z')])).toBeNull();
    expect(continueLearning([track('detect-cycle', 'in_progress', '2026-10-20T00:00:00Z'), track('no-such-algo', 'in_progress', '2026-10-20T00:00:00Z')])).toBeNull();
  });
});

describe('recommended algorithms', () => {
  it('come from the registry: implemented algorithms in learning order, each with its own id, name, category and complexity', () => {
    const recs = recommendAlgorithms([], null);
    const implemented = ALGORITHM_NAV.filter(a => a.implemented).map(a => a.id);
    expect(recs.map(r => r.id)).toEqual(implemented.slice(0, 4));
    for (const r of recs) {
      const def = getAlgorithmDefinition(r.id)!;
      expect(r).toEqual({ id: def.id, name: def.name, categoryLabel: expect.any(String), complexity: def.complexity.average });
    }
    expect(new Set(recs.map(r => r.id)).size).toBe(recs.length);
  });

  it('skip completed algorithms and the one offered under Continue learning', () => {
    const tracks = [track('bubble-sort', 'completed', '2026-10-20T00:00:00Z')];
    const recs = recommendAlgorithms(tracks, 'selection-sort');
    expect(recs.map(r => r.id)).not.toContain('bubble-sort');
    expect(recs.map(r => r.id)).not.toContain('selection-sort');
    expect(recs).toHaveLength(4);
  });

  it('are empty once every implemented algorithm is completed', () => {
    const all = ALGORITHM_NAV.filter(a => a.implemented).map(a => track(a.id, 'completed', '2026-10-20T00:00:00Z'));
    expect(recommendAlgorithms(all, null)).toEqual([]);
  });

  it('never carry an invented difficulty (algorithms have none in the app)', () => {
    for (const r of recommendAlgorithms([], null, 50)) expect(r).not.toHaveProperty('difficulty');
  });
});

describe('weekly activity', () => {
  it('per day: practice submissions and visualizer walkthroughs, with date labels, totals and a text summary', () => {
    const s = weeklySummary([
      { day: 'Mon', date: '2026-10-19', minutes: 10, steps: 0, submissions: 2, walkthroughs: 0 },
      { day: 'Tue', date: '2026-10-20', minutes: 0, steps: 0, submissions: 0, walkthroughs: 0 },
      { day: 'Wed', date: '2026-10-21', minutes: 0, steps: 15, submissions: 1, walkthroughs: 3 },
    ]);
    expect(s.days).toEqual([
      { label: 'Mon 19', fullLabel: 'Monday 19 Oct', submissions: 2, walkthroughs: 0 },
      { label: 'Tue 20', fullLabel: 'Tuesday 20 Oct', submissions: 0, walkthroughs: 0 },
      { label: 'Wed 21', fullLabel: 'Wednesday 21 Oct', submissions: 1, walkthroughs: 3 },
    ]);
    expect(s).toMatchObject({ activeDays: 2, hasActivity: true, totals: { submissions: 3, walkthroughs: 3 } });
    expect(s.description).toBe(
      'Activity per day (UTC): Monday 19 Oct: 2 practice submissions, 0 visualizer walkthroughs; Tuesday 20 Oct: 0 practice submissions, 0 visualizer walkthroughs; ' +
        'Wednesday 21 Oct: 1 practice submission, 3 visualizer walkthroughs. In total: 3 practice submissions and 3 visualizer walkthroughs.'
    );
  });

  it('estimated minutes and raw steps alone are not activity (only the counted records are)', () => {
    // e.g. minutes left by a judging failure before it stopped earning credit
    const s = weeklySummary([{ day: 'Mon', date: '2026-10-19', minutes: 5, steps: 12, submissions: 0, walkthroughs: 0 }]);
    expect(s).toMatchObject({ activeDays: 0, hasActivity: false, totals: { submissions: 0, walkthroughs: 0 } });
  });

  it('a response without the counts (an older server) shows no activity rather than guessing; no date falls back to the day name', () => {
    const s = weeklySummary([{ day: 'Mon', minutes: 30, steps: 4 }]);
    expect(s.days).toEqual([{ label: 'Mon', fullLabel: 'Mon', submissions: 0, walkthroughs: 0 }]);
    expect(s.hasActivity).toBe(false);
  });

  it('dates are the server\'s UTC days, labelled the same in every time zone', () => {
    const s = weeklySummary([{ day: 'Sun', date: '2026-11-01', minutes: 0, steps: 0, submissions: 1, walkthroughs: 0 }]);
    expect(s.days[0]).toMatchObject({ label: 'Sun 1', fullLabel: 'Sunday 1 Nov' });
  });

  it('is empty for no data', () => {
    expect(weeklySummary(undefined)).toMatchObject({ days: [], activeDays: 0, hasActivity: false, description: 'No activity has been recorded.' });
  });

  it('counts are written in words, singular and plural', () => {
    expect(submissionsText(1)).toBe('1 practice submission');
    expect(submissionsText(0)).toBe('0 practice submissions');
    expect(walkthroughsText(1)).toBe('1 visualizer walkthrough');
    expect(walkthroughsText(4)).toBe('4 visualizer walkthroughs');
  });
});

describe('solved by difficulty', () => {
  it('reports each level, the total and a text summary', () => {
    const s = difficultySummary([
      { name: 'Easy', value: 3, color: '#10B981' },
      { name: 'Hard', value: 1, color: '#F43F5E' },
    ]);
    expect(s.items.map(i => [i.name, i.value])).toEqual([['Easy', 3], ['Medium', 0], ['Hard', 1]]);
    expect(s.total).toBe(4);
    expect(s.hasSolved).toBe(true);
    expect(s.description).toBe('Solved problems by difficulty: Easy 3, Medium 0, Hard 1 (4 in total).');
  });

  it('is empty when nothing is solved', () => {
    expect(difficultySummary(undefined)).toMatchObject({ total: 0, hasSolved: false, description: 'No practice problems have been solved yet.' });
  });
});

describe('last active text', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  it('is relative for the last week and a date after that', () => {
    expect(lastActiveText('2026-10-20T08:00:00Z', now)).toBe('today');
    expect(lastActiveText('2026-10-19T08:00:00Z', now)).toBe('yesterday');
    expect(lastActiveText('2026-10-16T08:00:00Z', now)).toBe('4 days ago');
    expect(lastActiveText('2026-09-01T08:00:00Z', now)).toMatch(/1|Sep/);
    expect(lastActiveText('not a date', now)).toBe('recently');
  });
});
