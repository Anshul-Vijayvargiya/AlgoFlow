import type { PracticeProblem } from '../types/algorithm';

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export function normalizeRole(role: unknown): UserRole {
  if (typeof role !== 'string') return 'USER';
  const upper = role.trim().toUpperCase();
  if (upper === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (upper === 'ADMIN') return 'ADMIN';
  return 'USER';
}

export interface UserPreferences {
  theme: 'dark' | 'light' | 'system';
  preferredLanguage: 'cpp' | 'c' | 'java' | 'python';
  dailyGoalMinutes: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  accountStatus: 'active' | 'suspended';
  preferences: UserPreferences;
  streakDays: number;
  solvedCount: number;
  algorithmsLearned: number;
  progressPercent: number;
}

export interface AuthApi {
  login(email: string, pass: string): Promise<UserProfile>;
  register(name: string, email: string, pass: string): Promise<UserProfile>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<UserProfile | null>;
}

/** SUBMITTED: recorded without a verdict (not auto-judged, or made before judging existed); PENDING is legacy */
export type SubmissionStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'RUNTIME_ERROR'
  | 'COMPILATION_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'JUDGING_ERROR';

export interface SubmissionRecord {
  id: string;
  problemId: string;
  language: string;
  code: string;
  status: SubmissionStatus;
  passed: boolean;
  runtimeMs: number;
  memoryMb: number;
  message?: string;
  /** judged submissions only */
  testsPassed?: number;
  testsTotal?: number;
  failedTestNumber?: number;
  failedTestHidden?: boolean;
  createdAt: string;
}

/** what the server returned for a submission; a failed request rejects instead (no result is invented) */
export interface SubmissionResult {
  submissionId?: string;
  status: SubmissionStatus;
  /** false: recorded without a verdict (the problem is not set up for automatic judging) */
  judged: boolean;
  passed: boolean;
  runtimeMs: number;
  memoryMb: number;
  message: string;
  testsPassed?: number;
  testsTotal?: number;
  /** the first failing test; input, expected and actual output only for a visible test */
  failedTest?: { number: number; hidden: boolean; input?: string; expected?: string; actual?: string; stderr?: string };
  compileOutput?: string;
  /** JUDGING_ERROR: which execution-service failure stopped judging */
  errorCode?: string;
}

export interface ProblemsListResponse {
  problems: PracticeProblem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PracticeApi {
  getProblems(params?: {
    page?: number;
    limit?: number;
    difficulty?: string;
    category?: string;
    search?: string;
  }): Promise<ProblemsListResponse>;
  getProblemById(id: string): Promise<PracticeProblem | undefined>;
  submitSolution(problemId: string, language: string, code: string): Promise<SubmissionResult>;
  getSubmissions(problemId: string): Promise<SubmissionRecord[]>;
}

export interface UserProgressData {
  /**
   * The last 7 days (UTC), oldest first; the last is today. `minutes` is an estimate (5 per practice attempt) and
   * `steps` the visualizer steps viewed. `date`, `submissions` (practice submissions, judging failures excluded) and
   * `walkthroughs` (algorithms stepped through in the visualizer, each once per day) are counts of real records;
   * optional because older servers do not send them.
   */
  weeklyActivity: { day: string; date?: string; minutes: number; steps: number; submissions?: number; walkthroughs?: number }[];
  difficultyDistribution: { name: string; value: number; color: string }[];
  topicProficiency: { topic: string; score: number }[];
  streakDays: number;
  solvedCount: number;
  algorithmsLearned: number;
  overallProgressPercent: number;
  /** algorithm counts from the server's algorithm list (absent from servers older than this field) */
  algorithmTotals?: AlgorithmTotals;
  /** per topic with implemented algorithms: how many the user has explored and completed */
  topicCoverage?: TopicCoverage[];
}

export interface AlgorithmTotals {
  /** every algorithm listed in the app */
  available: number;
  /** listed algorithms that can be visualized */
  implemented: number;
  /** implemented algorithms the user has stepped through (in progress or completed) */
  practised: number;
  /** implemented algorithms marked completed */
  completed: number;
}

export interface TopicCoverage {
  topic: string;
  implemented: number;
  practised: number;
  completed: number;
}

export interface LegacyActivityReport {
  algorithmId: string;
  steps: number;
  /** accepted for older clients and ignored: time is not measured */
  minutes?: number;
  activityType?: 'visualizer_step';
}

export interface AlgorithmProgressReset {
  status: 'not_started';
}

export interface VisualizerActivityResult {
  recorded: boolean;
  algorithmId: string;
  date: string;
  /** the furthest step viewed today (step index + 1) */
  stepsViewed: number;
}

export interface AlgorithmTrack {
  algorithmId: string;
  topic?: string;
  status: 'not_started' | 'in_progress' | 'completed';
  stepsCompleted: number;
  totalSteps: number;
  lastStepIndex: number;
  executionCount: number;
  completedAt?: string;
  lastActivityAt: string;
}

export interface ProgressApi {
  getUserProgress(): Promise<UserProgressData>;
  getAlgorithmTracks(): Promise<AlgorithmTrack[]>;
  /** legacy: reports the furthest step viewed (steps = step index + 1, at least 2) of an implemented algorithm today */
  recordActivity(activity: LegacyActivityReport): Promise<UserProgressData>;
  /** legacy: resets the user's own existing record for an implemented algorithm */
  updateAlgorithmProgress(algorithmId: string, data: AlgorithmProgressReset): Promise<AlgorithmTrack>;
  /** records that the signed-in user stepped to stepIndex (>= 1) of a visualizer trace; idempotent on the server */
  recordVisualizerActivity(algorithmId: string, stepIndex: number): Promise<VisualizerActivityResult>;
}

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  algorithmId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NotesListResponse {
  notes: NoteRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotesApi {
  getNotes(params?: {
    page?: number;
    limit?: number;
    search?: string;
    tag?: string;
    algorithmId?: string;
  }): Promise<NotesListResponse>;
  getNoteById(id: string): Promise<NoteRecord>;
  createNote(note: {
    title: string;
    content: string;
    tags?: string[];
    algorithmId?: string;
  }): Promise<NoteRecord>;
  saveNote(note: Partial<NoteRecord> & { title: string; content: string }): Promise<NoteRecord>;
  updateNote(
    id: string,
    note: Partial<{ title: string; content: string; tags: string[]; algorithmId: string }>
  ): Promise<NoteRecord>;
  deleteNote(id: string): Promise<void>;
  /** every tag the user has used, across all their notes */
  getTags(): Promise<string[]>;
}

export interface SettingsApi {
  getProfile(): Promise<UserProfile>;
  updateProfile(data: {
    name?: string;
    preferences?: Partial<UserPreferences>;
  }): Promise<UserProfile>;
}

export interface AdminMetrics {
  totalUsers: number;
  totalProblems: number;
  totalSubmissions: number;
  activeUsersPastWeek: number;
  serverUptimeSeconds: number;
  timestamp: string;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus: 'active' | 'suspended';
  streakDays: number;
  solvedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditItem {
  id: string;
  adminId: string;
  adminName?: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}

export interface AdminApi {
  getMetrics(): Promise<AdminMetrics>;
  getUsers(params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }): Promise<{
    users: AdminUserItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  updateUserStatus(userId: string, status: 'active' | 'suspended'): Promise<AdminUserItem>;
  updateUserRole(userId: string, role: UserRole): Promise<AdminUserItem>;
  getAuditLogs(params?: { page?: number; limit?: number }): Promise<{
    logs: AdminAuditItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  createProblem(problemData: Partial<PracticeProblem>): Promise<PracticeProblem>;
  updateProblem(id: string, problemData: Partial<PracticeProblem>): Promise<PracticeProblem>;
  deleteProblem(id: string): Promise<void>;
}

export type ExecutionLanguageId = 'c' | 'cpp' | 'java' | 'python';

export interface ExecutionLanguages {
  /** false when the server has no execution provider configured */
  available: boolean;
  provider: 'judge0' | 'fake' | null;
  /** with the provider's real compiler / runtime versions */
  languages: { id: ExecutionLanguageId; label: string }[];
  limits: { sourceMaxChars: number; stdinMaxChars: number; dailyPerUser: number };
  usedToday: number;
}

export interface RunResult {
  status: 'success' | 'compile_error' | 'runtime_error' | 'timeout';
  stdout: string;
  stderr: string;
  compileOutput: string;
  /** output was longer than the server returns */
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  timeMs: number | null;
  memoryKb: number | null;
  language?: { id: ExecutionLanguageId; label: string };
  provider: 'judge0' | 'fake';
  usedToday: number;
  dailyLimit: number;
}

export interface ExecutionApi {
  getLanguages(): Promise<ExecutionLanguages>;
  /** runs the program on the server's execution provider; rejects (never resolves) when there is no genuine result */
  run(request: { language: ExecutionLanguageId; source: string; stdin: string }): Promise<RunResult>;
}

export interface TutorStatus {
  /** false when the server has no AI provider configured (the tutor is then unavailable, never simulated) */
  available: boolean;
  provider: 'gemini' | 'fake' | null;
  model: string | null;
  limits: { questionMaxChars: number; dailyPerUser: number };
  usedToday: number;
}

export interface TutorQuestion {
  algorithmId: string;
  /** the visualizer's input; the server re-runs the algorithm on it to build the context */
  input: { array: number[]; target: number | null; index: number | null };
  stepIndex: number;
  language: ExecutionLanguageId;
  question: string;
  /** the conversation so far (kept only in the browser) */
  history: { role: 'user' | 'model'; text: string }[];
}

export interface TutorReply {
  answer: string;
  truncated: boolean;
  model: string;
  usedToday: number;
  dailyLimit: number;
}

export interface TutorApi {
  getStatus(): Promise<TutorStatus>;
  /** rejects (never resolves with an invented answer) when there is no genuine answer */
  ask(question: TutorQuestion): Promise<TutorReply>;
}

export interface ApiClient {
  auth: AuthApi;
  practice: PracticeApi;
  progress: ProgressApi;
  notes: NotesApi;
  settings: SettingsApi;
  admin: AdminApi;
  execution: ExecutionApi;
  tutor: TutorApi;
}
