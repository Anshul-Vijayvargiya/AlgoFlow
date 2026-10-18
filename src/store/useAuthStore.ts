import { create } from 'zustand';
import { apiClient, setUnauthorizedHandler } from '../api';
import type { UserProfile } from '../api';


// ── Error normalisation ────────────────────────────────────────────────────
// Maps raw backend / network error messages to safe, user-friendly copy.
// NEVER expose raw DB errors, stack traces, or internal server messages.
function normalizeAuthError(raw: unknown, context: 'login' | 'register'): string {
  const msg = raw instanceof Error ? raw.message.toLowerCase() : String(raw).toLowerCase();

  // Network / connectivity failures
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('unable to connect')
  ) {
    return 'Unable to connect to the server. Please check your connection and try again.';
  }

  if (context === 'login') {
    if (
      msg.includes('invalid') ||
      msg.includes('incorrect') ||
      msg.includes('wrong') ||
      msg.includes('credentials') ||
      msg.includes('unauthorized') ||
      msg.includes('401')
    ) {
      return 'Invalid email or password.';
    }
    if (msg.includes('too many') || msg.includes('rate limit') || msg.includes('429')) {
      return 'Too many login attempts. Please wait a few minutes and try again.';
    }
    return 'Sign in failed. Please check your credentials and try again.';
  }

  if (context === 'register') {
    if (
      msg.includes('duplicate') ||
      msg.includes('already exists') ||
      msg.includes('already in use') ||
      msg.includes('11000') || // MongoDB duplicate key code
      msg.includes('409')
    ) {
      return 'An account with this email already exists.';
    }

    if (msg.includes('too many') || msg.includes('rate limit') || msg.includes('429')) {
      return 'Too many requests. Please wait a few minutes and try again.';
    }
    return 'Registration failed. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<boolean>;
  register: (name: string, email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (email: string, pass: string) => {
    set({ isLoading: true, error: null });
    try {
      const u = await apiClient.auth.login(email, pass);
      set({ user: u, isLoading: false });
      return true;
    } catch (err) {
      set({ isLoading: false, error: normalizeAuthError(err, 'login') });
      return false;
    }
  },

  register: async (name: string, email: string, pass: string) => {
    set({ isLoading: true, error: null });
    try {
      const u = await apiClient.auth.register(name, email, pass);
      set({ user: u, isLoading: false });
      return true;
    } catch (err) {
      set({ isLoading: false, error: normalizeAuthError(err, 'register') });
      return false;
    }
  },

  logout: async () => {
    try {
      await apiClient.auth.logout();
    } finally {
      set({ user: null });
    }
  },

  fetchCurrentUser: async () => {
    set({ isLoading: true });
    try {
      const u = await apiClient.auth.getCurrentUser();
      set({ user: u, isLoading: false, isInitialized: true });
    } catch {
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },

  clearError: () => set({ error: null }),
}));

// Session expiration: when a protected API request encounters an expired session (HTTP 401),
// clear the stale authenticated user without entering a duplicate logout or redirect loop.
setUnauthorizedHandler(() => {
  if (useAuthStore.getState().user) {
    useAuthStore.setState({ user: null });
  }
});

