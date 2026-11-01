import { describe, it, expect } from 'vitest';
import type { AlgorithmTrack } from '../../../api';
import { IMPLEMENTED_TOPICS } from '../../../data/algorithmCatalog';
import { topicBreakdown } from '../dashboardData';

// "Your progress by topic": the server's per-topic coverage when it sends it, else the same rule on the user's tracks.
const track = (algorithmId: string, status: AlgorithmTrack['status']): AlgorithmTrack => ({
  algorithmId, status, stepsCompleted: 0, totalSteps: 0, lastStepIndex: 0, executionCount: 0, lastActivityAt: '2026-10-20T10:00:00Z',
});
const byTopic = (rows: ReturnType<typeof topicBreakdown>) => Object.fromEntries(rows.map(r => [r.topic, r]));

describe('topicBreakdown', () => {
  it("uses the server's coverage as sent, with the share explored", () => {
    const rows = topicBreakdown(
      [
        { topic: 'Sorting', implemented: 6, practised: 3, completed: 1 },
        { topic: 'Trees', implemented: 6, practised: 0, completed: 0 },
      ],
      [track('bubble-sort', 'completed')] // ignored: the server already counted
    );
    expect(rows).toEqual([
      { topic: 'Sorting', implemented: 6, explored: 3, completed: 1, percent: 50 },
      { topic: 'Trees', implemented: 6, explored: 0, completed: 0, percent: 0 },
    ]);
  });

  it('without server coverage (an older server): every implemented topic, in order, counted from the tracks', () => {
    const rows = topicBreakdown(undefined, [
      track('bubble-sort', 'in_progress'),
      track('merge-sort', 'completed'),
      track('quick-sort', 'not_started'),
      track('build-bst', 'completed'),
      track('build-bst-recursive', 'in_progress'),
      track('not-an-algorithm', 'completed'),
    ]);
    expect(rows.map(r => r.topic)).toEqual(IMPLEMENTED_TOPICS.map(t => t.topic));
    const t = byTopic(rows);
    expect(t.Sorting).toMatchObject({ explored: 2, completed: 1 });
    expect(t.Trees).toMatchObject({ explored: 2, completed: 1, implemented: IMPLEMENTED_TOPICS.find(x => x.topic === 'Trees')!.algorithmIds.length });
    expect(rows.reduce((n, r) => n + r.explored, 0)).toBe(4);
    for (const r of rows) expect(r.percent).toBe(Math.round((r.explored / r.implemented) * 100));
  });

  it('a new account: every topic at zero, nothing invented', () => {
    const rows = topicBreakdown([], []);
    expect(rows.length).toBe(IMPLEMENTED_TOPICS.length);
    expect(rows.every(r => r.explored === 0 && r.completed === 0 && r.percent === 0)).toBe(true);
  });

  it('impossible server numbers are kept in range, and topics with nothing to visualize are left out', () => {
    const rows = topicBreakdown(
      [
        { topic: 'Graphs', implemented: 0, practised: 0, completed: 0 },
        { topic: 'Arrays', implemented: 4, practised: 9, completed: 7 },
        { topic: 'Strings', implemented: 4, practised: -1, completed: 2 },
      ],
      []
    );
    expect(rows).toEqual([
      { topic: 'Arrays', implemented: 4, explored: 4, completed: 4, percent: 100 },
      { topic: 'Strings', implemented: 4, explored: 0, completed: 0, percent: 0 },
    ]);
  });
});
