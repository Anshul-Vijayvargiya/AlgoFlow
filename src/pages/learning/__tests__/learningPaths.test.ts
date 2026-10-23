import { describe, it, expect } from 'vitest';
import type { AlgorithmTrack } from '../../../api';
import { ALGORITHM_NAV } from '../../../data/algorithmMetadata';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import { LEARNING_TRACKS, milestoneStatus, trackSummary } from '../learningPaths';

const track = (algorithmId: string, status: AlgorithmTrack['status']): AlgorithmTrack => ({
  algorithmId,
  status,
  stepsCompleted: 0,
  totalSteps: 0,
  lastStepIndex: 1,
  executionCount: 0,
  lastActivityAt: '2026-10-20T10:00:00Z',
});

const milestones = LEARNING_TRACKS.flatMap(t => t.milestones);

describe('roadmap curriculum', () => {
  it('every milestone names an algorithm the app lists (no invented ids), and none carries a stored status', () => {
    const listed = new Set(ALGORITHM_NAV.map(a => a.id));
    for (const m of milestones) {
      expect(listed.has(m.algorithmId), m.algorithmId).toBe(true);
      expect(Object.keys(m).sort()).toEqual(['algorithmId', 'estimatedMinutes', 'id', 'title']);
    }
  });
});

describe('milestone status', () => {
  it('a new account: no implemented milestone is explored, none is completed', () => {
    const statuses = milestones.map(m => milestoneStatus(m.algorithmId, []));
    expect(statuses.filter(s => s === 'explored')).toEqual([]);
    expect(new Set(statuses)).toEqual(new Set(['not-started', 'coming-soon']));
  });

  it('an in-progress record makes its milestone explored, and only that one', () => {
    const tracks = [track('bubble-sort', 'in_progress')];
    expect(milestoneStatus('bubble-sort', tracks)).toBe('explored');
    expect(milestoneStatus('merge-sort', tracks)).toBe('not-started');
  });

  it('a stored "completed" record is shown as explored: there is no server-validated completion rule', () => {
    expect(milestoneStatus('quick-sort', [track('quick-sort', 'completed')])).toBe('explored');
  });

  it('a not-started record is not progress', () => {
    expect(milestoneStatus('heap-sort', [track('heap-sort', 'not_started')])).toBe('not-started');
  });

  it('unimplemented algorithms are coming soon, even with a (stray) progress record', () => {
    for (const id of ['stack', 'bfs']) {
      expect(getAlgorithmDefinition(id as never)).toBeUndefined();
      expect(milestoneStatus(id, [track(id, 'in_progress')])).toBe('coming-soon');
    }
  });

  it('unknown algorithm ids are coming soon, and records for unknown ids change nothing', () => {
    expect(milestoneStatus('no-such-algo', [])).toBe('coming-soon');
    const statuses = milestones.map(m => milestoneStatus(m.algorithmId, [track('no-such-algo', 'in_progress')]));
    expect(statuses).toEqual(milestones.map(m => milestoneStatus(m.algorithmId, [])));
  });

  it('track summary counts explored milestones out of those that can be visualized', () => {
    const t3 = LEARNING_TRACKS.find(t => t.id === 't3')!;
    expect(trackSummary(t3, [])).toEqual({ explored: 0, available: 1 });
    expect(trackSummary(t3, [track('reverse-linked-list', 'in_progress')])).toEqual({ explored: 1, available: 1 });
  });
});
