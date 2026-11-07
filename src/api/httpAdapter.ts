import type {
  ApiClient,
  UserProfile,
  NoteRecord,
  NotesListResponse,
  RevisionRecord,
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
  TodayProgress,
  RecentActivityEvent,
} from './client';
import { normalizeRole } from './client';
import {
  clearSession,
  configureAuthSession,
  endSessionForLogout,
  getAccessToken,
  hasSession,
  notifySessionEndedIfGone,
  pendingRefresh,
  refreshAccessToken,
  resumeSession,
  startSession,
} from './authSession';
import { resolveApiRuntime } from '../config/deployment';
import { isRevisionReason, type RevisionReasonId, type RevisionStatus } from '../data/revisions';
import type { PracticeProblem } from '../types/algorithm';

// '/api' in development (Vite proxy) and tests; deployed builds must set VITE_API_BASE_URL (see src/config/deployment.ts)
const API_BASE = resolveApiRuntime(import.meta.env).baseUrl;

configureAuthSession({ apiBase: API_BASE });

export type UnauthorizedHandler = () => void;

/** called once the session has really ended (the server refused the refresh cookie, or revoked the session) */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  configureAuthSession({ onSessionEnded: handler });
}

/** endpoints that never carry or renew the access token: sign-in, the refresh itself, and logout */
const SESSION_ENDPOINTS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);
/** 401 codes that a refresh can fix: the access token expired, is missing, or is no longer readable */
const RENEWABLE_401_CODES = new Set(['ACCESS_TOKEN_EXPIRED', 'AUTH_REQUIRED', 'SESSION_INVALID']);
/** 401 codes that mean the session itself is over: no refresh can bring it back */
const TERMINAL_401_CODES = new Set(['SESSION_REVOKED', 'ACCOUNT_SUSPENDED']);

export class HttpError extends Error {
  status: number;
  /** the server's machine-readable reason, when it sends one (e.g. 'daily_quota_exceeded') */
  code?: string;
  /** a 429's wait before trying again, in ms (from Retry-After, else the body's retryAfterSeconds), when it says */
  retryAfterMs?: number;
  constructor(message: string, status: number, code?: string, retryAfterMs?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

/**
 * The wait a response asks for, in ms: the Retry-After header (delay-seconds or an HTTP date), else the JSON body's
 * retryAfterSeconds; undefined when neither is usable.
 */
export function retryAfterMsOf(header: string | null, body: unknown, now = Date.now()): number | undefined {
  if (header !== null && header.trim() !== '') {
    const v = header.trim();
    if (/^\d+$/.test(v)) return Number(v) * 1000;
    const at = Date.parse(v);
    if (!Number.isNaN(at)) return Math.max(0, at - now);
  }
  const seconds = (body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
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

/**
 * One API request. The access token (memory only) goes in the Authorization header. On a 401 that a refresh can fix,
 * it refreshes (one refresh shared by every request that needs it) and retries the request ONCE; a second 401 is
 * returned to the caller as an error, never refreshed again. A 401 does not by itself mean "signed out": that is
 * decided by the refresh (its 401) or by a code saying the session was revoked or the account suspended.
 */
function sanitizeRevision(raw: any): RevisionRecord {
  return {
    algorithmId: String(raw.algorithmId || ''),
    status: raw.status === 'revised' ? 'revised' : 'pending',
    reason: isRevisionReason(raw.reason) ? raw.reason : undefined,
    revisedAt: raw.revisedAt ? String(raw.revisedAt) : undefined,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 10_000, isRetry = false): Promise<T> {
  const sessionEndpoint = SESSION_ENDPOINTS.has(endpoint.split('?')[0]);
  // a refresh is running: wait for its token instead of sending the one it replaces
  if (!sessionEndpoint) await pendingRefresh();
  const sentToken = sessionEndpoint ? null : getAccessToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // network timeout

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    signal: options.signal || controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    clearTimeout(timeoutId);

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

    const code = typeof data.code === 'string' ? data.code : undefined;
    if (response.status === 401 && !sessionEndpoint) {
      if (code && TERMINAL_401_CODES.has(code)) {
        clearSession();
        notifySessionEndedIfGone();
      } else if (!isRetry && hasSession() && (!code || RENEWABLE_401_CODES.has(code))) {
        // another request already renewed the token while this one was out: just retry with it
        const current = getAccessToken();
        if (current && current !== sentToken) return request<T>(endpoint, options, timeoutMs, true);
        const outcome = await refreshAccessToken();
        if (outcome === 'refreshed' || (getAccessToken() && getAccessToken() !== sentToken)) {
          return request<T>(endpoint, options, timeoutMs, true);
        }
        if (outcome === 'ended') notifySessionEndedIfGone();
        // 'unavailable': the session may be fine; report this request's error without signing anyone out
      }
    }

    if (!response.ok) {
      const retryAfterMs = response.status === 429 ? retryAfterMsOf(response.headers.get('Retry-After'), data) : undefined;
      throw new HttpError(data.error || `HTTP ${response.status}`, response.status, code, retryAfterMs);
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

interface SignInResponse {
  user?: UserProfile;
  accessToken?: string;
  accessTokenExpiresAt?: string;
}

/** login / register: keep the access token in memory (the refresh token arrived as an HttpOnly cookie) */
function acceptSignIn(res: SignInResponse): UserProfile {
  if (!res?.user || typeof res.accessToken !== 'string') {
    throw new Error('Invalid response from authentication server.');
  }
  startSession(res.accessToken, String(res.accessTokenExpiresAt ?? ''));
  return sanitizeUserProfile(res.user);
}

export class HttpApiClient implements ApiClient {
  auth = {
    async login(email: string, pass: string): Promise<UserProfile> {
      const res = await request<SignInResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass }),
      });
      return acceptSignIn(res);
    },

    async register(name: string, email: string, pass: string): Promise<UserProfile> {
      const res = await request<SignInResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password: pass }),
      });
      return acceptSignIn(res);
    },

    /** ends this device's session. Local state is cleared first and whatever the server answers. */
    async logout(): Promise<void> {
      const token = await endSessionForLogout();
      await request('/auth/logout', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    },

    /** ends every session of the account, on every device */
    async logoutAll(): Promise<void> {
      try {
        await request('/auth/logout-all', { method: 'POST' });
      } finally {
        const token = await endSessionForLogout();
        // in case logout-all could not be reached: at least this device's session ends
        if (token) await request('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
      }
    },

    /** the signed-in user; on page load (no access token in memory yet) the session is resumed with the refresh cookie */
    async getCurrentUser(): Promise<UserProfile | null> {
      try {
        if (!getAccessToken() && !(await resumeSession())) return null;
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

    async getToday(): Promise<TodayProgress> {
      return request<TodayProgress>('/progress/today');
    },

    async setDailyGoal(goalId: string, done: boolean): Promise<TodayProgress> {
      return request<TodayProgress>(`/progress/today/goals/${encodeURIComponent(goalId)}`, {
        method: 'PUT',
        body: JSON.stringify({ done }),
      });
    },

    async getRecentActivity(limit = 8): Promise<RecentActivityEvent[]> {
      const res = await request<{ events: RecentActivityEvent[] }>(`/progress/recent?limit=${limit}`);
      return res.events || [];
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

  revisions = {
    async getRevisions(): Promise<RevisionRecord[]> {
      const res = await request<{ revisions?: unknown[] }>('/revisions');
      return (res.revisions ?? []).map(sanitizeRevision);
    },

    async markForRevision(algorithmId: string, reason: RevisionReasonId | null): Promise<RevisionRecord> {
      const res = await request<unknown>(`/revisions/${encodeURIComponent(algorithmId)}`, { method: 'PUT', body: JSON.stringify({ reason }) });
      return sanitizeRevision(res);
    },

    async setRevisionStatus(algorithmId: string, status: RevisionStatus): Promise<RevisionRecord> {
      const res = await request<unknown>(`/revisions/${encodeURIComponent(algorithmId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      return sanitizeRevision(res);
    },

    async removeRevision(algorithmId: string): Promise<void> {
      await request(`/revisions/${encodeURIComponent(algorithmId)}`, { method: 'DELETE' });
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
