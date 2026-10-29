import type {
  ApiClient,
  UserProfile,
  NoteRecord,
  NotesListResponse,
  UserProgressData,
  AlgorithmTrack,
  VisualizerActivityResult,
  ExecutionLanguages,
  ExecutionLanguageId,
  RunResult,
  TraceRunResult,
  TutorStatus,
  TutorQuestion,
  TutorReply,
  LegacyActivityReport,
  AlgorithmProgressReset,
  ProblemsListResponse,
  SubmissionRecord,
  SubmissionResult,
  AdminMetrics,
  AdminUserItem,
  AdminAuditItem,
} from './client';
import { normalizeRole } from './client';
import { resolveApiRuntime } from '../config/deployment';
import type { PracticeProblem } from '../types/algorithm';

// '/api' in development (Vite proxy) and tests; deployed builds must set VITE_API_BASE_URL (see src/config/deployment.ts)
const API_BASE = resolveApiRuntime(import.meta.env).baseUrl;

export type UnauthorizedHandler = () => void;
let onUnauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorizedHandler = handler;
}

export class HttpError extends Error {
  status: number;
  /** the server's machine-readable reason, when it sends one (e.g. 'daily_quota_exceeded') */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function sanitizeUserProfile(raw: any): UserProfile {
  return {
    id: String(raw.id || raw._id || ''),
    name: String(raw.name || ''),
    email: String(raw.email || ''),
    avatarUrl: raw.avatarUrl,
    role: normalizeRole(raw.role),
    accountStatus: raw.accountStatus === 'suspended' ? 'suspended' : 'active',
    preferences: {
      // unknown or missing values fall back to dark, the default
      theme: ['dark', 'light', 'galaxy', 'sunset', 'system'].includes(raw.preferences?.theme) ? raw.preferences.theme : 'dark',
      preferredLanguage: ['cpp', 'c', 'java', 'python'].includes(raw.preferences?.preferredLanguage)
        ? raw.preferences.preferredLanguage
        : 'cpp',
      dailyGoalMinutes: Number(raw.preferences?.dailyGoalMinutes || 30),
    },
    streakDays: Number(raw.streakDays || 0),
    solvedCount: Number(raw.solvedCount || 0),
    algorithmsLearned: Number(raw.algorithmsLearned || 0),
    progressPercent: Number(raw.progressPercent || 0),
  };
}

function sanitizeNote(raw: any): NoteRecord {
  return {
    id: String(raw.id || raw._id || ''),
    title: String(raw.title || ''),
    content: String(raw.content || ''),
    algorithmId: raw.algorithmId ? String(raw.algorithmId) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // network timeout

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    signal: options.signal || controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    clearTimeout(timeoutId);

    // If 401 Unauthorized on protected endpoint (NOT login or register)
    if (response.status === 401) {
      const isPublicAuthEndpoint = endpoint === '/auth/login' || endpoint === '/auth/register';
      if (!isPublicAuthEndpoint && onUnauthorizedHandler) {
        onUnauthorizedHandler();
      }
    }

    let data: any = {};
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new HttpError('Unable to connect to the backend server. Please ensure the backend is running.', 503);
        }
        data = { error: text };
      }
    }

    if (!response.ok) {
      throw new HttpError(data.error || `HTTP ${response.status}`, response.status, typeof data.code === 'string' ? data.code : undefined);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new HttpError('Request timed out. Please check your network connection.', 408);
    }
    throw err;
  }
}

export class HttpApiClient implements ApiClient {
  auth = {
    async login(email: string, pass: string): Promise<UserProfile> {
      const res = await request<{ user: UserProfile }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass }),
      });
      if (!res?.user) {
        throw new Error('Invalid response from authentication server.');
      }
      return sanitizeUserProfile(res.user);
    },

    async register(name: string, email: string, pass: string): Promise<UserProfile> {
      const res = await request<{ user: UserProfile }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password: pass }),
      });
      if (!res?.user) {
        throw new Error('Invalid response from authentication server.');
      }
      return sanitizeUserProfile(res.user);
    },

    async logout(): Promise<void> {
      await request('/auth/logout', { method: 'POST' });
    },

    async getCurrentUser(): Promise<UserProfile | null> {
      try {
        const res = await request<{ user: UserProfile }>('/auth/me');
        return res.user ? sanitizeUserProfile(res.user) : null;
      } catch {
        return null;
      }
    },
  };

  practice = {
    async getProblems(params?: {
      page?: number;
      limit?: number;
      difficulty?: string;
      category?: string;
      search?: string;
    }): Promise<ProblemsListResponse> {
      const q = new URLSearchParams();
      if (params?.page) q.append('page', String(params.page));
      if (params?.limit) q.append('limit', String(params.limit));
      if (params?.difficulty && params.difficulty !== 'All') q.append('difficulty', params.difficulty);
      if (params?.category && params.category !== 'All') q.append('category', params.category);
      if (params?.search) q.append('search', params.search);
      const queryStr = q.toString() ? `?${q.toString()}` : '';

      const res = await request<any>(`/problems${queryStr}`);
      if (Array.isArray(res)) {
        return {
          problems: res,
          total: res.length,
          page: 1,
          limit: res.length,
          totalPages: 1,
        };
      }
      return {
        problems: res.problems || [],
        total: Number(res.total || 0),
        page: Number(res.page || 1),
        limit: Number(res.limit || 20),
        totalPages: Number(res.totalPages || 1),
      };
    },

    async getProblemById(id: string): Promise<PracticeProblem | undefined> {
      return request<PracticeProblem>(`/problems/${id}`);
    },

    async submitSolution(problemId: string, language: string, code: string): Promise<SubmissionResult> {
      // judging runs every test on the execution service; the server stops starting tests after 60 s
      // (JUDGING_BUDGET_MS), so it answers within ~90 s: wait longer than that, never give up before the server does
      return request<SubmissionResult>(`/problems/${problemId}/submit`, { method: 'POST', body: JSON.stringify({ language, code }) }, 120_000);
    },

    async getSubmissions(problemId: string): Promise<SubmissionRecord[]> {
      const res = await request<{ submissions: SubmissionRecord[] }>(`/problems/${problemId}/submissions`);
      return res.submissions || [];
    },
  };

  progress = {
    async getUserProgress(): Promise<UserProgressData> {
      return request<UserProgressData>('/progress/summary');
    },

    async getAlgorithmTracks(): Promise<AlgorithmTrack[]> {
      const res = await request<{ tracks: AlgorithmTrack[] }>('/progress/algorithms');
      return res.tracks || [];
    },

    async recordActivity(activity: LegacyActivityReport): Promise<UserProgressData> {
      return request<UserProgressData>('/progress/activity', {
        method: 'POST',
        body: JSON.stringify(activity),
      });
    },

    async updateAlgorithmProgress(algorithmId: string, data: AlgorithmProgressReset): Promise<AlgorithmTrack> {
      return request<AlgorithmTrack>(`/progress/algorithms/${algorithmId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async recordVisualizerActivity(algorithmId: string, stepIndex: number): Promise<VisualizerActivityResult> {
      return request<VisualizerActivityResult>('/progress/visualizer-activity', {
        method: 'POST',
        body: JSON.stringify({ algorithmId, stepIndex }),
      });
    },
  };

  notes = {
    async getNotes(params?: {
      page?: number;
      limit?: number;
      search?: string;
      tag?: string;
      algorithmId?: string;
    }): Promise<NotesListResponse> {
      const q = new URLSearchParams();
      if (params?.page) q.append('page', String(params.page));
      if (params?.limit) q.append('limit', String(params.limit));
      if (params?.search) q.append('search', params.search);
      if (params?.tag && params.tag !== 'All') q.append('tag', params.tag);
      if (params?.algorithmId) q.append('algorithmId', params.algorithmId);
      const queryStr = q.toString() ? `?${q.toString()}` : '';

      const res = await request<any>(`/notes${queryStr}`);
      if (Array.isArray(res)) {
        return {
          notes: res.map(sanitizeNote),
          total: res.length,
          page: 1,
          limit: res.length,
          totalPages: 1,
        };
      }
      return {
        notes: (res.notes || []).map(sanitizeNote),
        total: Number(res.total || 0),
        page: Number(res.page || 1),
        limit: Number(res.limit || 20),
        totalPages: Number(res.totalPages || 1),
      };
    },

    async getNoteById(id: string): Promise<NoteRecord> {
      const res = await request<any>(`/notes/${id}`);
      return sanitizeNote(res);
    },

    async getTags(): Promise<string[]> {
      const res = await request<{ tags?: unknown[] }>('/notes/tags');
      return (res.tags ?? []).map(String);
    },

    async createNote(note: {
      title: string;
      content: string;
      tags?: string[];
      algorithmId?: string;
    }): Promise<NoteRecord> {
      const res = await request<any>('/notes', {
        method: 'POST',
        body: JSON.stringify(note),
      });
      return sanitizeNote(res);
    },

    async saveNote(note: Partial<NoteRecord> & { title: string; content: string }): Promise<NoteRecord> {
      if (note.id) {
        return this.updateNote(note.id, note);
      }
      return this.createNote(note);
    },

    async updateNote(
      id: string,
      note: Partial<{ title: string; content: string; tags: string[]; algorithmId: string }>
    ): Promise<NoteRecord> {
      const res = await request<any>(`/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(note),
      });
      return sanitizeNote(res);
    },

    async deleteNote(id: string): Promise<void> {
      await request(`/notes/${id}`, { method: 'DELETE' });
    },
  };

  settings = {
    async getProfile(): Promise<UserProfile> {
      const res = await request<{ user: UserProfile }>('/users/profile');
      return sanitizeUserProfile(res.user);
    },

    async updateProfile(data: {
      name?: string;
      preferences?: Partial<UserProfile['preferences']>;
    }): Promise<UserProfile> {
      const res = await request<{ user: UserProfile }>('/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return sanitizeUserProfile(res.user);
    },
  };

  admin = {
    async getMetrics(): Promise<AdminMetrics> {
      const res = await request<{ metrics: AdminMetrics }>('/admin/metrics');
      return res.metrics;
    },

    async getUsers(params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }): Promise<{
      users: AdminUserItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }> {
      const q = new URLSearchParams();
      if (params?.page) q.append('page', String(params.page));
      if (params?.limit) q.append('limit', String(params.limit));
      if (params?.search) q.append('search', params.search);
      if (params?.role && params.role !== 'All') q.append('role', params.role);
      if (params?.status && params.status !== 'All') q.append('status', params.status);
      const queryStr = q.toString() ? `?${q.toString()}` : '';

      return request(`/admin/users${queryStr}`);
    },

    async updateUserStatus(userId: string, status: 'active' | 'suspended'): Promise<AdminUserItem> {
      const res = await request<{ user: AdminUserItem }>(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return res.user;
    },

    async updateUserRole(userId: string, role: UserProfile['role']): Promise<AdminUserItem> {
      const res = await request<{ user: AdminUserItem }>(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      return res.user;
    },

    async getAuditLogs(params?: { page?: number; limit?: number }): Promise<{
      logs: AdminAuditItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }> {
      const q = new URLSearchParams();
      if (params?.page) q.append('page', String(params.page));
      if (params?.limit) q.append('limit', String(params.limit));
      const queryStr = q.toString() ? `?${q.toString()}` : '';

      return request(`/admin/audit-logs${queryStr}`);
    },

    async createProblem(problemData: Partial<PracticeProblem>): Promise<PracticeProblem> {
      const res = await request<{ problem: PracticeProblem }>('/admin/problems', {
        method: 'POST',
        body: JSON.stringify(problemData),
      });
      return res.problem;
    },

    async updateProblem(id: string, problemData: Partial<PracticeProblem>): Promise<PracticeProblem> {
      const res = await request<{ problem: PracticeProblem }>(`/admin/problems/${id}`, {
        method: 'PUT',
        body: JSON.stringify(problemData),
      });
      return res.problem;
    },

    async deleteProblem(id: string): Promise<void> {
      await request(`/admin/problems/${id}`, { method: 'DELETE' });
    },
  };

  execution = {
    async getLanguages(): Promise<ExecutionLanguages> {
      return request<ExecutionLanguages>('/run/languages');
    },

    async run(body: { language: ExecutionLanguageId; source: string; stdin: string }): Promise<RunResult> {
      // the provider may queue and compile (Java) before running. One run takes at most ~40 s on the server (a 20 s
      // result deadline plus request timeouts), so wait longer than that
      return request<RunResult>('/run', { method: 'POST', body: JSON.stringify(body) }, 45_000);
    },

    async trace(body: { language: ExecutionLanguageId; source: string; stdin: string }): Promise<TraceRunResult> {
      // the server verifies the trace before returning it; the Playground verifies it again before showing it
      return request<TraceRunResult>('/run/trace', { method: 'POST', body: JSON.stringify(body) }, 45_000);
    },
  };

  tutor = {
    async getStatus(): Promise<TutorStatus> {
      return request<TutorStatus>('/tutor/status');
    },

    async ask(question: TutorQuestion): Promise<TutorReply> {
      // the server waits up to 20 s for the model
      return request<TutorReply>('/tutor/messages', { method: 'POST', body: JSON.stringify(question) }, 30_000);
    },
  };
}

export const httpApiClient = new HttpApiClient();
