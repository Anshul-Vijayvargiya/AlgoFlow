import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AlgorithmTrack, UserProgressData } from '../../../api';

// Static rendering reads each store's initial state, so the two stores the Dashboard reads are replaced by plain
// objects holding the state under test (as in the visualizer panel tests).
const progressStore = vi.hoisted(() => ({
  progress: null as UserProgressData | null,
  tracks: [] as AlgorithmTrack[],
  isLoading: false,
  error: null as string | null,
  fetchProgress: () => Promise.resolve(),
}));
vi.mock('../../../store/useProgressStore', () => ({ useProgressStore: () => progressStore }));
vi.mock('../../../store/useVisualizerStore', () => ({
  useVisualizerStore: (selector: (s: { setAlgorithm: () => void }) => unknown) => selector({ setAlgorithm: () => {} }),
}));

const { Dashboard } = await import('../../Dashboard');

const render = () => renderToStaticMarkup(<MemoryRouter><Dashboard /></MemoryRouter>);
const visibleText = (html: string) => html.replace(/<p[^>]*class="sr-only"[^>]*>.*?<\/p>|<div[^>]*class="sr-only"[^>]*>.*?<\/div>|<h2[^>]*class="sr-only"[^>]*>.*?<\/h2>/g, '').replace(/<[^>]+>/g, ' ');

// the server's last 7 UTC days: Thursday 15 to Wednesday 21 October 2026
const zeroWeek = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'].map((day, i) => ({
  day,
  date: `2026-10-${15 + i}`,
  minutes: 0,
  steps: 0,
  submissions: 0,
  walkthroughs: 0,
}));
const emptyAccount: UserProgressData = {
  weeklyActivity: zeroWeek,
  difficultyDistribution: [
    { name: 'Easy', value: 0, color: '#10B981' },
    { name: 'Medium', value: 0, color: '#F59E0B' },
    { name: 'Hard', value: 0, color: '#F43F5E' },
  ],
  topicProficiency: [],
  streakDays: 0,
  solvedCount: 0,
  algorithmsLearned: 0,
  overallProgressPercent: 0,
};
const activeAccount: UserProgressData = {
  ...emptyAccount,
  weeklyActivity: zeroWeek.map((d, i) => (i === 1 ? { ...d, minutes: 10, submissions: 2 } : i === 4 ? { ...d, steps: 9, walkthroughs: 1 } : d)),
  difficultyDistribution: [
    { name: 'Easy', value: 3, color: '#10B981' },
    { name: 'Medium', value: 2, color: '#F59E0B' },
    { name: 'Hard', value: 1, color: '#F43F5E' },
  ],
  streakDays: 1,
  solvedCount: 6,
  algorithmsLearned: 2,
  overallProgressPercent: 8,
};

beforeEach(() => {
  Object.assign(progressStore, { progress: null, tracks: [], isLoading: false, error: null });
});

describe('Dashboard — states', () => {
  it('loading: placeholders only, no numbers and no data claims; announced as loading', () => {
    progressStore.isLoading = true;
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/data-testid="dashboard-status"[^>]*>Loading your progress…</);
    const stats = html.slice(html.indexOf('data-testid="dashboard-stats"'), html.indexOf('data-testid="continue-learning"'));
    expect(visibleText(stats)).not.toMatch(/\d/);
    expect(html).not.toContain('Nothing in progress yet');
    expect(html).not.toContain('data-testid="weekly-empty"');
    expect(html).not.toContain('data-testid="recommendations"');
  });

  it('before the first request starts it is the same loading state (never zeros)', () => {
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(visibleText(html)).not.toMatch(/\b0 Days\b|Problems Solved/);
  });

  it('a failed first load: an alert with the reason and Retry; no zeros, no claims about the account', () => {
    progressStore.error = 'Unable to connect to the server.';
    const html = render();
    expect(html).toMatch(/role="alert" data-testid="dashboard-error"/);
    expect(html).toContain('Your progress could not be loaded');
    expect(html).toContain('Unable to connect to the server.');
    expect(html).toMatch(/<button type="button"[^>]*>.*Retry<\/button>/);
    for (const id of ['dashboard-stats', 'continue-learning', 'weekly-activity', 'difficulty-distribution']) expect(html, id).not.toContain(`data-testid="${id}"`);
  });

  it('a failed refresh keeps the earlier data and offers Retry', () => {
    progressStore.progress = activeAccount;
    progressStore.error = 'timeout';
    const html = render();
    expect(html).toContain('data-testid="dashboard-refresh-error"');
    expect(html).toContain('Showing what was loaded earlier');
    expect(html).toContain('data-testid="dashboard-stats"');
    expect(html).not.toContain('data-testid="dashboard-error"');
  });

  it('an empty account: real zeros and honest empty states, distinct from a failure', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).not.toContain('dashboard-error');
    expect(visibleText(html)).toMatch(/0\s+Problems Solved/);
    expect(html).toContain('Nothing in progress yet');
    expect(html).toContain('data-testid="weekly-empty"');
    expect(html).toContain('No activity in the last 7 days');
    expect(html).toMatch(/<a [^>]*href="\/visualizer"[^>]*>visualizer<\/a>/);
    expect(html).toContain('data-testid="difficulty-empty"');
    expect(html).toContain('No solved problems yet');
    expect(html).not.toContain('recharts');
  });

  it('a populated account: real values, active days, badges per difficulty and the algorithm to continue', () => {
    progressStore.progress = activeAccount;
    progressStore.tracks = [
      { algorithmId: 'heap-sort', status: 'in_progress', stepsCompleted: 3, totalSteps: 40, lastStepIndex: 2, executionCount: 1, lastActivityAt: new Date().toISOString() },
    ];
    const html = render();
    const text = visibleText(html);
    expect(text).toMatch(/6\s+Problems Solved/);
    expect(text).toMatch(/1 Day\s+Current Streak/);
    expect(html).toMatch(/data-testid="weekly-active-days"[^>]*>Active on 2 of 7 days</);
    expect([...html.matchAll(/data-difficulty="(\w+)"[^>]*>(\w+)<span class="text-ink">(\d+)</g)].map(m => m.slice(1))).toEqual([
      ['Easy', 'Easy', '3'],
      ['Medium', 'Medium', '2'],
      ['Hard', 'Hard', '1'],
    ]);
    expect(html).toContain('Heap Sort');
    expect(html).toContain('In progress · last active today');
    expect(html).toMatch(/<a [^>]*href="\/visualizer"[^>]*>Open Heap Sort/);
    // the chart summaries are available as text
    expect(html).toContain('Friday 16 Oct: 2 practice submissions, 0 visualizer walkthroughs;');
    expect(html).toContain('Monday 19 Oct: 0 practice submissions, 1 visualizer walkthrough;');
    expect(html).toContain('In total: 2 practice submissions and 1 visualizer walkthrough.');
    expect(html).toMatch(/data-testid="weekly-totals"[^>]*>This week: 2 practice submissions · 1 visualizer walkthrough</);
    // the estimated minutes are no longer what the chart shows
    expect(html).not.toContain('Minutes logged');
    expect(html).toContain('Solved problems by difficulty: Easy 3, Medium 2, Hard 1 (6 in total).');
  });
});

describe('Dashboard — weekly activity counts', () => {
  it('visualizer-only days are active and charted as walkthroughs (no longer an empty "no minutes" chart)', () => {
    progressStore.progress = { ...emptyAccount, weeklyActivity: zeroWeek.map((d, i) => (i === 6 ? { ...d, steps: 12, walkthroughs: 2 } : d)) };
    const html = render();
    expect(html).toMatch(/data-testid="weekly-active-days"[^>]*>Active on 1 of 7 days</);
    expect(html).toContain('aria-describedby="weekly-summary"');
    expect(html).not.toContain('data-testid="weekly-empty"');
    expect(html).toContain('Wednesday 21 Oct: 0 practice submissions, 2 visualizer walkthroughs.');
  });

  it('estimated minutes without a counted submission (e.g. an old judging failure) are not activity', () => {
    progressStore.progress = { ...emptyAccount, weeklyActivity: zeroWeek.map((d, i) => (i === 6 ? { ...d, minutes: 5 } : d)) };
    const html = render();
    expect(html).toMatch(/data-testid="weekly-active-days"[^>]*>Active on 0 of 7 days</);
    expect(html).toContain('data-testid="weekly-empty"');
  });

  it('the card explains what is counted', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toContain('Practice submissions and visualizer walkthroughs per day, last 7 days (UTC).');
    expect(html).toContain('A walkthrough is an algorithm you stepped through in the visualizer; each algorithm counts once a day.');
  });
});

describe('Dashboard — truthfulness and accessibility', () => {
  it('no invented activity, time, step or difficulty remains', () => {
    progressStore.progress = activeAccount;
    const html = render();
    for (const invented of ['7.4 hrs', 'Resume Step', 'Step 4 of 10', 'Array Partitioning']) expect(html, invented).not.toContain(invented);
    // recommendations show category and complexity, never a difficulty
    const recs = html.slice(html.indexOf('data-testid="recommendations"'));
    expect(recs).not.toContain('data-difficulty');
  });

  it('each recommendation links to the visualizer for its own algorithm', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    const anchors = [...html.matchAll(/<a ([^>]*data-algorithm="[^"]*"[^>]*)>(.*?)<\/a>/g)];
    for (const [, attrs] of anchors) expect(attrs).toMatch(/href="\/visualizer"/);
    const links = anchors.map(([, attrs, body]) => [attrs.match(/data-algorithm="([a-z-]+)"/)![1], body.match(/<span class="block font-bold[^"]*">([^<]+)</)![1]]);
    expect(links).toEqual([
      ['bubble-sort', 'Bubble Sort'],
      ['selection-sort', 'Selection Sort'],
      ['insertion-sort', 'Insertion Sort'],
      ['merge-sort', 'Merge Sort'],
    ]);
  });

  it('one h1, every section titled by an h2, charts named and summarised, decorative emoji hidden', () => {
    progressStore.progress = activeAccount;
    const html = render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toMatch(/<h3/);
    for (const id of ['continue-heading', 'weekly-heading', 'difficulty-heading', 'recommended-heading', 'dashboard-stats-heading']) {
      expect(html, id).toMatch(new RegExp(`<h2 id="${id}"`));
    }
    expect(html).toMatch(/<figure aria-labelledby="weekly-heading" aria-describedby="weekly-summary"/);
    expect(html).toMatch(/<figure aria-labelledby="difficulty-heading" aria-describedby="difficulty-summary"/);
    expect(html).toContain('<span aria-hidden="true"> 🔥</span>');
  });

  it('hover zoom and pulsing placeholders only run when motion is allowed', () => {
    progressStore.isLoading = true;
    const html = render();
    expect(html).toContain('motion-safe:hover:scale-105');
    expect(html).not.toMatch(/(?<!motion-safe:)hover:scale-105/);
    expect(html).not.toMatch(/(?<!motion-safe:)animate-pulse/);
  });
});
