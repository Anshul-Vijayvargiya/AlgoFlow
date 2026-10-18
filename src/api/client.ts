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
  theme: 'dark' | 'system';
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

export interface SubmissionRecord {
  id: string;
  problemId: string;
  language: string;
  code: string;
  status: 'SUBMITTED' | 'PENDING' | 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR';
  passed: boolean;
  runtimeMs: number;
  memoryMb: number;
  message?: string;
  createdAt: string;
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
  submitSolution(
    problemId: string,
    language: string,
    code: string
  ): Promise<{
    passed: boolean;
    runtimeMs: number;
    memoryMb: number;
    message: string;
    submissionId?: string;
  }>;
  getSubmissions(problemId: string): Promise<SubmissionRecord[]>;
}

export interface UserProgressData {
  weeklyActivity: { day: string; minutes: number; steps: number }[];
  difficultyDistribution: { name: string; value: number; color: string }[];
  topicProficiency: { topic: string; score: number }[];
  streakDays: number;
  solvedCount: number;
  algorithmsLearned: number;
  overallProgressPercent: number;
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
  recordActivity(activity: {
    minutes?: number;
    steps?: number;
    algorithmId?: string;
    activityType?: 'visualizer_step' | 'algorithm_completed' | 'problem_submitted' | 'problem_solved';
  }): Promise<UserProgressData>;
  updateAlgorithmProgress(
    algorithmId: string,
    data: {
      status?: 'not_started' | 'in_progress' | 'completed';
      stepsCompleted?: number;
      totalSteps?: number;
      lastStepIndex?: number;
      topic?: string;
    }
  ): Promise<AlgorithmTrack>;
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

export interface ApiClient {
  auth: AuthApi;
  practice: PracticeApi;
  progress: ProgressApi;
  notes: NotesApi;
  settings: SettingsApi;
  admin: AdminApi;
}
