import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AlgorithmTrack } from '../../../api';

// Static rendering reads the stores' state, so both are replaced by plain objects holding the state under test (as in
// the Dashboard render tests).
const progressStore = vi.hoisted(() => ({
  tracks: [] as AlgorithmTrack[],
  tracksLoaded: false,
  tracksLoading: false,
  tracksError: null as string | null,
  fetchTracks: () => Promise.resolve(),
}));
vi.mock('../../../store/useProgressStore', () => ({ useProgressStore: () => progressStore }));
vi.mock('../../../store/useVisualizerStore', () => ({
  useVisualizerStore: (selector: (s: { setAlgorithm: () => void }) => unknown) => selector({ setAlgorithm: () => {} }),
}));

const { LearningPathsPage } = await import('../../LearningPathsPage');

const render = () => renderToStaticMarkup(<MemoryRouter><LearningPathsPage /></MemoryRouter>);
const statuses = (html: string) => Object.fromEntries([...html.matchAll(/data-milestone="(m\d+)" data-status="([a-z-]+)"/g)].map(m => [m[1], m[2]]));
const track = (algorithmId: string): AlgorithmTrack => ({
  algorithmId,
  status: 'in_progress',
  stepsCompleted: 0,
  totalSteps: 0,
  lastStepIndex: 1,
  executionCount: 0,
  lastActivityAt: '2026-10-20T10:00:00Z',
});

beforeEach(() => {
  Object.assign(progressStore, { tracks: [], tracksLoaded: false, tracksLoading: false, tracksError: null });
});

describe('Learning Paths — states', () => {
  it('loading: no status is claimed (placeholders), announced as loading; only coming-soon is known', () => {
    progressStore.tracksLoading = true;
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/data-testid="roadmap-status"[^>]*>Loading your progress…</);
    expect(new Set(Object.values(statuses(html)))).toEqual(new Set(['unknown', 'coming-soon']));
    expect(html).not.toMatch(/Explored|Not started|Completed/);
    expect(html).not.toContain('track-summary');
  });

  it('a new account: zero explored, every implemented milestone not started, nothing completed', () => {
    Object.assign(progressStore, { tracksLoaded: true });
    const html = render();
    const s = statuses(html);
    expect(Object.values(s).filter(v => v === 'explored')).toEqual([]);
    expect(s).toMatchObject({ m1: 'not-started', m4: 'not-started', m9: 'not-started', m10: 'coming-soon', m11: 'coming-soon' });
    expect(html).not.toMatch(/completed/i);
    expect([...html.matchAll(/data-testid="track-summary"[^>]*>([^<]+)</g)].map(m => m[1])).toEqual(['0 of 3 explored', '0 of 5 explored', '0 of 1 explored']);
  });

  it('in-progress activity: those milestones are explored; unknown ids change nothing', () => {
    Object.assign(progressStore, { tracksLoaded: true, tracks: [track('bubble-sort'), track('reverse-linked-list'), track('no-such-algo')] });
    const html = render();
    const s = statuses(html);
    expect(Object.entries(s).filter(([, v]) => v === 'explored').map(([k]) => k)).toEqual(['m4', 'm9']);
    expect(html).toContain('1 of 5 explored');
  });

  it('a failed first load: an alert with the reason and Retry; no statuses claimed; the roadmap stays usable', () => {
    progressStore.tracksError = 'Unable to connect to the server.';
    const html = render();
    expect(html).toMatch(/role="alert" data-testid="roadmap-error"/);
    expect(html).toContain('Unable to connect to the server.');
    expect(html).toMatch(/<button type="button"[^>]*>.*Retry<\/button>/);
    expect(html).not.toMatch(/Explored|Not started/);
    expect(html).toContain('data-algorithm="bubble-sort"');
  });

  it('a failed refresh keeps the loaded statuses and offers Retry', () => {
    Object.assign(progressStore, { tracksLoaded: true, tracks: [track('bubble-sort')], tracksError: 'timeout' });
    const html = render();
    expect(html).toContain('data-testid="roadmap-refresh-error"');
    expect(statuses(html).m4).toBe('explored');
  });
});

describe('Learning Paths — links', () => {
  it('each implemented milestone links to the visualizer for its own algorithm, with an accessible name', () => {
    Object.assign(progressStore, { tracksLoaded: true });
    const html = render();
    const links = [...html.matchAll(/<a ([^>]*)>/g)].map(m => m[1]);
    expect(links.map(a => a.match(/data-algorithm="([a-z-]+)"/)![1])).toEqual([
      'linear-search', 'binary-search', 'two-pointer', 'bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'reverse-linked-list',
    ]);
    for (const a of links) expect(a).toMatch(/href="\/visualizer"/);
    expect(html).toContain('aria-label="Visualize Bubble Sort"');
    expect(html).toContain('aria-label="Visualize Reverse Linked List"');
  });

  it('coming-soon milestones stay visible but are not links', () => {
    Object.assign(progressStore, { tracksLoaded: true });
    const html = render();
    for (const id of ['m10', 'm11']) {
      const card = html.slice(html.indexOf(`data-milestone="${id}"`), html.indexOf('</li>', html.indexOf(`data-milestone="${id}"`)));
      expect(card, id).toContain('Coming soon');
      expect(card, id).not.toContain('<a ');
    }
    expect(html).toContain('Stack LIFO &amp; Monotonic Next Greater Element');
    expect(html).not.toMatch(/>Locked</);
  });

  it('decorative icons are hidden and pulsing placeholders only run when motion is allowed', () => {
    progressStore.tracksLoading = true;
    const html = render();
    expect(html).not.toMatch(/<svg(?![^>]*aria-hidden="true")[^>]*class="lucide/);
    expect(html).not.toMatch(/(?<!motion-safe:)animate-pulse/);
  });
});
