import { describe, it, expect, beforeEach } from 'vitest';
// loaded as text through Vite's ?raw import (typed by vite/client), so the app tsconfig needs no Node types
import initScript from '../../../public/theme-init.js?raw';
import {
  THEME_STORAGE_KEY,
  SYSTEM_LIGHT_QUERY,
  applyTheme,
  isThemePreference,
  createThemeController,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  resolveThemeName,
  writeStoredPreference,
  type ThemeEnvironment,
  type ThemeMediaQuery,
  type ThemeStorage,
} from '../theme';
import { startTheme, useThemeStore } from '../../store/useThemeStore';

// ─── fakes (Vitest runs in node: no DOM, no localStorage, no matchMedia) ─────────────────────────────────────────

function fakeStorage(initial: Record<string, string> = {}, fail: { get?: boolean; set?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const reads: string[] = [];
  const storage: ThemeStorage = {
    getItem(key) {
      reads.push(key);
      if (fail.get) throw new Error('SecurityError: storage is disabled');
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      if (fail.set) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
  };
  return { storage, data, reads };
}

type Listener = (event: { matches: boolean }) => void;

/** A MediaQueryList for (prefers-color-scheme: light); `legacy` has only addListener / removeListener (old Safari). */
function fakeSystem(prefersLight: boolean, legacy = false) {
  const listeners = new Set<Listener>();
  const queries: string[] = [];
  const mql: ThemeMediaQuery = { matches: prefersLight };
  if (legacy) {
    mql.addListener = l => listeners.add(l);
    mql.removeListener = l => listeners.delete(l);
  } else {
    mql.addEventListener = (_t, l) => listeners.add(l);
    mql.removeEventListener = (_t, l) => listeners.delete(l);
  }
  return {
    matchMedia: (q: string) => {
      queries.push(q);
      return mql;
    },
    listeners,
    queries,
    /** the OS switches its colour scheme */
    change(light: boolean) {
      mql.matches = light;
      for (const l of [...listeners]) l({ matches: light });
    },
  };
}

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return { attrs, setAttribute: (n: string, v: string) => void (attrs[n] = v), style: { colorScheme: '' } };
}

function env(opts: { stored?: string; prefersLight?: boolean; legacy?: boolean; storage?: ThemeStorage | null; noMatchMedia?: boolean } = {}) {
  const store = fakeStorage(opts.stored === undefined ? {} : { [THEME_STORAGE_KEY]: opts.stored });
  const system = fakeSystem(opts.prefersLight ?? false, opts.legacy);
  const root = fakeRoot();
  const e: ThemeEnvironment = {
    storage: opts.storage === undefined ? store.storage : opts.storage,
    matchMedia: opts.noMatchMedia ? null : system.matchMedia,
    root,
  };
  return { env: e, store, system, root, shown: () => [root.attrs['data-theme'], root.style.colorScheme] };
}

// ─── preference parsing and resolution ───────────────────────────────────────────────────────────────────────────

describe('theme preference', () => {
  it('missing or invalid values fall back to dark', () => {
    for (const v of [null, undefined, '', 'Dark', 'LIGHT', 'auto', 'blue', 42, {}, ' light', 'Galaxy', 'midnight', 'toString', '__proto__']) {
      expect(parseThemePreference(v), String(v)).toBe('dark');
      expect(isThemePreference(v), String(v)).toBe(false);
    }
    for (const v of ['dark', 'light', 'galaxy', 'sunset', 'system'] as const) expect(parseThemePreference(v)).toBe(v);
  });

  it('system resolves through the OS; explicit choices ignore it', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    for (const os of [true, false]) {
      expect(resolveTheme('light', os)).toBe('light');
      expect(resolveTheme('dark', os)).toBe('dark');
    }
  });

  it('reading and writing storage never throws', () => {
    expect(readStoredPreference(null)).toBe('dark');
    expect(readStoredPreference(fakeStorage({}, { get: true }).storage)).toBe('dark');
    expect(readStoredPreference(fakeStorage({ [THEME_STORAGE_KEY]: 'light' }).storage)).toBe('light');
    expect(writeStoredPreference(null, 'light')).toBe(false);
    expect(writeStoredPreference(fakeStorage({}, { set: true }).storage, 'light')).toBe(false);
    const ok = fakeStorage();
    expect(writeStoredPreference(ok.storage, 'system')).toBe(true);
    expect(ok.data.get(THEME_STORAGE_KEY)).toBe('system');
  });

  it('the named themes: each is itself (system aside), on its base — galaxy on dark, sunset on light — whatever the OS', () => {
    for (const os of [true, false]) {
      expect(resolveThemeName('galaxy', os)).toBe('galaxy');
      expect(resolveThemeName('sunset', os)).toBe('sunset');
      expect(resolveTheme('galaxy', os)).toBe('dark');
      expect(resolveTheme('sunset', os)).toBe('light');
    }
    // system only ever means the original two
    expect(resolveThemeName('system', true)).toBe('light');
    expect(resolveThemeName('system', false)).toBe('dark');
  });

  it('applying a theme sets data-theme (the base), data-palette (the theme) and color-scheme on the root', () => {
    const root = fakeRoot();
    const applied = () => [root.attrs['data-theme'], root.attrs['data-palette'], root.style.colorScheme];
    applyTheme(root, 'light');
    expect(applied()).toEqual(['light', 'light', 'light']);
    applyTheme(root, 'dark');
    expect(applied()).toEqual(['dark', 'dark', 'dark']);
    applyTheme(root, 'galaxy');
    expect(applied()).toEqual(['dark', 'galaxy', 'dark']);
    applyTheme(root, 'sunset');
    expect(applied()).toEqual(['light', 'sunset', 'light']);
  });
});

// ─── the controller ──────────────────────────────────────────────────────────────────────────────────────────────

describe('theme controller', () => {
  it('no saved preference: dark, applied to the DOM', () => {
    const t = env();
    const c = createThemeController(t.env);
    expect(c.getState()).toEqual({ preference: 'dark', theme: 'dark', resolvedTheme: 'dark' });
    expect(t.shown()).toEqual(['dark', 'dark']);
  });

  it('an invalid saved preference: dark', () => {
    const t = env({ stored: 'purple', prefersLight: true });
    expect(createThemeController(t.env).getState()).toEqual({ preference: 'dark', theme: 'dark', resolvedTheme: 'dark' });
    expect(t.shown()).toEqual(['dark', 'dark']);
  });

  it('explicit light and dark are applied regardless of the OS', () => {
    const light = env({ stored: 'light', prefersLight: false });
    expect(createThemeController(light.env).getState()).toEqual({ preference: 'light', theme: 'light', resolvedTheme: 'light' });
    expect(light.shown()).toEqual(['light', 'light']);
    const dark = env({ stored: 'dark', prefersLight: true });
    expect(createThemeController(dark.env).getState()).toEqual({ preference: 'dark', theme: 'dark', resolvedTheme: 'dark' });
    expect(dark.shown()).toEqual(['dark', 'dark']);
  });

  it('system resolves to the OS scheme, using the prefers-color-scheme: light query', () => {
    const light = env({ stored: 'system', prefersLight: true });
    expect(createThemeController(light.env).getState()).toEqual({ preference: 'system', theme: 'light', resolvedTheme: 'light' });
    expect(light.shown()).toEqual(['light', 'light']);
    expect(light.system.queries).toEqual([SYSTEM_LIGHT_QUERY]);
    const dark = env({ stored: 'system', prefersLight: false });
    expect(createThemeController(dark.env).getState().resolvedTheme).toBe('dark');
    // no matchMedia at all: system is dark
    expect(createThemeController(env({ stored: 'system', noMatchMedia: true }).env).getState().resolvedTheme).toBe('dark');
  });

  for (const legacy of [false, true]) {
    it(`OS changes are followed while system is selected${legacy ? ' (legacy addListener API)' : ''}`, () => {
      const t = env({ stored: 'system', prefersLight: false, legacy });
      const c = createThemeController(t.env);
      const seen: string[] = [];
      c.subscribe(s => seen.push(s.resolvedTheme));
      expect(t.system.listeners.size).toBe(1);
      t.system.change(true);
      expect(t.shown()).toEqual(['light', 'light']);
      t.system.change(false);
      expect(t.shown()).toEqual(['dark', 'dark']);
      expect(seen).toEqual(['light', 'dark']);
    });
  }

  it('OS changes never override an explicit light or dark choice (the listener is detached)', () => {
    const t = env({ stored: 'system', prefersLight: false });
    const c = createThemeController(t.env);
    c.setPreference('light');
    expect(t.system.listeners.size).toBe(0);
    t.system.change(false);
    t.system.change(true);
    t.system.change(false);
    expect(t.shown()).toEqual(['light', 'light']);
    c.setPreference('dark');
    t.system.change(true);
    expect(t.shown()).toEqual(['dark', 'dark']);
    // an explicit choice from the start never listens
    const explicit = env({ stored: 'light' });
    createThemeController(explicit.env);
    expect(explicit.system.listeners.size).toBe(0);
  });

  it('switching between all four themes applies each at once, stores it, and tells subscribers', () => {
    const t = env({ prefersLight: true });
    const c = createThemeController(t.env);
    const seen: string[] = [];
    c.subscribe(s => seen.push(`${s.preference}:${s.theme}:${s.resolvedTheme}`));
    for (const name of ['galaxy', 'sunset', 'light', 'dark'] as const) {
      c.setPreference(name);
      expect(t.store.data.get(THEME_STORAGE_KEY)).toBe(name);
      expect(t.root.attrs['data-palette']).toBe(name);
    }
    expect(seen).toEqual(['galaxy:galaxy:dark', 'sunset:sunset:light', 'light:light:light', 'dark:dark:dark']);
    expect(t.system.listeners.size).toBe(0); // a named theme never follows the OS
    // a saved named theme is restored as itself
    const again = env({ stored: 'sunset', prefersLight: false });
    expect(createThemeController(again.env).getState()).toEqual({ preference: 'sunset', theme: 'sunset', resolvedTheme: 'light' });
    expect([again.root.attrs['data-theme'], again.root.attrs['data-palette']]).toEqual(['light', 'sunset']);
  });

  it('returning to system picks up an OS change made while it was not listening', () => {
    const t = env({ stored: 'dark', prefersLight: false });
    const c = createThemeController(t.env);
    t.system.change(true); // nobody listening
    c.setPreference('system');
    expect(c.getState()).toEqual({ preference: 'system', theme: 'light', resolvedTheme: 'light' });
    expect(t.system.listeners.size).toBe(1);
  });

  it('setPreference stores the preference (not the resolved theme), applies it, and notifies subscribers', () => {
    const t = env({ prefersLight: true });
    const c = createThemeController(t.env);
    const seen: unknown[] = [];
    const unsubscribe = c.subscribe(s => seen.push(s));
    c.setPreference('system');
    expect(t.store.data.get(THEME_STORAGE_KEY)).toBe('system');
    expect(t.shown()).toEqual(['light', 'light']);
    c.setPreference('dark');
    expect(t.store.data.get(THEME_STORAGE_KEY)).toBe('dark');
    unsubscribe();
    c.setPreference('light');
    expect(seen).toEqual([{ preference: 'system', theme: 'light', resolvedTheme: 'light' }, { preference: 'dark', theme: 'dark', resolvedTheme: 'dark' }]);
  });

  it('listeners are cleaned up: switching away from system, and destroy()', () => {
    const t = env({ stored: 'system' });
    const c = createThemeController(t.env);
    expect(t.system.listeners.size).toBe(1);
    c.setPreference('system'); // no duplicate listener
    expect(t.system.listeners.size).toBe(1);
    c.destroy();
    expect(t.system.listeners.size).toBe(0);
    const legacy = env({ stored: 'system', legacy: true });
    const lc = createThemeController(legacy.env);
    lc.setPreference('dark');
    expect(legacy.system.listeners.size).toBe(0);
  });

  it('storage failures do not crash: reading falls back to dark, writing still applies the theme', () => {
    const blocked = fakeStorage({}, { get: true, set: true });
    const t = env({ storage: blocked.storage });
    const c = createThemeController(t.env);
    expect(c.getState().preference).toBe('dark');
    expect(() => c.setPreference('light')).not.toThrow();
    expect(t.shown()).toEqual(['light', 'light']);
    const none = env({ storage: null });
    expect(() => createThemeController(none.env).setPreference('system')).not.toThrow();
  });

  it('a throwing matchMedia is treated as "no system preference" (dark)', () => {
    const t = env({ stored: 'system' });
    t.env.matchMedia = () => {
      throw new Error('not supported');
    };
    expect(createThemeController(t.env).getState()).toEqual({ preference: 'system', theme: 'dark', resolvedTheme: 'dark' });
  });
});

// ─── the store mirrors the controller ────────────────────────────────────────────────────────────────────────────

describe('useThemeStore', () => {
  beforeEach(() => useThemeStore.setState({ preference: 'dark', theme: 'dark', resolvedTheme: 'dark' }));

  it('startTheme loads the saved preference into the store; setPreference goes through the controller', () => {
    const t = env({ stored: 'system', prefersLight: true });
    startTheme(t.env);
    expect(useThemeStore.getState()).toMatchObject({ preference: 'system', theme: 'light', resolvedTheme: 'light' });
    t.system.change(false);
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    useThemeStore.getState().setPreference('light');
    expect(useThemeStore.getState()).toMatchObject({ preference: 'light', theme: 'light', resolvedTheme: 'light' });
    expect(t.shown()).toEqual(['light', 'light']);
    expect(t.store.data.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restarting replaces the controller: the old one stops listening (one theme system only)', () => {
    const first = env({ stored: 'system' });
    startTheme(first.env);
    expect(first.system.listeners.size).toBe(1);
    const second = env({ stored: 'dark' });
    startTheme(second.env);
    expect(first.system.listeners.size).toBe(0);
    first.system.change(true);
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
  });
});

// ─── the first-paint script must agree with the controller ───────────────────────────────────────────────────────

describe('public/theme-init.js (runs before React)', () => {
  const script = initScript;

  /** runs the real script against fake window / document and returns what it applied */
  function runInitScript(opts: { storage: ThemeStorage | 'throws'; matchMedia: ((q: string) => ThemeMediaQuery) | null | 'throws' }) {
    const root = fakeRoot();
    const window = {
      get localStorage() {
        if (opts.storage === 'throws') throw new Error('SecurityError');
        return opts.storage;
      },
      matchMedia:
        opts.matchMedia === 'throws'
          ? () => {
              throw new Error('nope');
            }
          : (opts.matchMedia ?? undefined),
    };
    new Function('window', 'document', script)(window, { documentElement: root });
    return [root.attrs['data-theme'], root.attrs['data-palette'], root.style.colorScheme];
  }

  it('uses the same storage key and the same rules as the controller, in every case', () => {
    const storedValues = [undefined, 'dark', 'light', 'galaxy', 'sunset', 'system', 'bogus', '', 'toString', '__proto__'];
    for (const stored of storedValues) {
      for (const os of ['light', 'dark', 'none', 'throws'] as const) {
        const label = `stored=${stored} os=${os}`;
        const t = env({ stored, prefersLight: os === 'light' });
        const matchMedia = os === 'none' ? null : os === 'throws' ? ('throws' as const) : t.system.matchMedia;
        const expected = createThemeController({
          ...t.env,
          matchMedia:
            matchMedia === 'throws'
              ? () => {
                  throw new Error('nope');
                }
              : matchMedia,
        }).getState();
        const s = fakeStorage(stored === undefined ? {} : { [THEME_STORAGE_KEY]: stored });
        expect(runInitScript({ storage: s.storage, matchMedia }), label).toEqual([expected.resolvedTheme, expected.theme, expected.resolvedTheme]);
        expect(s.reads, label).toEqual([THEME_STORAGE_KEY]);
      }
    }
  });

  it('never throws when storage is unavailable or reading it fails: dark', () => {
    expect(runInitScript({ storage: 'throws', matchMedia: null })).toEqual(['dark', 'dark', 'dark']);
    expect(runInitScript({ storage: fakeStorage({}, { get: true }).storage, matchMedia: null })).toEqual(['dark', 'dark', 'dark']);
  });

  it('is plain, dependency-free code that never writes HTML', () => {
    expect(script).not.toMatch(/innerHTML|outerHTML|document\.write|eval\(|import |require\(/);
  });
});
