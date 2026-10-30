import type {
  ApiClient,
  UserProfile,
  NoteRecord,
  UserProgressData,
  AlgorithmTrack,
  VisualizerActivityResult,
  LegacyActivityReport,
  AlgorithmProgressReset,
  ExecutionLanguages,
  ExecutionLanguageId,
  RunResult,
  TraceRunResult,
  TutorStatus,
  TutorQuestion,
  TutorReply,
  SubmissionRecord,
  SubmissionResult,
  TodayProgress,
  RecentActivityEvent,
} from './client';
import { FAKE_LANGUAGE_LABELS, FakeProviderUnavailableError, fakeExecute } from '../execution/fakeExecution';
import { outputsMatch } from '../execution/judgeCore';
import { PRACTICE_PROBLEMS } from '../data/practiceProblems';
import { normalizeRole } from './client';
import {
  AVAILABLE_ALGORITHM_COUNT,
  IMPLEMENTED_ALGORITHM_COUNT,
  IMPLEMENTED_TOPICS,
  isImplementedAlgorithm,
  topicOfAlgorithm,
} from '../data/algorithmCatalog';
import type { PracticeProblem } from '../types/algorithm';
import { ALGORITHM_NAV } from '../data/algorithmMetadata';
import { currentStreak, isManualGoal, longestStreak, nextUtcMidnight } from '../data/dailyGoals';


/**
 * The seeded practice problems as the server returns them (public part only: hidden tests are server-only). The mock
 * API judges against these visible tests with the fake execution rules, for UI tests; it never runs code.
 */
const MOCK_PROBLEMS: PracticeProblem[] = PRACTICE_PROBLEMS.map(p => ({
  id: p.problemId,
  title: p.title,
  difficulty: p.difficulty,
  category: p.category,
  tags: p.tags,
  description: p.description,
  starterCode: p.starterCode,
  testCases: p.visibleTests,
  autoJudged: true,
  solved: false,
}));

/** practice history kept on the device (the server keeps it in the database) */
const MOCK_PRACTICE_KEY = 'algoflow_practice_state';
interface MockPracticeState {
  submissions: Record<string, SubmissionRecord[]>;
}
function readPracticeState(): MockPracticeState {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOCK_PRACTICE_KEY) ?? 'null');
    if (parsed && typeof parsed.submissions === 'object') return parsed;
  } catch {
    // unreadable: start again
  }
  return { submissions: {} };
}

/** the server's judging rules (server/services/judging/judge.ts) applied with the fake execution rules */
function mockJudge(source: string, tests: { input: string; expected: string }[]): SubmissionResult {
  const base = { judged: true, runtimeMs: 1, memoryMb: 1, testsTotal: tests.length };
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    let r;
    try {
      r = fakeExecute(source, t.input);
    } catch (err) {
      if (!(err instanceof FakeProviderUnavailableError)) throw err;
      return { ...base, status: 'JUDGING_ERROR', passed: false, testsPassed: i, errorCode: 'provider_unavailable',
        message: 'Judging error: The code execution service is unavailable, so judging could not finish. Your solution was not judged; please try again.' };
    }
    const tally = `${i} of ${tests.length} tests passed`;
    const failedTest = (extra: object = {}) => ({ number: i + 1, hidden: false, input: t.input, expected: t.expected, ...extra });
    if (r.status === 'compile_error') return { ...base, status: 'COMPILATION_ERROR', passed: false, testsPassed: 0, compileOutput: r.compileOutput, message: 'Compilation failed: no tests were run.' };
    if (r.status === 'timeout') return { ...base, status: 'TIME_LIMIT_EXCEEDED', passed: false, testsPassed: i, failedTest: failedTest(), message: `Time limit exceeded on test ${i + 1} (${tally}).` };
    if (r.status === 'runtime_error') return { ...base, status: 'RUNTIME_ERROR', passed: false, testsPassed: i, failedTest: failedTest({ stderr: r.stderr, actual: r.stdout }), message: `Runtime error on test ${i + 1} (${tally}).` };
    if (!outputsMatch(r.stdout, t.expected)) return { ...base, status: 'WRONG_ANSWER', passed: false, testsPassed: i, failedTest: failedTest({ actual: r.stdout }), message: `Wrong answer on test ${i + 1} (${tally}).` };
  }
  return { ...base, status: 'ACCEPTED', passed: true, testsPassed: tests.length, message: `Accepted: all ${tests.length} tests passed.` };
}

const INITIAL_NOTES: NoteRecord[] = [
  {
    id: 'n1',
    title: 'Bubble Sort Key Optimization',
    content: 'If no swaps take place in an entire outer loop pass, the array is already sorted. We can exit early to achieve O(n) best-case time complexity.',
    algorithmId: 'bubble-sort',
    tags: ['Sorting', 'Optimization'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    title: 'Binary Search Mid Calculation Overflow',
    content: 'Always calculate mid using `low + (high - low) / 2` instead of `(low + high) / 2` to avoid integer overflow in languages with fixed integer widths like C, C++, and Java.',
    algorithmId: 'binary-search',
    tags: ['Searching', 'Trick'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

/** visualizer activity recorded by the mock API, kept on the device so it survives reloads (as the server keeps it) */
const MOCK_VISUALIZER_ACTIVITY_KEY = 'algoflow_visualizer_activity';
/** the daily goals ticked on this device: date → goal ids (the server keeps them per account) */
const MOCK_DAILY_GOALS_KEY = 'algoflow_daily_goals';
// the AI Tutor's test controls (see tutor below and e2e/tests/tutor.spec.ts)
const MOCK_TUTOR_STATUS_KEY = 'algoflow_mock_tutor_status';
const MOCK_TUTOR_RELEASE_EVENT = 'algoflow-mock-tutor-release';
interface MockVisualizerActivity {
  /** date → algorithm → furthest step viewed (step index + 1) */
  days: Record<string, Record<string, number>>;
  tracks: Record<string, { lastStepIndex: number; lastActivityAt: string }>;
}
const mockDateString = (d: Date) => d.toISOString().slice(0, 10);

/** the last 7 UTC days (today last), as the server builds them: walkthroughs and submissions recorded on each */
/** the UTC days of the practice submissions made on this device (judging failures are not practice) */
function mockSubmissionDays(): string[] {
  return Object.values(readPracticeState().submissions)
    .flat()
    .filter(s => s.status !== 'JUDGING_ERROR' && s.createdAt)
    .map(s => s.createdAt!.slice(0, 10));
}

/** the days with recorded activity (walkthroughs and submissions), as the server's activity log has them */
function mockActiveDays(activity: MockVisualizerActivity): string[] {
  return [...new Set([...Object.keys(activity.days).filter(d => Object.keys(activity.days[d]).length > 0), ...mockSubmissionDays()])];
}

function readMockDailyGoals(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOCK_DAILY_GOALS_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // unreadable: start again
  }
  return {};
}

function mockWeeklyActivity(activity: MockVisualizerActivity): UserProgressData['weeklyActivity'] {
  const submittedOn = mockSubmissionDays();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (6 - i));
    const date = mockDateString(d);
    const stepped = activity.days[date] ?? {};
    return {
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
      date,
      // estimated as the server estimates them: 5 minutes per practice submission
      minutes: 5 * submittedOn.filter(day => day === date).length,
      steps: Object.values(stepped).reduce((a, b) => a + b, 0),
      submissions: submittedOn.filter(day => day === date).length,
      walkthroughs: Object.keys(stepped).length,
    };
  });
}
function readMockVisualizerActivity(): MockVisualizerActivity {
  // a storage failure is reported to the caller, like a failed request
  const saved = localStorage.getItem(MOCK_VISUALIZER_ACTIVITY_KEY);
  try {
    const parsed = JSON.parse(saved ?? 'null');
    if (parsed && typeof parsed.days === 'object' && typeof parsed.tracks === 'object') return parsed;
  } catch {
    // unreadable: start again
  }
  return { days: {}, tracks: {} };
}

/** every note kept on the device (seeded with the demo notes on first use) */
function readMockNotes(): NoteRecord[] {
  const saved = localStorage.getItem('algoflow_notes');
  if (!saved) localStorage.setItem('algoflow_notes', JSON.stringify(INITIAL_NOTES));
  return saved ? JSON.parse(saved) : [...INITIAL_NOTES];
}

export class MockApiClient implements ApiClient {
  auth = {
    async login(email: string, _pass?: string): Promise<UserProfile> {
      const user: UserProfile = {
        id: 'u1',
        name: 'DSA Engineer',
        email,
        streakDays: 14,
        solvedCount: 42,
        // matches the progress data: nothing can be completed yet
        algorithmsLearned: 0,
        progressPercent: 0,
        role: email?.includes('admin') ? 'ADMIN' : 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'cpp',
          dailyGoalMinutes: 30,
        },
      };
      localStorage.setItem('algoflow_user', JSON.stringify(user));
      return user;
    },
    async register(name: string, email: string, _pass?: string): Promise<UserProfile> {
      const user: UserProfile = {
        id: 'u_' + Date.now(),
        name,
        email,
        streakDays: 1,
        solvedCount: 0,
        algorithmsLearned: 0,
        progressPercent: 0,
        role: 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'cpp',
          dailyGoalMinutes: 30,
        },
      };
      localStorage.setItem('algoflow_user', JSON.stringify(user));
      return user;
    },
    async logout(): Promise<void> {
      localStorage.removeItem('algoflow_user');
    },
    async getCurrentUser(): Promise<UserProfile | null> {
      const saved = localStorage.getItem('algoflow_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            role: normalizeRole(parsed.role),
            accountStatus: parsed.accountStatus || 'active',
            preferences: parsed.preferences || {
              theme: 'dark',
              preferredLanguage: 'cpp',
              dailyGoalMinutes: 30,
            },
          };
        } catch {
          return null;
        }
      }
      return {
        id: 'u1',
        name: 'Alex Chen',
        email: 'alex@algoflow.io',
        streakDays: 14,
        solvedCount: 42,
        // matches the progress data: nothing can be completed yet
        algorithmsLearned: 0,
        progressPercent: 0,
        role: 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'cpp',
          dailyGoalMinutes: 30,
        },
      };
    },
  };

  practice = {
    async getProblems(params?: { page?: number; limit?: number; difficulty?: string; category?: string; search?: string }): Promise<{ problems: PracticeProblem[]; total: number; page: number; limit: number; totalPages: number }> {
      const { submissions } = readPracticeState();
      const query = params?.search?.trim().toLowerCase() ?? '';
      const filtered = MOCK_PROBLEMS
        .map(p => ({ ...p, solved: (submissions[p.id] ?? []).some(s => s.passed) }))
        .filter(p => !params?.difficulty || params.difficulty === 'All' || p.difficulty === params.difficulty)
        .filter(p => !params?.category || params.category === 'All' || p.category === params.category)
        .filter(p => !query || [p.title, p.description, p.category, ...p.tags].some(value => value.toLowerCase().includes(query)));
      const total = filtered.length;
      const limit = Math.min(50, Math.max(1, Math.floor(params?.limit ?? 20)));
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.min(totalPages, Math.max(1, Math.floor(params?.page ?? 1)));
      const start = (page - 1) * limit;
      return { problems: filtered.slice(start, start + limit), total, page, limit, totalPages };
    },
    async getProblemById(id: string): Promise<PracticeProblem | undefined> {
      const res = await this.getProblems();
      return res.problems.find((p) => p.id === id);
    },
    async submitSolution(problemId: string, language: string, code: string): Promise<SubmissionResult> {
      const problem = MOCK_PROBLEMS.find(p => p.id === problemId);
      if (!problem) throw new Error('Problem not found.');
      const result = mockJudge(code, problem.testCases);
      const state = readPracticeState();
      const id = `sub_${Date.now()}`;
      const record: SubmissionRecord = {
        id, problemId, language, code, status: result.status, passed: result.passed, runtimeMs: result.runtimeMs, memoryMb: result.memoryMb,
        message: result.message, testsPassed: result.testsPassed, testsTotal: result.testsTotal,
        failedTestNumber: result.failedTest?.number, failedTestHidden: result.failedTest?.hidden, createdAt: new Date().toISOString(),
      };
      state.submissions[problemId] = [record, ...(state.submissions[problemId] ?? [])];
      localStorage.setItem(MOCK_PRACTICE_KEY, JSON.stringify(state));
      return { ...result, submissionId: id };
    },
    async getSubmissions(problemId: string): Promise<SubmissionRecord[]> {
      return readPracticeState().submissions[problemId] ?? [];
    },
  };

  progress = {
    async getUserProgress(): Promise<UserProgressData> {
      // everything is derived from what was done on this device, the same way the server derives it from its records
      const activity = readMockVisualizerActivity();
      const { submissions } = readPracticeState();
      const solved = MOCK_PROBLEMS.filter(p => (submissions[p.id] ?? []).some(s => s.passed));
      const solvedOf = (difficulty: string) => solved.filter(p => p.difficulty === difficulty).length;
      const activeDays = mockActiveDays(activity);
      const tracks = Object.keys(activity.tracks).filter(isImplementedAlgorithm);
      const topicCoverage = IMPLEMENTED_TOPICS.map(({ topic, algorithmIds }) => ({
        topic,
        implemented: algorithmIds.length,
        practised: algorithmIds.filter(id => tracks.includes(id)).length,
        completed: 0,
      }));
      return {
        weeklyActivity: mockWeeklyActivity(activity),
        difficultyDistribution: [
          { name: 'Easy', value: solvedOf('Easy'), color: '#10B981' },
          { name: 'Medium', value: solvedOf('Medium'), color: '#F59E0B' },
          { name: 'Hard', value: solvedOf('Hard'), color: '#F43F5E' },
        ],
        topicProficiency: topicCoverage.map(t => ({ topic: t.topic, score: 0 })),
        topicCoverage,
        algorithmTotals: {
          available: AVAILABLE_ALGORITHM_COUNT,
          implemented: IMPLEMENTED_ALGORITHM_COUNT,
          practised: tracks.length,
          completed: 0,
        },
        streakDays: currentStreak(activeDays, mockDateString(new Date())),
        longestStreakDays: longestStreak(activeDays),
        solvedCount: solved.length,
        // nothing can be completed: there is no verified completion rule
        algorithmsLearned: 0,
        overallProgressPercent: 0,
      };
    },
    async getAlgorithmTracks(): Promise<AlgorithmTrack[]> {
      const { tracks } = readMockVisualizerActivity();
      return Object.entries(tracks)
        .filter(([id]) => isImplementedAlgorithm(id))
        .map(([algorithmId, t]) => ({
          algorithmId,
          topic: topicOfAlgorithm(algorithmId) ?? undefined,
          status: 'in_progress' as const,
          stepsCompleted: 0,
          totalSteps: 0,
          lastStepIndex: t.lastStepIndex,
          executionCount: 0,
          lastActivityAt: t.lastActivityAt,
        }));
    },
    async recordActivity(activity: LegacyActivityReport): Promise<UserProgressData> {
      // the same rules as POST /api/progress/activity: visualizer steps of an implemented algorithm, kept as the day's
      // maximum; minutes are ignored; no track is created
      if ((activity.activityType ?? 'visualizer_step') !== 'visualizer_step') throw new Error('Validation failed');
      if (!isImplementedAlgorithm(activity.algorithmId)) throw new Error('Unknown algorithm.');
      if (!Number.isInteger(activity.steps) || activity.steps < 2) throw new Error('Validation failed');
      const stored = readMockVisualizerActivity();
      const day = (stored.days[mockDateString(new Date())] ??= {});
      day[activity.algorithmId] = Math.max(day[activity.algorithmId] ?? 0, activity.steps);
      localStorage.setItem(MOCK_VISUALIZER_ACTIVITY_KEY, JSON.stringify(stored));
      return this.getUserProgress();
    },
    async updateAlgorithmProgress(algorithmId: string, data: AlgorithmProgressReset): Promise<AlgorithmTrack> {
      // the same rules as PUT /api/progress/algorithms/:id: only a reset of an existing record
      if (!isImplementedAlgorithm(algorithmId)) throw new Error('Unknown algorithm.');
      if (data?.status !== 'not_started') throw new Error('Validation failed');
      const stored = readMockVisualizerActivity();
      const track = stored.tracks[algorithmId];
      if (!track) throw new Error('No progress has been recorded for this algorithm.');
      // the mock keeps only started tracks, so a reset removes it
      delete stored.tracks[algorithmId];
      localStorage.setItem(MOCK_VISUALIZER_ACTIVITY_KEY, JSON.stringify(stored));
      return {
        algorithmId,
        topic: topicOfAlgorithm(algorithmId) ?? undefined,
        status: 'not_started',
        stepsCompleted: 0,
        totalSteps: 0,
        lastStepIndex: track.lastStepIndex,
        executionCount: 0,
        lastActivityAt: track.lastActivityAt,
      };
    },
    async recordVisualizerActivity(algorithmId: string, stepIndex: number): Promise<VisualizerActivityResult> {
      // the same rules as POST /api/progress/visualizer-activity: implemented algorithms only, step >= 1, furthest step kept
      if (!isImplementedAlgorithm(algorithmId)) throw new Error('Unknown algorithm.');
      if (!Number.isInteger(stepIndex) || stepIndex < 1) throw new Error('Validation failed');
      const now = new Date();
      const date = mockDateString(now);
      const activity = readMockVisualizerActivity();
      const day = (activity.days[date] ??= {});
      day[algorithmId] = Math.max(day[algorithmId] ?? 0, stepIndex + 1);
      activity.tracks[algorithmId] = {
        lastStepIndex: Math.max(activity.tracks[algorithmId]?.lastStepIndex ?? 0, stepIndex),
        lastActivityAt: now.toISOString(),
      };
      localStorage.setItem(MOCK_VISUALIZER_ACTIVITY_KEY, JSON.stringify(activity));
      return { recorded: true, algorithmId, date, stepsViewed: day[algorithmId] };
    },
    async getToday(): Promise<TodayProgress> {
      // the same counts as GET /api/progress/today, from this device's records
      const now = new Date();
      const date = mockDateString(now);
      const todays = Object.values(readPracticeState().submissions).flat().filter(s => s.createdAt?.slice(0, 10) === date);
      return {
        date,
        resetsAt: nextUtcMidnight(now).toISOString(),
        verified: {
          walkthroughs: Object.keys(readMockVisualizerActivity().days[date] ?? {}).length,
          submissions: todays.filter(s => s.status !== 'JUDGING_ERROR').length,
          accepted: todays.filter(s => s.status === 'ACCEPTED').length,
        },
        manualCompleted: (readMockDailyGoals()[date] ?? []).filter(isManualGoal),
      };
    },
    async setDailyGoal(goalId: string, done: boolean): Promise<TodayProgress> {
      // the same rules as PUT /api/progress/today/goals/:goalId: only manual goals, idempotent, past days kept
      if (!isManualGoal(goalId)) throw new Error('Only your own goals can be ticked; the others are checked from your activity.');
      if (typeof done !== 'boolean') throw new Error('Validation failed');
      const goals = readMockDailyGoals();
      const date = mockDateString(new Date());
      const ticked = new Set(goals[date] ?? []);
      if (done) ticked.add(goalId);
      else ticked.delete(goalId);
      goals[date] = [...ticked];
      localStorage.setItem(MOCK_DAILY_GOALS_KEY, JSON.stringify(goals));
      return this.getToday();
    },
    async getRecentActivity(limit = 8): Promise<RecentActivityEvent[]> {
      // the same events as GET /api/progress/recent, from this device's records
      const { submissions } = readPracticeState();
      const activity = readMockVisualizerActivity();
      const subs: RecentActivityEvent[] = Object.entries(submissions).flatMap(([problemId, list]) =>
        list
          .filter(s => s.createdAt)
          .map(s => ({
            id: `submission:${s.id}`,
            kind: 'submission' as const,
            targetId: problemId,
            title: MOCK_PROBLEMS.find(p => p.id === problemId)?.title ?? problemId,
            status: s.status,
            language: s.language,
            at: s.createdAt!,
          }))
      );
      const walks: RecentActivityEvent[] = Object.entries(activity.days).flatMap(([date, stepped]) =>
        Object.entries(stepped)
          .filter(([id]) => isImplementedAlgorithm(id))
          .map(([id, steps]) => {
            // the device keeps the time of the latest walkthrough of each algorithm; earlier days only have their date
            const last = activity.tracks[id]?.lastActivityAt;
            return {
              id: `walkthrough:${date}:${id}`,
              kind: 'walkthrough' as const,
              targetId: id,
              title: ALGORITHM_NAV.find(a => a.id === id)?.name ?? id,
              date,
              stepsViewed: steps,
              at: last?.slice(0, 10) === date ? last : `${date}T00:00:00.000Z`,
            };
          })
      );
      return [...subs, ...walks].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    },
  };

  notes = {
    // the server's rules (GET /api/notes): filter all notes, newest first, then one page
    async getNotes(params: { page?: number; limit?: number; search?: string; tag?: string; algorithmId?: string } = {}): Promise<{ notes: NoteRecord[]; total: number; page: number; limit: number; totalPages: number }> {
      const page = params.page ?? 1;
      const limit = params.limit ?? 20;
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid query parameters.');
      const q = params.search?.trim().toLowerCase();
      const matching = readMockNotes()
        .filter(n => !params.tag || params.tag === 'All' || n.tags.includes(params.tag))
        .filter(n => !params.algorithmId || n.algorithmId === params.algorithmId)
        .filter(n => !q || [n.title, n.content, ...n.tags].some(f => f.toLowerCase().includes(q)))
        .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
      return {
        notes: matching.slice((page - 1) * limit, page * limit),
        total: matching.length,
        page,
        limit,
        totalPages: Math.ceil(matching.length / limit) || 1,
      };
    },
    async getTags(): Promise<string[]> {
      return [...new Set(readMockNotes().flatMap(n => n.tags))].filter(Boolean).sort((x, y) => x.localeCompare(y));
    },
    async getNoteById(id: string): Promise<NoteRecord> {
      const notes = readMockNotes();
      const n = notes.find((item) => item.id === id);
      if (!n) throw new Error('Note not found');
      return n;
    },
    async createNote(note: { title: string; content: string; tags?: string[]; algorithmId?: string }): Promise<NoteRecord> {
      const notes = readMockNotes();
      const newNote: NoteRecord = {
        id: 'n_' + Date.now(),
        title: note.title,
        content: note.content,
        tags: note.tags || ['DSA'],
        algorithmId: note.algorithmId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      notes.unshift(newNote);
      localStorage.setItem('algoflow_notes', JSON.stringify(notes));
      return newNote;
    },
    async saveNote(note: Partial<NoteRecord> & { title: string; content: string }): Promise<NoteRecord> {
      if (note.id) {
        return this.updateNote(note.id, note);
      }
      return this.createNote(note);
    },
    async updateNote(id: string, note: any): Promise<NoteRecord> {
      const notes = readMockNotes();
      const existing = notes.find((n) => n.id === id);
      if (!existing) throw new Error('Note not found');
      if (note.title !== undefined) existing.title = note.title;
      if (note.content !== undefined) existing.content = note.content;
      if (note.tags !== undefined) existing.tags = note.tags;
      if (note.algorithmId !== undefined) existing.algorithmId = note.algorithmId;
      existing.updatedAt = new Date().toISOString();
      localStorage.setItem('algoflow_notes', JSON.stringify(notes));
      return existing;
    },
    async deleteNote(id: string): Promise<void> {
      const notes = readMockNotes();
      const filtered = notes.filter((n) => n.id !== id);
      localStorage.setItem('algoflow_notes', JSON.stringify(filtered));
    },
  };

  settings = {
    async getProfile(): Promise<UserProfile> {
      return (await mockApiClient.auth.getCurrentUser())!;
    },
    async updateProfile(data: any): Promise<UserProfile> {
      const current = await mockApiClient.settings.getProfile();
      if (data.name) current.name = data.name;
      if (data.preferences) current.preferences = { ...current.preferences, ...data.preferences };
      localStorage.setItem('algoflow_user', JSON.stringify(current));
      return current;
    },
  };


  admin = {
    async getMetrics(): Promise<any> {
      return {
        totalUsers: 10,
        totalProblems: 5,
        totalSubmissions: 30,
        activeUsersPastWeek: 8,
        serverUptimeSeconds: 3600,
        timestamp: new Date().toISOString(),
      };
    },
    async getUsers(): Promise<any> {
      return { users: [], total: 0, page: 1, limit: 10, totalPages: 1 };
    },
    async updateUserStatus(userId: string, status: any): Promise<any> {
      return { id: userId, accountStatus: status };
    },
    async updateUserRole(userId: string, role: any): Promise<any> {
      return { id: userId, role };
    },
    async getAuditLogs(): Promise<any> {
      return { logs: [], total: 0, page: 1, limit: 10, totalPages: 1 };
    },
    async createProblem(p: any): Promise<any> {
      return p;
    },
    async updateProblem(_id: string, p: any): Promise<any> {
      return p;
    },
    async deleteProblem(_id: string): Promise<void> {},
  };

  // the same fake as the server's EXECUTION_PROVIDER=fake: it never runs code and says so in its labels
  execution = {
    async getLanguages(): Promise<ExecutionLanguages> {
      return {
        available: true,
        provider: 'fake',
        languages: (Object.keys(FAKE_LANGUAGE_LABELS) as ExecutionLanguageId[]).map(id => ({ id, label: FAKE_LANGUAGE_LABELS[id] })),
        limits: { sourceMaxChars: 50_000, stdinMaxChars: 10_000, dailyPerUser: 100 },
        usedToday: 0,
        tracing: { languages: ['python'], mode: 'recorded', maxSteps: 1500 },
      };
    },
    async run({ language, source, stdin }: { language: ExecutionLanguageId; source: string; stdin: string }): Promise<RunResult> {
      try {
        const result = fakeExecute(source, stdin);
        return { ...result, truncated: false, language: { id: language, label: FAKE_LANGUAGE_LABELS[language] }, provider: 'fake', usedToday: 1, dailyLimit: 100 };
      } catch (err) {
        if (err instanceof FakeProviderUnavailableError) {
          throw new Error('The code execution service is unavailable right now. Your program was not run; please try again later.');
        }
        throw err;
      }
    },
    // the recorded example traces only (as the server's fake provider): this API never runs code
    async trace({ language, source, stdin }: { language: ExecutionLanguageId; source: string; stdin: string }): Promise<TraceRunResult> {
      if (language !== 'python') throw new Error('Step-by-step tracing is available for Python only.');
      if (source.includes('FAKE:UNAVAILABLE')) throw new Error('The code execution service is unavailable right now. Your program was not run; please try again later.');
      // loaded on demand, so the recorded traces are not in the main bundle
      const { recordedTraceFor, NOT_RECORDED_MESSAGE } = await import('../execution/recordedTraces');
      const recorded = recordedTraceFor(source, stdin);
      if (!recorded) throw new Error(NOT_RECORDED_MESSAGE);
      return { status: 'traced', trace: recorded.trace, message: null, stderr: '', timeMs: null, memoryKb: null, language: { id: language, label: FAKE_LANGUAGE_LABELS[language] }, provider: 'fake', usedToday: 0, dailyLimit: 100 };
    },
  };

  // automated tests only (the mock API never ships in a deployable build): never a model, and it says so.
  // A test picks the server state the drawer sees with localStorage[MOCK_TUTOR_STATUS_KEY]: 'unavailable' (no
  // provider), 'gemini' (the status a Gemini server reports, to check the data-use notice; answers stay fake) or
  // 'error-once' (the next status check fails). A question containing FAKE:HOLD waits for MOCK_TUTOR_RELEASE_EVENT.
  tutor = {
    async getStatus(): Promise<TutorStatus> {
      const scenario = localStorage.getItem(MOCK_TUTOR_STATUS_KEY);
      const limits = { questionMaxChars: 500, dailyPerUser: 30 };
      if (scenario === 'error-once') {
        localStorage.removeItem(MOCK_TUTOR_STATUS_KEY);
        throw new Error('Network error. Please check your connection.');
      }
      if (scenario === 'unavailable') return { available: false, provider: null, model: null, limits, usedToday: 0 };
      if (scenario === 'gemini') return { available: true, provider: 'gemini', model: 'gemini-mock-model', limits, usedToday: 0 };
      return { available: true, provider: 'fake', model: 'fake-tutor', limits, usedToday: 0 };
    },
    async ask(q: TutorQuestion): Promise<TutorReply> {
      if (q.question.includes('FAKE:HOLD')) await new Promise(resolve => window.addEventListener(MOCK_TUTOR_RELEASE_EVENT, resolve, { once: true }));
      if (q.question.includes('FAKE:UNAVAILABLE')) throw new Error('The AI Tutor could not get an answer right now. Please try again.');
      return {
        answer: `[Test answer from the fake provider] Algorithm: ${q.algorithmId}. Step: ${q.stepIndex + 1}. Turns received: ${q.history.length + 1}. Question: ${q.question.slice(0, 120)}`,
        truncated: q.question.includes('FAKE:TRUNCATED'),
        model: 'fake-tutor',
        usedToday: 1,
        dailyLimit: 30,
      };
    },
  };
}

export const mockApiClient = new MockApiClient();
export const apiClient = mockApiClient;


