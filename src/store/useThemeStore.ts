import { create } from 'zustand';
import {
  browserThemeEnvironment,
  createThemeController,
  DEFAULT_THEME_PREFERENCE,
  type ResolvedTheme,
  type ThemeController,
  type ThemeEnvironment,
  type ThemePreference,
} from '../theme/theme';

/** Saving the preference to the signed-in account (see src/theme/themeAccountSync.ts). */
export type ThemeAccountSync = 'idle' | 'saving' | 'saved' | 'error';

interface ThemeStoreState {
  /** what the user chose (stored) */
  preference: ThemePreference;
  /** what the page shows ('system' resolved through the OS) */
  resolvedTheme: ResolvedTheme;
  accountSync: ThemeAccountSync;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * React-facing view of the single theme controller. The controller owns the DOM, storage and the OS listener; this
 * store only mirrors its state so components can render a toggle. startTheme() is called once, in main.tsx.
 */
let controller: ThemeController | null = null;

export const useThemeStore = create<ThemeStoreState>(() => ({
  preference: DEFAULT_THEME_PREFERENCE,
  resolvedTheme: 'dark',
  accountSync: 'idle',
  setPreference: preference => controller?.setPreference(preference),
}));

/** Whether this device has its own saved theme choice (false before startTheme). */
export const hasStoredThemePreference = () => controller?.hasStoredPreference() ?? false;

/** Starts (or restarts, e.g. in tests) the theme controller; returns it. */
export function startTheme(env: ThemeEnvironment = browserThemeEnvironment()): ThemeController {
  controller?.destroy();
  controller = createThemeController(env);
  useThemeStore.setState(controller.getState());
  controller.subscribe(state => useThemeStore.setState(state));
  return controller;
}
