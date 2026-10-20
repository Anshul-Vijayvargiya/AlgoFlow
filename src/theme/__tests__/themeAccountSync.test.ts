import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserProfile } from '../../api';
import { useAuthStore } from '../../store/useAuthStore';
import { startTheme, useThemeStore } from '../../store/useThemeStore';
import { THEME_STORAGE_KEY, type ThemeEnvironment, type ThemeMediaQuery, type ThemePreference } from '../theme';
import { startThemeAccountSync, type SaveThemeToAccount } from '../themeAccountSync';

function user(theme: ThemePreference = 'dark', id = 'u1'): UserProfile {
  return {
    id,
    name: 'Ada',
    email: 'ada@algoflow.io',
    role: 'USER',
    accountStatus: 'active',
    preferences: { theme, preferredLanguage: 'cpp', dailyGoalMinutes: 30 },
    streakDays: 0,
    solvedCount: 0,
    algorithmsLearned: 0,
    progressPercent: 0,
  };
}

/** a device: storage, OS colour scheme and <html> */
function device(stored?: string) {
  const data = new Map<string, string>(stored === undefined ? [] : [[THEME_STORAGE_KEY, stored]]);
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql: ThemeMediaQuery = {
    matches: false,
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
  };
  const attrs: Record<string, string> = {};
  const env: ThemeEnvironment = {
    storage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    matchMedia: () => mql,
    root: { setAttribute: (n, v) => void (attrs[n] = v), style: { colorScheme: '' } },
  };
  return {
    env,
    data,
    shown: () => attrs['data-theme'],
    osChange: (light: boolean) => {
      mql.matches = light;
      for (const l of [...listeners]) l({ matches: light });
    },
  };
}

/** a save function whose calls can be resolved or failed one by one */
function fakeAccount() {
  const calls: { theme: ThemePreference; resolve: (u: UserProfile) => void; reject: (e: Error) => void }[] = [];
  const save: SaveThemeToAccount = theme =>
    new Promise((resolve, reject) => {
      calls.push({ theme, resolve, reject });
    });
  return { save, calls };
}

const flush = () => new Promise(r => setTimeout(r, 0));
let stop: (() => void) | null = null;

beforeEach(() => {
  useAuthStore.setState({ user: null });
  useThemeStore.setState({ accountSync: 'idle' });
});
afterEach(() => {
  stop?.();
  stop = null;
  vi.restoreAllMocks();
});

describe('theme ↔ account sync', () => {
  it('signed out: a change applies and stays on the device; nothing is sent', () => {
    const d = device();
    startTheme(d.env);
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useThemeStore.getState().setPreference('light');
    expect(d.shown()).toBe('light');
    expect(d.data.get(THEME_STORAGE_KEY)).toBe('light');
    expect(account.calls).toEqual([]);
  });

  it('signed in: a change applies at once and is saved to the account; the profile copy follows', async () => {
    const d = device('dark');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useThemeStore.getState().setPreference('light');
    expect(d.shown()).toBe('light'); // before the server answers
    expect(useThemeStore.getState().accountSync).toBe('saving');
    await flush();
    expect(account.calls.map(c => c.theme)).toEqual(['light']);
    account.calls[0].resolve(user('light'));
    await flush();
    expect(useThemeStore.getState().accountSync).toBe('saved');
    expect(useAuthStore.getState().user!.preferences.theme).toBe('light');
  });

  it('a failed save keeps the device choice, does not throw, and reports the failure', async () => {
    const d = device('dark');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    expect(() => useThemeStore.getState().setPreference('light')).not.toThrow();
    await flush();
    account.calls[0].reject(new Error('Unable to connect to the server.'));
    await flush();
    expect(useThemeStore.getState()).toMatchObject({ preference: 'light', resolvedTheme: 'light', accountSync: 'error' });
    expect(d.shown()).toBe('light');
    expect(d.data.get(THEME_STORAGE_KEY)).toBe('light');
    expect(useAuthStore.getState().user!.preferences.theme).toBe('dark'); // the account copy is unchanged
    // the next change tries again
    useThemeStore.getState().setPreference('system');
    await flush();
    expect(account.calls.map(c => c.theme)).toEqual(['light', 'system']);
  });

  it('saves run one at a time, in order, so the last choice is the one the account ends with', async () => {
    const d = device('dark');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useThemeStore.getState().setPreference('light');
    useThemeStore.getState().setPreference('system');
    await flush();
    expect(account.calls.map(c => c.theme)).toEqual(['light']); // the second waits for the first
    account.calls[0].resolve(user('light'));
    await flush();
    expect(account.calls.map(c => c.theme)).toEqual(['light', 'system']);
    expect(useThemeStore.getState().accountSync).toBe('saving'); // the earlier success does not claim "saved"
    account.calls[1].resolve(user('system'));
    await flush();
    expect(useThemeStore.getState().accountSync).toBe('saved');
    expect(useAuthStore.getState().user!.preferences.theme).toBe('system');
  });

  it('OS changes under "system" are not saved (only the resolved theme changes)', async () => {
    const d = device('system');
    startTheme(d.env);
    useAuthStore.setState({ user: user('system') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    d.osChange(true);
    d.osChange(false);
    await flush();
    expect(account.calls).toEqual([]);
  });

  it('choosing the value the account already has sends nothing', async () => {
    const d = device('light');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useThemeStore.getState().setPreference('dark');
    await flush();
    expect(account.calls).toEqual([]);
  });

  it('sign-in on a device with no choice of its own adopts the account theme (and stores it)', () => {
    const d = device();
    startTheme(d.env);
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useAuthStore.setState({ user: user('light') }); // login / session restore
    expect(useThemeStore.getState().preference).toBe('light');
    expect(d.shown()).toBe('light');
    expect(d.data.get(THEME_STORAGE_KEY)).toBe('light');
    expect(account.calls).toEqual([]); // adopting is not written back
  });

  it('a session already restored when sync starts is reconciled too', () => {
    const d = device();
    startTheme(d.env);
    useAuthStore.setState({ user: user('system') });
    stop = startThemeAccountSync(fakeAccount().save);
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('sign-in on a device with its own choice keeps it (a local Light is never silently reset)', async () => {
    const d = device('light');
    startTheme(d.env);
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useAuthStore.setState({ user: user('dark') });
    expect(useThemeStore.getState().preference).toBe('light');
    expect(d.shown()).toBe('light');
    await flush();
    expect(account.calls).toEqual([]); // and nothing is written at sign-in
  });

  it('an invalid account value is ignored at sign-in', () => {
    const d = device();
    startTheme(d.env);
    stop = startThemeAccountSync(fakeAccount().save);
    useAuthStore.setState({ user: { ...user(), preferences: { ...user().preferences, theme: 'neon' as ThemePreference } } });
    expect(useThemeStore.getState().preference).toBe('dark');
  });

  it('signing out keeps the device theme and clears the account status', async () => {
    const d = device('dark');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useThemeStore.getState().setPreference('light');
    await flush();
    account.calls[0].reject(new Error('offline'));
    await flush();
    useAuthStore.setState({ user: null }); // logout
    expect(useThemeStore.getState()).toMatchObject({ preference: 'light', accountSync: 'idle' });
    expect(d.shown()).toBe('light');
    expect(d.data.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('a save that finishes after a different user signed in does not touch their profile', async () => {
    const d = device('dark');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark', 'u1') });
    const account = fakeAccount();
    stop = startThemeAccountSync(account.save);
    useThemeStore.getState().setPreference('light');
    await flush();
    useAuthStore.setState({ user: user('system', 'u2') });
    account.calls[0].resolve(user('light', 'u1'));
    await flush();
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u2', preferences: { theme: 'system' } });
  });

  it('stopping removes both subscriptions', async () => {
    const d = device('dark');
    startTheme(d.env);
    useAuthStore.setState({ user: user('dark') });
    const account = fakeAccount();
    startThemeAccountSync(account.save)();
    useThemeStore.getState().setPreference('light');
    await flush();
    expect(account.calls).toEqual([]);
  });
});
