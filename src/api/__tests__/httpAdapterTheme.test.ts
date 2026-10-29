import { describe, it, expect, afterEach, vi } from 'vitest';
import { HttpApiClient } from '../httpAdapter';

// The HTTP adapter normalises every profile the server returns. It used to turn anything but 'system' into 'dark',
// which silently dropped a saved 'light'.

function serverReturns(theme: unknown) {
  const body = JSON.stringify({ user: { id: 'u1', name: 'Ada', email: 'ada@algoflow.io', role: 'USER', preferences: { theme } } });
  const fetchMock = vi.fn(async () => ({ status: 200, ok: true, text: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('HTTP adapter: theme preference', () => {
  it('keeps every theme the server sent (the four named themes and system)', async () => {
    for (const theme of ['dark', 'light', 'galaxy', 'sunset', 'system'] as const) {
      serverReturns(theme);
      const profile = await new HttpApiClient().settings.updateProfile({ preferences: { theme } });
      expect(profile.preferences.theme).toBe(theme);
    }
  });

  it('missing or unknown values fall back to dark', async () => {
    for (const theme of [undefined, null, 'neon', 'LIGHT', 'midnight', 3]) {
      serverReturns(theme);
      expect((await new HttpApiClient().settings.getProfile()).preferences.theme, String(theme)).toBe('dark');
    }
  });

  it('sends the chosen theme in the PATCH body', async () => {
    const fetchMock = serverReturns('light');
    await new HttpApiClient().settings.updateProfile({ preferences: { theme: 'light' } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/users\/profile$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ preferences: { theme: 'light' } });
  });
});
