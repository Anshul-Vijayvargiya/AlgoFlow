/**
 * Applies the signed-in account's preferred programming language: it is the language the visualizer's code panel,
 * the Playground (they share one setting) and Practice start in.
 *
 * Applied when an account signs in (login, registration, or session restore after a reload), when another account
 * signs in, and when the account's saved preference changes (Settings > Save). Picking a language on a page during a
 * session is left alone otherwise: a profile refresh with an unchanged preference does not reset it.
 */
import type { UserProfile } from '../api';
import { useAuthStore } from '../store/useAuthStore';
import { usePracticeStore } from '../store/usePracticeStore';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { ProgrammingLanguage } from '../types/algorithm';

const LANGUAGES: readonly ProgrammingLanguage[] = ['cpp', 'c', 'java', 'python'];
const isLanguage = (v: unknown): v is ProgrammingLanguage => LANGUAGES.includes(v as ProgrammingLanguage);

/** Starts applying; returns a function that stops it. Called once from main.tsx (and by tests). */
export function startPreferenceSync(): () => void {
  // the account and preference last applied, so the same one is not applied twice
  let applied: string | null = null;

  const apply = (user: UserProfile | null) => {
    if (!user) {
      applied = null;
      return;
    }
    const lang = user.preferences?.preferredLanguage;
    if (!isLanguage(lang)) return;
    const key = `${user.id}:${lang}`;
    if (key === applied) return;
    applied = key;
    useVisualizerStore.getState().setLanguage(lang);
    usePracticeStore.getState().setLanguage(lang);
  };

  apply(useAuthStore.getState().user);
  return useAuthStore.subscribe(state => apply(state.user));
}
