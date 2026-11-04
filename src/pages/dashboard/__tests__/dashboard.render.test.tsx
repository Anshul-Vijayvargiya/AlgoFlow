import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AlgorithmTrack, RecentActivityEvent, TodayProgress, UserProgressData } from '../../../api';

// Static rendering reads each store's initial state, so the two stores the Dashboard reads are replaced by plain
// objects holding the state under test (as in the visualizer panel tests).
const progressStore = vi.hoisted(() => ({
  progress: null as UserProgressData | null,
  tracks: [] as AlgorithmTrack[],
  isLoading: false,
  error: null as string | null,
  fetchProgress: () => Promise.resolve(),
  today: null as TodayProgress | null,
  todayLoading: false,
  todayError: null as string | null,
  goalSaving: null as string | null,
  goalError: null as string | null,
  fetchToday: () => Promise.resolve(),
  setManualGoal: () => Promise.resolve(),
  recent: [] as RecentActivityEvent[],
  recentLoaded: false,
  recentLoading: false,
  recentError: null as string | null,
  fetchRecent: () => Promise.resolve(true),
}));
vi.mock('../../../store/useProgressStore', () => ({ useProgressStore: () => progressStore }));
// the API mode is a build flag; the tests set it
const apiFlags = vi.hoisted(() => ({ isMockApi: false }));
vi.mock('../../../api', async importOriginal => ({
  ...(await importOriginal<object>()),
  get isMockApi() {
    return apiFlags.isMockApi;
  },
}));
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

const todayData = (verified = { walkthroughs: 0, submissions: 0, accepted: 0 }, manualCompleted: string[] = []): TodayProgress => ({
  date: '2026-10-21',
  resetsAt: '2026-10-22T00:00:00.000Z',
  verified,
  manualCompleted,
});

beforeEach(() => {
  Object.assign(progressStore, {
    progress: null, tracks: [], isLoading: false, error: null,
    today: null, todayLoading: false, todayError: null, goalSaving: null, goalError: null,
    recent: [], recentLoaded: false, recentLoading: false, recentError: null,
  });
  apiFlags.isMockApi = false;
});

describe('Dashboard — states', () => {
  it('loading: placeholders only, no numbers and no data claims; announced as loading', () => {
    progressStore.isLoading = true;
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/data-testid="dashboard-status"[^>]*>Loading your progress…</);
    const from = html.indexOf('>', html.indexOf('data-testid="dashboard-stats"')) + 1;
    const stats = html.slice(from, html.indexOf('data-testid="daily-checklist"'));
    expect(visibleText(stats)).not.toMatch(/\d/);
    expect(html).not.toContain('Nothing in progress yet');
    expect(html).toMatch(/data-testid="welcome-explored"[^>]*>.*Loading algorithms explored…/);
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
    for (const id of ['dashboard-stats', 'continue-learning', 'difficulty-distribution']) expect(html, id).not.toContain(`data-testid="${id}"`);
    expect(html).toMatch(/data-testid="welcome-explored"[^>]*>.*Explored count unavailable/);
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
    expect(html).toContain('data-testid="difficulty-empty"');
    expect(html).toContain('No solved problems yet');
    expect(html).toMatch(/data-testid="welcome-explored"[^>]*>.*0 algorithms explored/);
    expect(html).not.toContain('recharts');
  });

  it('a populated account: real values, badges per difficulty and the algorithm to continue with its topic and complexity', () => {
    progressStore.progress = activeAccount;
    progressStore.tracks = [
      { algorithmId: 'heap-sort', status: 'in_progress', stepsCompleted: 3, totalSteps: 40, lastStepIndex: 2, executionCount: 1, lastActivityAt: new Date().toISOString() },
    ];
    const html = render();
    const text = visibleText(html);
    expect(text).toMatch(/6\s+Problems Solved/);
    expect(text).toMatch(/1 Day\s+Current Streak/);
    expect([...html.matchAll(/data-difficulty="(\w+)"[^>]*>(\w+)<span class="text-ink">(\d+)</g)].map(m => m.slice(1))).toEqual([
      ['Easy', 'Easy', '3'],
      ['Medium', 'Medium', '2'],
      ['Hard', 'Hard', '1'],
    ]);
    expect(html).toContain('Solved problems by difficulty: Easy 3, Medium 2, Hard 1 (6 in total).');
    // continue learning: name, topic, time complexity and when, from the track and the algorithm's definition
    expect(html).toMatch(/<p class="[^"]*">Heap Sort<\/p>/);
    expect(html).toMatch(/data-testid="continue-topic"[^>]*>Sorting</);
    expect(html).toMatch(/data-testid="continue-complexity"[^>]*>.*<span class="sr-only">Average time complexity: <\/span>O\(n log n\)</);
    expect(html).toMatch(/data-testid="continue-meta"[^>]*>.*Last active today</);
    // no step count (only milestone steps are recorded)
    expect(html).not.toMatch(/step viewed|Step \d+ of/);
    // the button says what it does; the algorithm is named for screen readers too (and shown beside it)
    const resumeLink = html.match(/<a [^>]*data-testid="continue-resume" aria-label="Continue: Heap Sort"[^>]*>Continue<svg/)![0];
    expect(resumeLink).toContain('href="/visualizer"');
  });

  it('a different algorithm in progress is what is shown: nothing is hardcoded', () => {
    progressStore.progress = activeAccount;
    progressStore.tracks = [
      { algorithmId: 'binary-search', status: 'in_progress', stepsCompleted: 1, totalSteps: 9, lastStepIndex: 1, executionCount: 1, lastActivityAt: new Date().toISOString() },
    ];
    const html = render();
    expect(html).toMatch(/data-testid="continue-topic"[^>]*>Searching</);
    expect(html).toMatch(/data-testid="continue-complexity"[^>]*>.*O\(log n\)</);
    expect(html).toMatch(/data-testid="continue-resume" aria-label="Continue: Binary Search"[^>]*>Continue<svg/);
    expect(html).not.toContain('Bubble Sort');
  });
});

describe('Dashboard — only the approved sections', () => {
  it('weekly activity, progress by topic, recommended next, quick actions and learning time are not on the dashboard', () => {
    progressStore.progress = { ...activeAccount, topicCoverage: [{ topic: 'Sorting', implemented: 6, practised: 3, completed: 1 }] };
    progressStore.today = todayData();
    progressStore.recentLoaded = true;
    const html = render();
    for (const id of ['weekly-activity', 'topic-progress', 'recommended-next', 'recommendations', 'quick-actions']) expect(html, id).not.toContain(`data-testid="${id}"`);
    for (const text of ['Weekly activity', 'Progress by topic', 'Recommended next', 'Quick Actions', 'Learning Time']) expect(visibleText(html), text).not.toContain(text);
  });
});

describe('Dashboard — truthfulness and accessibility', () => {
  it('no invented activity, time, step or difficulty remains', () => {
    progressStore.progress = activeAccount;
    const html = render();
    for (const invented of ['7.4 hrs', 'Resume Step', 'Step 4 of 10', 'Array Partitioning']) expect(html, invented).not.toContain(invented);
  });

  it('one h1, every section titled by an h2, the difficulty list described, decorative emoji hidden', () => {
    progressStore.progress = activeAccount;
    const html = render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    // the only sub-heading: "Solved by difficulty" in the solved card
    expect(html.match(/<h3[^>]*>[^<]*<\/h3>/g)).toEqual([expect.stringContaining('>Solved by difficulty<')]);
    for (const id of ['continue-heading', 'checklist-heading', 'recent-heading', 'dashboard-stats-heading']) {
      expect(html, id).toMatch(new RegExp(`<h2 id="${id}"`));
    }
    expect(html.match(/<h2 /g)).toHaveLength(4);
    expect(html).toMatch(/<ul [^>]*aria-labelledby="difficulty-heading" aria-describedby="difficulty-summary"/);
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

describe('Dashboard v2 — welcome and streak', () => {
  it('a greeting (no invented name), the subtitle, the two ways in, and no demo label against a real server', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Good (morning|afternoon|evening)<\/h1>/);
    expect(html).toContain('Ready to master DSA? Continue where you left off or start a new practice.');
    expect(html).toMatch(/<a [^>]*href="\/visualizer"[^>]*>.*Launch Visualizer<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/practice"[^>]*>.*Start Practice<\/a>/);
    expect(html).not.toContain('data-testid="demo-badge"');
  });

  it('the mock API is labelled as demo data kept in this browser', () => {
    apiFlags.isMockApi = true;
    progressStore.progress = emptyAccount;
    expect(render()).toMatch(/data-testid="demo-badge"[^>]*>.*Demo mode: progress is kept in this browser, not on a server<\/p>/);
  });

  it('the streak with its best; after a missed day the best is still shown; never active: an invitation, no flame', () => {
    progressStore.progress = { ...activeAccount, streakDays: 3, longestStreakDays: 9 };
    let text = visibleText(render());
    expect(text).toMatch(/3 Days\s+Current Streak\s+🔥\s+Best: 9 days/);

    progressStore.progress = { ...activeAccount, streakDays: 0, longestStreakDays: 9 };
    text = visibleText(render());
    expect(text).toMatch(/0 Days\s+Current Streak\s+Best: 9 days · any activity today starts a new streak/);
    expect(text).not.toContain('🔥');

    progressStore.progress = emptyAccount;
    expect(visibleText(render())).toMatch(/0 Days\s+Current Streak\s+Step through an algorithm or submit a solution to start one/);
  });

  it("solved problems: the server's count of accepted problems, then the badges by difficulty", () => {
    progressStore.progress = activeAccount;
    // (the list's screen-reader heading "Solved by difficulty" sits between them in the markup)
    expect(visibleText(render())).toMatch(/6\s+Problems Solved\s+(Solved by difficulty\s+)?Easy\s*3\s*Medium\s*2\s*Hard\s*1/);
  });

  it("algorithms explored come from the server's totals when it sends them, in the card and in the welcome", () => {
    progressStore.progress = { ...activeAccount, algorithmTotals: { available: 50, implemented: 40, practised: 5, completed: 1 } };
    const html = render();
    expect(visibleText(html)).toMatch(/5 \/ 40\s+Algorithms Explored\s+1 completed in the visualizer/);
    expect(html).toMatch(/data-testid="welcome-explored"[^>]*>.*5 algorithms explored</);
    // an older server without the totals: its own count
    progressStore.progress = { ...activeAccount, algorithmsLearned: 1 };
    const older = render();
    expect(visibleText(older)).toMatch(/1\s+Algorithms Explored\s+Stepped through in the visualizer/);
    expect(older).toMatch(/data-testid="welcome-explored"[^>]*>.*1 algorithm explored</);
  });
});

describe('Dashboard v2 — daily checklist', () => {
  it('loading: placeholders, no count', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toContain('data-testid="daily-checklist"');
    expect(html).not.toContain('data-testid="checklist-count"');
    expect(html).not.toMatch(/type="checkbox"/);
  });

  it('a failed load: an alert with Retry, nothing claimed as done', () => {
    progressStore.todayError = 'offline';
    const html = render();
    expect(html).toMatch(/role="alert" data-testid="checklist-error"[^>]*>.*Today&#x27;s goals could not be loaded\. offline/);
    expect(html).not.toContain('goals complete');
  });

  it('"2 of 4 goals complete": verified goals are status only, the manual goal is a real checkbox', () => {
    progressStore.progress = emptyAccount;
    progressStore.today = todayData({ walkthroughs: 1, submissions: 0, accepted: 0 }, ['review']);
    const html = render();
    expect(html).toMatch(/data-testid="checklist-count"[^>]*>2 of 4 goals complete</);
    expect(html).toMatch(/role="progressbar" aria-label="Today&#x27;s goals" aria-valuemin="0" aria-valuemax="4" aria-valuenow="2" aria-valuetext="2 of 4 goals complete"/);
    const goals = [...html.matchAll(/data-goal="(\w+)" data-kind="(\w+)" data-done="(true|false)"/g)].map(m => m.slice(1));
    expect(goals).toEqual([
      ['visualize', 'verified', 'true'],
      ['submit', 'verified', 'false'],
      ['solve', 'verified', 'false'],
      ['review', 'manual', 'true'],
    ]);
    // exactly one checkbox (the manual goal), labelled by its text and described by its hint
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    const checkbox = html.match(/<label[^>]*><input type="checkbox"[^>]*\/>/)![0];
    expect(checkbox).toContain('checked=""');
    expect(checkbox).toContain('aria-describedby="goal-hint-review"');
    expect(html).toContain('(done)');
    expect(html).toContain('(not done yet)');
    // no footer: neither the reset time nor the estimated practice time is shown on the dashboard
    expect(html).not.toContain('data-testid="checklist-reset"');
    expect(html).not.toContain('Earlier days are kept');
    // no points for ticking a box
    expect(html).not.toMatch(/\bXP\b|points/i);
  });

  it('while a tick is saving the checkbox is disabled; a failed save says it was undone', () => {
    progressStore.today = todayData();
    progressStore.goalSaving = 'review';
    expect(render()).toMatch(/<input type="checkbox" disabled=""/);
    progressStore.goalSaving = null;
    progressStore.goalError = 'Network down';
    expect(render()).toMatch(/data-testid="checklist-feedback"[^>]*><span[^>]*>Your tick could not be saved, so it was undone\. Network down/);
  });

  it('all goals done: a success message', () => {
    progressStore.today = todayData({ walkthroughs: 2, submissions: 3, accepted: 1 }, ['review']);
    const html = render();
    expect(html).toContain('4 of 4 goals complete');
    expect(html).toContain('All of today&#x27;s goals are done. Nice work!');
  });
});

describe('Dashboard v2 — recent activity', () => {
  const events: RecentActivityEvent[] = [
    { id: 'submission:1', kind: 'submission', targetId: 'two-sum', title: 'Two Sum', status: 'ACCEPTED', language: 'python', at: '2026-10-21T09:15:00.000Z' },
    { id: 'walkthrough:2', kind: 'walkthrough', targetId: 'binary-search', title: 'Binary Search', date: '2026-10-21', stepsViewed: 6, at: '2026-10-21T08:00:00.000Z' },
    { id: 'submission:3', kind: 'submission', targetId: 'valid-parens', title: 'Valid Parentheses', status: 'WRONG_ANSWER', language: 'cpp', at: '2026-10-20T18:00:00.000Z' },
  ];

  it('loading: placeholders; then an empty account: an empty state linking to Practice and the Visualizer, no example rows', () => {
    expect(render()).not.toContain('data-testid="recent-empty"');
    progressStore.recentLoaded = true;
    const html = render();
    const section = html.slice(html.indexOf('data-testid="recent-activity"'));
    expect(section).toContain('No activity yet');
    expect(section).toMatch(/<a [^>]*href="\/practice"[^>]*>Practice<\/a>/);
    expect(section).toMatch(/<a [^>]*href="\/visualizer"[^>]*>Visualizer<\/a>/);
    expect(html).not.toContain('data-testid="recent-list"');
  });

  it('real events, newest first: name, type, status, time and a link to where each can be continued', () => {
    progressStore.recentLoaded = true;
    progressStore.recent = events;
    const html = render();
    expect(html).toMatch(/<table [^>]*data-testid="recent-list"><caption class="sr-only">/);
    expect([...html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(m => m[1])).toEqual(['Activity', 'Type', 'Result', 'When']);
    const rows = html
      .split('<tr data-event-kind="')
      .slice(1)
      .map(chunk => {
        const tr = chunk.slice(0, chunk.indexOf('</tr>'));
        return [
          tr.match(/^(\w+)"/)![1],
          tr.match(/href="([^"]+)"/)![1],
          tr.match(/<span class="truncate">([^<]+)</)![1],
          tr.match(/<td class="[^"]*hidden sm:table-cell">([^<]+)</)![1],
          tr.match(/data-testid="recent-status">([^<]+)</)![1],
          tr.match(/dateTime="([^"]+)"/)![1],
        ];
      });
    expect(rows).toEqual([
      ['submission', '/practice?problem=two-sum', 'Two Sum', 'Practice submission', 'Accepted', '2026-10-21T09:15:00.000Z'],
      ['walkthrough', '/visualizer', 'Binary Search', 'Visualizer walkthrough', 'Stepped through', '2026-10-21T08:00:00.000Z'],
      ['submission', '/practice?problem=valid-parens', 'Valid Parentheses', 'Practice submission', 'Wrong Answer', '2026-10-20T18:00:00.000Z'],
    ]);
  });

  it('a failed load: an alert with Retry', () => {
    progressStore.recentError = 'timeout';
    expect(render()).toMatch(/role="alert" data-testid="recent-error"[^>]*>.*Recent activity could not be loaded\. timeout/);
  });

  it('"View all" only when there may be more than the first page; it controls the list and starts collapsed', () => {
    progressStore.recentLoaded = true;
    progressStore.recent = events;
    expect(render()).not.toContain('data-testid="recent-view-all"');

    progressStore.recent = Array.from({ length: 8 }, (_, i) => ({ ...events[0], id: `submission:${i}` }));
    const html = render();
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="recent-list" data-testid="recent-view-all"[^>]*>View all/);
    expect(html).toContain('<table id="recent-list"');
    expect(html.match(/<tr data-event-kind=/g)).toHaveLength(8);
  });

  it('collapsed, only the first page is listed even when more were loaded earlier', () => {
    progressStore.recentLoaded = true;
    progressStore.recent = Array.from({ length: 20 }, (_, i) => ({ ...events[0], id: `submission:${i}` }));
    expect(render().match(/<tr data-event-kind=/g)).toHaveLength(8);
  });

  it('loading more failed: the listed events stay, with a note', () => {
    progressStore.recentLoaded = true;
    progressStore.recent = events;
    progressStore.recentError = 'timeout';
    const html = render();
    expect(html).toContain('data-testid="recent-list"');
    expect(html).toMatch(/data-testid="recent-more-error"[^>]*>More activity could not be loaded\. timeout/);
  });
});

describe('Dashboard v2 — layout', () => {
  it('reading order: welcome · continue learning and the three cards beside today\'s goals · recent activity across the width', () => {
    progressStore.progress = { ...activeAccount, algorithmTotals: { available: 50, implemented: 40, practised: 5, completed: 1 } };
    progressStore.today = todayData();
    progressStore.recentLoaded = true;
    const html = render();
    const order = ['dashboard-welcome', 'dashboard-main', 'continue-learning', 'dashboard-stats', 'daily-checklist', 'recent-activity'];
    const at = order.map(id => html.indexOf(`data-testid="${id}"`));
    expect(at.every(x => x > 0), order.filter((_, i) => at[i] < 0).join(', ')).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    const tag = (id: string) => html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))![0];
    // the two columns: 3 : 2 from lg, one column below; each column sizes to its content
    expect(tag('dashboard-main')).toContain('grid grid-cols-1 gap-5 items-start lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]');
    // recent activity is outside the two-column grid, so it takes the full width
    const mainEnd = html.indexOf('data-testid="daily-checklist"');
    expect(html.indexOf('data-testid="recent-activity"')).toBeGreaterThan(mainEnd);
    expect(tag('recent-activity')).not.toContain('col-span');
    // exactly three compact cards, three across from sm
    expect(tag('dashboard-stats')).toContain('grid-cols-1 sm:grid-cols-3');
    expect([...html.matchAll(/data-stat="([^"]+)"/g)].map(m => m[1])).toEqual(['Problems Solved', 'Algorithms Explored', 'Current Streak']);
    // the downloadable notes live on the Notes page, not here
    expect(html).not.toContain('data-testid="learning-resources"');
    // nothing can push the page sideways: cards may shrink
    for (const id of ['continue-learning', 'daily-checklist', 'recent-activity']) expect(tag(id), id).toContain('min-w-0');
  });

  it('a failed progress load: today\'s goals take the whole row (there is no left column to sit beside)', () => {
    progressStore.error = 'offline';
    const html = render();
    const main = html.match(/<[^>]*data-testid="dashboard-main"[^>]*>/)![0];
    expect(main).not.toContain('lg:grid-cols-');
  });

  it('a short hero: a decorative inline illustration (no image request) hidden from assistive technology', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toMatch(/<svg aria-hidden="true" viewBox="0 0 240 150" class="hidden md:block[^"]*" data-testid="welcome-art"/);
    expect(html).not.toMatch(/<img /);
  });
});

describe('Dashboard — welcome summary and a failed load', () => {
  it("the welcome shows the streak, today's goals and algorithms explored from the user's data, and says when they are loading or unavailable", () => {
    expect(render()).toMatch(/data-testid="welcome-streak"[^>]*>.*Loading streak…/);
    progressStore.progress = { ...emptyAccount, streakDays: 3, longestStreakDays: 5, algorithmTotals: { available: 50, implemented: 40, practised: 2, completed: 0 } };
    progressStore.today = todayData({ walkthroughs: 1, submissions: 0, accepted: 0 });
    const html = render();
    expect(visibleText(html)).toMatch(/3 Days streak/);
    expect(html).toMatch(/data-testid="welcome-goals"[^>]*>.*Today: 1 of \d+ goals complete/);
    expect(html).toMatch(/data-testid="welcome-explored"[^>]*>.*2 algorithms explored/);
    progressStore.progress = null;
    progressStore.error = 'Network error.';
    progressStore.today = null;
    progressStore.todayError = 'Network error.';
    const failed = render();
    expect(failed).toMatch(/data-testid="welcome-streak"[^>]*>.*Streak unavailable/);
    expect(failed).toMatch(/data-testid="welcome-goals"[^>]*>.*Today&#x27;s goals unavailable/);
  });

  it('a failed load: no numbers or cards it cannot vouch for; goals and recent activity stay usable', () => {
    progressStore.error = 'API rate limit exceeded. Please slow down your requests.';
    progressStore.today = todayData();
    progressStore.recentLoaded = true;
    const html = render();
    expect(html).toContain('data-testid="dashboard-error"');
    expect(html).toContain('API rate limit exceeded. Please slow down your requests.');
    for (const id of ['dashboard-stats', 'continue-learning']) expect(html, id).not.toContain(`data-testid="${id}"`);
    for (const id of ['daily-checklist', 'recent-activity']) expect(html, id).toContain(`data-testid="${id}"`);
  });
});
