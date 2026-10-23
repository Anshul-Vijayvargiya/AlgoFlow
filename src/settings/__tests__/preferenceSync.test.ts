import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { UserProfile } from '../../api';
import { useAuthStore } from '../../store/useAuthStore';
import { usePracticeStore } from '../../store/usePracticeStore';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import type { ProgrammingLanguage } from '../../types/algorithm';
import { startPreferenceSync } from '../preferenceSync';

const user = (id: string, preferredLanguage: ProgrammingLanguage, dailyGoalMinutes = 30): UserProfile => ({
  id,
  name: id,
  email: `${id}@algoflow.io`,
  role: 'USER',
  accountStatus: 'active',
  preferences: { theme: 'dark', preferredLanguage, dailyGoalMinutes },
  streakDays: 0,
  solvedCount: 0,
  algorithmsLearned: 0,
  progressPercent: 0,
});
const languages = () => [useVisualizerStore.getState().selectedLanguage, usePracticeStore.getState().selectedLanguage];
let stop: (() => void) | null = null;

beforeEach(() => {
  useAuthStore.setState({ user: null });
  useVisualizerStore.getState().setLanguage('cpp');
  usePracticeStore.setState({ selectedLanguage: 'cpp' });
});
afterEach(() => {
  stop?.();
  stop = null;
});

describe('preferred language', () => {
  it('a restored session (page reload) starts the visualizer, Playground and Practice in it', () => {
    useAuthStore.setState({ user: user('u1', 'java') });
    stop = startPreferenceSync();
    expect(languages()).toEqual(['java', 'java']);
  });

  it('signing in applies it', () => {
    stop = startPreferenceSync();
    useAuthStore.setState({ user: user('u1', 'python') });
    expect(languages()).toEqual(['python', 'python']);
  });

  it('saving a new preference in Settings applies it at once', () => {
    stop = startPreferenceSync();
    useAuthStore.setState({ user: user('u1', 'python') });
    useAuthStore.setState({ user: user('u1', 'c') });
    expect(languages()).toEqual(['c', 'c']);
  });

  it('a language picked during the session is kept when the profile refreshes with the same preference', () => {
    stop = startPreferenceSync();
    useAuthStore.setState({ user: user('u1', 'python') });
    useVisualizerStore.getState().setLanguage('java');
    useAuthStore.setState({ user: user('u1', 'python', 60) });
    expect(useVisualizerStore.getState().selectedLanguage).toBe('java');
  });

  it("switching accounts applies the new account's own preference, even when it equals the previous one", () => {
    stop = startPreferenceSync();
    useAuthStore.setState({ user: user('u1', 'python') });
    useAuthStore.setState({ user: null });
    useVisualizerStore.getState().setLanguage('java');
    useAuthStore.setState({ user: user('u2', 'python') });
    expect(languages()).toEqual(['python', 'python']);
    useAuthStore.setState({ user: user('u3', 'c') });
    expect(languages()).toEqual(['c', 'c']);
  });

  it('an unknown stored value changes nothing', () => {
    stop = startPreferenceSync();
    useAuthStore.setState({ user: { ...user('u1', 'cpp'), preferences: { theme: 'dark', preferredLanguage: 'rust' as ProgrammingLanguage, dailyGoalMinutes: 30 } } });
    expect(languages()).toEqual(['cpp', 'cpp']);
  });

  it('stopping it stops applying', () => {
    stop = startPreferenceSync();
    stop();
    stop = null;
    useAuthStore.setState({ user: user('u1', 'python') });
    expect(languages()).toEqual(['cpp', 'cpp']);
  });
});
