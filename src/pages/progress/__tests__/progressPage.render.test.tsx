import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UserProgressData } from '../../../api';
import { algorithmTotals, dailyStepsSummary, percent, topicCoverageSummary } from '../progressData';

// Static rendering reads the store's state, so the progress store is replaced by a plain object holding the state
// under test (as in the Dashboard render tests).
const progressStore = vi.hoisted(() => ({
  progress: null as UserProgressData | null,
  tracks: [],
  isLoading: false,
  error: null as string | null,
  recordingError: null as string | null,
  fetchProgress: () => Promise.resolve(),
}));
vi.mock('../../../store/useProgressStore', () => ({ useProgressStore: () => progressStore }));

const { ProgressPage } = await import('../../ProgressPage');

const render = () => renderToStaticMarkup(<ProgressPage />);
const visibleText = (html: string) => html.replace(/<(p|div)[^>]*class="sr-only"[^>]*>.*?<\/\1>|<h2[^>]*class="sr-only"[^>]*>.*?<\/h2>/g, '').replace(/<[^>]+>/g, ' ');

const zeroWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, minutes: 0, steps: 0 }));
const coverage = [
  { topic: 'Sorting', implemented: 6, practised: 0, completed: 0 },
  { topic: 'Searching', implemented: 2, practised: 0, completed: 0 },
  { topic: 'Arrays', implemented: 1, practised: 0, completed: 0 },
  { topic: 'Linked List', implemented: 10, practised: 0, completed: 0 },
];
const emptyAccount: UserProgressData = {
  weeklyActivity: zeroWeek,
  difficultyDistribution: [],
  topicProficiency: [],
  topicCoverage: coverage,
  algorithmTotals: { available: 38, implemented: 19, practised: 0, completed: 0 },
  streakDays: 0,
  solvedCount: 0,
  algorithmsLearned: 0,
  overallProgressPercent: 0,
};
const activeAccount: UserProgressData = {
  ...emptyAccount,
  weeklyActivity: zeroWeek.map((d, i) => (i === 6 ? { ...d, steps: 42 } : i === 2 ? { ...d, steps: 7 } : d)),
  topicCoverage: coverage.map(t => (t.topic === 'Sorting' ? { ...t, practised: 3, completed: 1 } : t.topic === 'Linked List' ? { ...t, practised: 1 } : t)),
  algorithmTotals: { available: 38, implemented: 19, practised: 4, completed: 1 },
  streakDays: 2,
  solvedCount: 5,
  algorithmsLearned: 1,
  overallProgressPercent: 5,
};

beforeEach(() => {
  Object.assign(progressStore, { progress: null, isLoading: false, error: null, recordingError: null });
});

describe('progress calculations', () => {
  it('percent rounds and never divides by zero', () => {
    expect(percent(1, 19)).toBe(5);
    expect(percent(19, 19)).toBe(100);
    expect(percent(3, 0)).toBe(0);
  });

  it('totals come only from the server; missing or malformed totals are unavailable, never invented', () => {
    expect(algorithmTotals(activeAccount)).toEqual(activeAccount.algorithmTotals);
    expect(algorithmTotals({ ...activeAccount, algorithmTotals: undefined })).toBeNull();
    expect(algorithmTotals({ ...activeAccount, algorithmTotals: { available: 38, implemented: NaN, practised: 0, completed: 0 } })).toBeNull();
    expect(algorithmTotals(null)).toBeNull();
  });

  it('daily steps: exact values per day and a text summary', () => {
    const s = dailyStepsSummary(activeAccount.weeklyActivity);
    expect(s.activeDays).toBe(2);
    expect(s.description).toBe('Visualizer steps recorded per day: Mon 0, Tue 0, Wed 7, Thu 0, Fri 0, Sat 0, Sun 42.');
    expect(dailyStepsSummary(zeroWeek).hasSteps).toBe(false);
  });

  it('topic coverage: explored share per topic, topics without implemented algorithms dropped', () => {
    const s = topicCoverageSummary([...activeAccount.topicCoverage!, { topic: 'Graphs', implemented: 0, practised: 0, completed: 0 }]);
    expect(s.topics.map(t => [t.topic, t.exploredPercent])).toEqual([['Sorting', 50], ['Searching', 0], ['Arrays', 0], ['Linked List', 10]]);
    expect(s.description).toBe('Algorithms explored per topic: Sorting 3 of 6, Searching 0 of 2, Arrays 0 of 1, Linked List 1 of 10.');
  });
});

describe('Progress page — states', () => {
  it('loading: placeholders only, no numbers; announced', () => {
    progressStore.isLoading = true;
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/data-testid="progress-status"[^>]*>Loading your progress…</);
    const stats = html.slice(html.indexOf('data-testid="progress-stats"'), html.indexOf('data-testid="daily-steps"'));
    expect(visibleText(stats)).not.toMatch(/\d/);
    expect(html).not.toContain('daily-steps-empty');
  });

  it('a failed first load: an alert with the reason and Retry, no numbers', () => {
    progressStore.error = 'Unable to connect to the server.';
    const html = render();
    expect(html).toMatch(/role="alert" data-testid="progress-error"/);
    expect(html).toContain('Unable to connect to the server.');
    expect(html).toMatch(/<button type="button"[^>]*>.*Retry<\/button>/);
    for (const id of ['progress-stats', 'daily-steps', 'topic-coverage']) expect(html, id).not.toContain(`data-testid="${id}"`);
  });

  it('a failed refresh keeps the earlier data and offers Retry', () => {
    progressStore.progress = activeAccount;
    progressStore.error = 'timeout';
    const html = render();
    expect(html).toContain('data-testid="progress-refresh-error"');
    expect(html).toContain('data-testid="progress-stats"');
  });

  it('syncing a refresh is announced', () => {
    progressStore.progress = activeAccount;
    progressStore.isLoading = true;
    const html = render();
    expect(html).toMatch(/data-testid="progress-status"[^>]*>Syncing your progress…</);
    expect(html).toContain('Syncing progress…');
  });

  it('an empty account: real zeros against the real totals, and an empty steps chart', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    const text = visibleText(html);
    expect(text).toMatch(/0\s+\/ 19/);
    expect(text).not.toContain('/ 26');
    expect(html).toContain('data-testid="daily-steps-empty"');
    expect(html).toContain('No visualizer steps recorded in the last 7 days.');
    expect(text).toContain('No activity recorded today or yesterday');
  });

  it('a populated account: learned, explored and solved are separate figures, with progress bars', () => {
    progressStore.progress = activeAccount;
    const html = render();
    const text = visibleText(html);
    // a card's text: from its test id to the next card
    const card = (id: string) => {
      const start = html.indexOf(`data-testid="${id}"`);
      return visibleText(html.slice(start, html.indexOf('data-testid="stat-', start + 1)));
    };
    expect(card('stat-learned')).toMatch(/1\s+\/ 19/);
    expect(text).toContain('5% of the 19 visualized algorithms (38 listed)');
    expect(card('stat-explored')).toMatch(/4\s+\/ 19/);
    expect(html).toMatch(/role="progressbar" aria-label="Algorithms learned" aria-valuemin="0" aria-valuemax="19" aria-valuenow="1" aria-valuetext="1 of 19 \(5%\)"/);
    expect(html).toMatch(/role="progressbar" aria-label="Algorithms explored" aria-valuemin="0" aria-valuemax="19" aria-valuenow="4"/);
    expect(text).toMatch(/2 Days/);
    // the chart is labelled for what it is, with a text summary
    expect(html).not.toMatch(/CUMULATIVE ALGORITHM EXECUTIONS/i);
    expect(html).toContain('Visualizer steps per day');
    expect(html).toMatch(/<figure aria-labelledby="daily-steps-heading" aria-describedby="daily-steps-summary"/);
    expect(html).toContain('Visualizer steps recorded per day: Mon 0, Tue 0, Wed 7, Thu 0, Fri 0, Sat 0, Sun 42.');
    // topics: only those with something to visualize, with exact counts
    expect(html).toMatch(/<figure aria-labelledby="topic-coverage-heading" aria-describedby="topic-coverage-summary"/);
    expect(html).toContain('Algorithms explored per topic: Sorting 3 of 6, Searching 0 of 2, Arrays 0 of 1, Linked List 1 of 10.');
    for (const gone of ['Trees', 'Graphs', 'DP', 'PROFICIENCY']) expect(html, gone).not.toContain(gone);
  });

  it('totals missing from the server are shown as unavailable', () => {
    progressStore.progress = { ...activeAccount, algorithmTotals: undefined, topicCoverage: undefined };
    const html = render();
    expect(html).toContain('data-testid="totals-unavailable"');
    expect(html).toContain('data-testid="topic-coverage-unavailable"');
    expect(html).not.toContain('role="progressbar"');
  });

  it('a recording failure is shown', () => {
    progressStore.progress = activeAccount;
    progressStore.recordingError = 'Your latest visualizer activity could not be saved.';
    expect(render()).toMatch(/role="status" data-testid="progress-recording-error".*could not be saved/);
  });

  it('one h1, sections titled by h2, decorative icons hidden, motion only when allowed', () => {
    progressStore.progress = activeAccount;
    const html = render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    for (const id of ['progress-stats-heading', 'daily-steps-heading', 'topic-coverage-heading']) expect(html, id).toMatch(new RegExp(`<h2 id="${id}"`));
    expect(html).not.toMatch(/<svg(?![^>]*aria-hidden="true")[^>]*class="lucide/);
    expect(html).not.toMatch(/(?<!motion-safe:)(animate-pulse|transition-all)/);
  });
});
