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
  fetchRecent: () => Promise.resolve(),
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
    // real progress only: the status and when; no step count (only milestone steps are recorded)
    expect(html).toMatch(/data-testid="continue-meta"[^>]*>SORTING · in progress · last active today</);
    expect(html).not.toMatch(/step viewed|Step \d+ of/);
    const resumeLink = html.match(/<a [^>]*data-testid="continue-resume"[^>]*>Resume Heap Sort/)![0];
    expect(resumeLink).toContain('href="/visualizer"');
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
    // the only sub-heading: "Solved by difficulty" inside the progress panel
    expect(html.match(/<h3[^>]*>[^<]*<\/h3>/g)).toEqual([expect.stringContaining('>Solved by difficulty<')]);
    for (const id of ['continue-heading', 'checklist-heading', 'weekly-heading', 'recent-heading', 'recommended-heading', 'dashboard-stats-heading']) {
      expect(html, id).toMatch(new RegExp(`<h2 id="${id}"`));
    }
    expect(html).toMatch(/<figure aria-labelledby="weekly-heading" aria-describedby="weekly-summary"/);
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
  it('a greeting (no invented name), the two ways in, and no demo label against a real server', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Good (morning|afternoon|evening)<\/h1>/);
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

  it('solved problems: the server\'s count of accepted problems, with what counts said plainly', () => {
    progressStore.progress = activeAccount;
    const html = render();
    expect(visibleText(html)).toMatch(/6\s+Problems Solved\s+Accepted at least once/);
    expect(html).toContain('A problem counts once a submission is accepted; other attempts are not counted.');
    expect(html).toMatch(/<a [^>]*href="\/practice"[^>]*>Practise another problem/);
  });

  it('algorithms explored come from the server\'s totals when it sends them', () => {
    progressStore.progress = { ...activeAccount, algorithmTotals: { available: 50, implemented: 40, practised: 5, completed: 0 } };
    expect(visibleText(render())).toMatch(/5 \/ 40\s+Algorithms Explored/);
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
    expect(html).toMatch(/data-testid="checklist-reset"[^>]*>Resets at 00:00 UTC \(.+ your time\)\. Earlier days are kept\.</);
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
});

describe('Dashboard v2 — layout', () => {
  it('about 70 / 30 from lg, one column below; main: continue, weekly, recent; sidebar: progress, goals, recommendations', () => {
    progressStore.progress = activeAccount;
    progressStore.today = todayData();
    progressStore.recentLoaded = true;
    const html = render();
    expect(html).toMatch(/class="grid grid-cols-1 lg:grid-cols-\[minmax\(0,7fr\)_minmax\(0,3fr\)\] gap-5" data-testid="dashboard-columns"/);
    const main = html.slice(html.indexOf('data-testid="dashboard-main"'), html.indexOf('data-testid="dashboard-sidebar"'));
    const side = html.slice(html.indexOf('data-testid="dashboard-sidebar"'));
    const inOrder = (part: string, ids: string[]) => {
      const at = ids.map(id => part.indexOf(`data-testid="${id}"`));
      return at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1]));
    };
    expect(inOrder(main, ['continue-learning', 'weekly-activity', 'recent-activity'])).toBe(true);
    expect(inOrder(side, ['dashboard-stats', 'difficulty-distribution', 'daily-checklist', 'recommendations'])).toBe(true);
    expect(main).not.toContain('data-testid="daily-checklist"');
    expect(html).toMatch(/<aside [^>]*data-testid="dashboard-sidebar" aria-label="[^"]+"/);
  });

  it('a short hero: a decorative inline illustration (no image request) hidden from assistive technology', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toMatch(/<svg aria-hidden="true" viewBox="0 0 320 120"/);
    expect(html).not.toMatch(/<img /);
  });

  it('recommendations say how they are chosen and never claim to be AI or personalised', () => {
    progressStore.progress = emptyAccount;
    const html = render();
    expect(html).toMatch(/data-testid="recommendations-basis"[^>]*>The next algorithms in the course order that you have not completed/);
    expect(html).not.toMatch(/\bAI\b|personali[sz]ed|for you/i);
  });
});

describe('Dashboard v2 — continue learning details', () => {
  const inProgress = (algorithmId: string): AlgorithmTrack => ({
    algorithmId, status: 'in_progress', stepsCompleted: 0, totalSteps: 0, lastStepIndex: 1, executionCount: 0, lastActivityAt: new Date().toISOString(),
  });

  it("an algorithm on a learning path: the path's level, the milestone's estimate and real progress through the path", () => {
    progressStore.progress = activeAccount;
    // Binary Search is milestone 2 of Track 1 (Linear Search, Binary Search, Two Pointer); Linear Search is explored too
    progressStore.tracks = [{ ...inProgress('linear-search'), lastActivityAt: '2026-10-01T00:00:00Z' }, inProgress('binary-search')];
    const html = render();
    expect(html).toMatch(/data-testid="continue-level"[^>]*>Beginner path</);
    expect(html).toMatch(/data-testid="continue-estimate"[^>]*>.*About 25 min \(estimate\)</);
    expect(html).toMatch(/data-testid="continue-path-progress"[^>]*>2 of 3 explored</);
    expect(html).toMatch(/role="progressbar" aria-label="Learning path progress" aria-valuemin="0" aria-valuemax="3" aria-valuenow="2"/);
    const resume = html.match(/<a [^>]*data-testid="continue-resume"[^>]*>Resume Binary Search/)![0];
    expect(resume).toContain('href="/visualizer"');
  });

  it('an algorithm on no learning path: no level, estimate or path progress is invented', () => {
    progressStore.progress = activeAccount;
    progressStore.tracks = [inProgress('heap-sort')];
    const html = render();
    expect(html).not.toContain('data-testid="continue-path"');
    expect(html).toContain('Not part of a learning path yet, so there is no path progress or time estimate.');
  });
});
