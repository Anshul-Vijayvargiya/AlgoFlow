import { describe, it, expect } from 'vitest';
import { User } from '../models/User';

// The stored theme: the schema (not only the route) must allow light, keep dark as the default, and reject unknowns.
describe('User model: preferences.theme', () => {
  const path = User.schema.path('preferences.theme') as unknown as { enumValues: string[]; defaultValue: unknown };

  it('allows the four named themes (dark, light, galaxy, sunset) and system, and defaults to dark', () => {
    expect(path.enumValues).toEqual(['dark', 'light', 'galaxy', 'sunset', 'system']);
    expect(path.defaultValue).toBe('dark');
  });

  it('a new user gets dark; light and system validate; unknown values do not', () => {
    const base = { name: 'Ada', email: 'ada@algoflow.io', passwordHash: 'x' };
    expect(new User(base).preferences.theme).toBe('dark');
    for (const theme of ['dark', 'light', 'galaxy', 'sunset', 'system']) {
      expect(new User({ ...base, preferences: { theme } }).validateSync()?.errors?.['preferences.theme'], theme).toBeUndefined();
    }
    for (const theme of ['neon', 'Light', 'midnight', 'Galaxy']) {
      expect(new User({ ...base, preferences: { theme } }).validateSync()?.errors?.['preferences.theme'], theme).toBeDefined();
    }
  });
});
