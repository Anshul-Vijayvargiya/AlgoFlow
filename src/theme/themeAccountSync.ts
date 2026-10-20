/**
 * Keeps the signed-in account's saved theme in step with the device. The device (theme controller + localStorage) is
 * the source of truth for what is shown; the account is a copy that follows the user to other devices.
 *
 * Policy:
 *  - Every explicit change (header or Settings) applies at once and is saved on the device. When signed in, it is also
 *    saved to the account straight away. If that fails, the device keeps the choice (nothing is reverted) and the
 *    failure is reported through useThemeStore.accountSync; the next change, or Settings > Save, tries again.
 *  - Saves run one at a time in the order they were made, so a slow earlier request cannot overwrite a later choice.
 *  - On sign-in (login, registration or session restore): a device that has never stored a choice adopts the
 *    account's theme; a device with its own choice keeps it. Nothing is written to the account at sign-in.
 *  - Signing out never resets the theme: the device keeps its choice (including Light) for signed-out use.
 *  - OS changes while 'system' is selected change only the resolved theme, never the stored preference, so they are
 *    not saved anywhere.
 */
import { apiClient } from '../api';
import type { UserProfile } from '../api';
import { useAuthStore } from '../store/useAuthStore';
import { hasStoredThemePreference, useThemeStore } from '../store/useThemeStore';
import { isThemePreference, type ThemePreference } from './theme';

export type SaveThemeToAccount = (theme: ThemePreference) => Promise<UserProfile>;

const saveViaApi: SaveThemeToAccount = theme => apiClient.settings.updateProfile({ preferences: { theme } });

/** Starts syncing; returns a function that stops it. Called once from main.tsx (and by tests with a fake save). */
export function startThemeAccountSync(save: SaveThemeToAccount = saveViaApi): () => void {
  let lastPreference = useThemeStore.getState().preference;
  let queue: Promise<void> = Promise.resolve();
  let latest = 0;

  const saveToAccount = (theme: ThemePreference) => {
    const ticket = ++latest;
    useThemeStore.setState({ accountSync: 'saving' });
    queue = queue.then(async () => {
      try {
        const updated = await save(theme);
        const current = useAuthStore.getState().user;
        // keep the profile copy in step (same user still signed in); its other fields come from the server
        if (current && current.id === updated.id) useAuthStore.setState({ user: { ...current, preferences: updated.preferences } });
        if (ticket === latest) useThemeStore.setState({ accountSync: 'saved' });
      } catch {
        if (ticket === latest) useThemeStore.setState({ accountSync: 'error' });
      }
    });
  };

  const stopTheme = useThemeStore.subscribe(state => {
    if (state.preference === lastPreference) return; // an OS change under 'system', or a status update
    lastPreference = state.preference;
    const user = useAuthStore.getState().user;
    if (user && user.preferences.theme !== state.preference) saveToAccount(state.preference);
  });

  const adoptAccountTheme = (user: UserProfile) => {
    const accountTheme = user.preferences?.theme;
    if (!hasStoredThemePreference() && isThemePreference(accountTheme)) useThemeStore.getState().setPreference(accountTheme);
  };

  const stopAuth = useAuthStore.subscribe((state, previous) => {
    if (state.user && !previous.user) adoptAccountTheme(state.user);
    if (!state.user && previous.user) useThemeStore.setState({ accountSync: 'idle' });
  });
  const signedIn = useAuthStore.getState().user;
  if (signedIn) adoptAccountTheme(signedIn);

  return () => {
    stopTheme();
    stopAuth();
  };
}
