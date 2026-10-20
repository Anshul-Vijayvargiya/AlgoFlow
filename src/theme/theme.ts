/**
 * Theme core: the user's PREFERENCE ('dark' | 'light' | 'system') is stored; the RESOLVED theme ('dark' | 'light') is
 * what the page shows. 'system' resolves through the OS colour scheme and follows its changes.
 *
 * The resolved theme is applied as <html data-theme="…"> plus the color-scheme property; index.css scopes the light
 * values under [data-theme="light"], so dark stays the default. public/theme-init.js applies the same rules before
 * React renders (no first-paint flash); its behaviour is tested against this module, so keep the two in step.
 *
 * Everything browser-specific (storage, matchMedia, the root element) is passed in, so this module has no globals.
 */

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

/** localStorage key shared with public/theme-init.js */
export const THEME_STORAGE_KEY = 'algoflow-theme';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';
/** 'system' is light only when the OS asks for light; anything else (or no matchMedia) is dark */
export const SYSTEM_LIGHT_QUERY = '(prefers-color-scheme: light)';

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The parts of MediaQueryList the controller uses (old Safari only has addListener / removeListener). */
export interface ThemeMediaQuery {
  matches: boolean;
  addEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  addListener?(listener: (event: { matches: boolean }) => void): void;
  removeListener?(listener: (event: { matches: boolean }) => void): void;
}

export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  style: { colorScheme: string };
}

export interface ThemeEnvironment {
  /** null when storage is unavailable (private mode, blocked cookies…) */
  storage: ThemeStorage | null;
  /** null when the browser has no matchMedia */
  matchMedia: ((query: string) => ThemeMediaQuery) | null;
  root: ThemeRoot;
}

export interface ThemeState {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
}

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'dark' || value === 'light' || value === 'system';

/** Any missing or unknown value falls back to dark. */
export const parseThemePreference = (value: unknown): ThemePreference =>
  isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;

export function readStoredPreference(storage: ThemeStorage | null): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** True when this device has a valid saved choice (as opposed to falling back to the dark default). */
export function hasStoredPreference(storage: ThemeStorage | null): boolean {
  try {
    return isThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Saves the preference; returns false (and changes nothing else) when storage is unavailable or full. */
export function writeStoredPreference(storage: ThemeStorage | null, preference: ThemePreference): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

export const resolveTheme = (preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme =>
  preference === 'system' ? (systemPrefersLight ? 'light' : 'dark') : preference;

export function applyResolvedTheme(root: ThemeRoot, theme: ResolvedTheme): void {
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

export interface ThemeController {
  getState(): ThemeState;
  /** stores and applies a new preference; listeners are told about the new state */
  setPreference(preference: ThemePreference): void;
  /** whether this device has its own saved choice (account sync only seeds devices without one) */
  hasStoredPreference(): boolean;
  /** returns the unsubscribe function */
  subscribe(listener: (state: ThemeState) => void): () => void;
  /** detaches the system listener and drops subscribers */
  destroy(): void;
}

/**
 * Reads the saved preference, applies the resolved theme to the root element, and keeps it applied: the OS listener
 * is attached only while the preference is 'system', so an explicit light / dark choice is never overridden.
 */
export function createThemeController(env: ThemeEnvironment): ThemeController {
  let preference = readStoredPreference(env.storage);
  let query: ThemeMediaQuery | null = null;
  try {
    query = env.matchMedia ? env.matchMedia(SYSTEM_LIGHT_QUERY) : null;
  } catch {
    query = null;
  }
  let systemPrefersLight = Boolean(query?.matches);
  let resolvedTheme: ResolvedTheme = resolveTheme(preference, systemPrefersLight);
  const subscribers = new Set<(state: ThemeState) => void>();
  let attached = false;

  const state = (): ThemeState => ({ preference, resolvedTheme });
  const apply = () => {
    resolvedTheme = resolveTheme(preference, systemPrefersLight);
    applyResolvedTheme(env.root, resolvedTheme);
    for (const s of subscribers) s(state());
  };

  const onSystemChange = (event: { matches: boolean }) => {
    systemPrefersLight = event.matches;
    if (preference === 'system') apply();
  };

  const attach = () => {
    if (attached || !query) return;
    if (query.addEventListener) query.addEventListener('change', onSystemChange);
    else query.addListener?.(onSystemChange);
    attached = true;
    // the OS may have changed while nothing was listening
    systemPrefersLight = query.matches;
  };
  const detach = () => {
    if (!attached || !query) return;
    if (query.removeEventListener) query.removeEventListener('change', onSystemChange);
    else query.removeListener?.(onSystemChange);
    attached = false;
  };
  const syncListener = () => (preference === 'system' ? attach() : detach());

  syncListener();
  apply();

  return {
    getState: state,
    setPreference(next) {
      preference = parseThemePreference(next);
      writeStoredPreference(env.storage, preference);
      syncListener();
      apply();
    },
    hasStoredPreference: () => hasStoredPreference(env.storage),
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    destroy() {
      detach();
      subscribers.clear();
    },
  };
}

/** The real browser environment; storage and matchMedia degrade to null rather than throwing. */
export function browserThemeEnvironment(): ThemeEnvironment {
  let storage: ThemeStorage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    storage,
    matchMedia: typeof window.matchMedia === 'function' ? q => window.matchMedia(q) : null,
    root: document.documentElement,
  };
}
