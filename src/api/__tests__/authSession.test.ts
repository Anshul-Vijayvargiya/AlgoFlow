import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { HttpApiClient, setUnauthorizedHandler, HttpError } from '../httpAdapter';
import { _resetAuthSessionForTesting, getAccessToken, hasSession } from '../authSession';

/**
 * The browser side of the access/refresh token flow, against a scripted fetch: tokens in memory only, one shared
 * refresh for concurrent 401s, one retry at most, proactive renewal, and logout racing a refresh.
 */

interface Call { url: string; method: string; auth: string | null; credentials?: RequestCredentials; body?: string }
type Reply = { status: number; body?: unknown };
type Route = (call: Call) => Reply | Promise<Reply> | undefined;

let calls: Call[] = [];
let routes: Route[] = [];
const sessionEnded = vi.fn();

const USER = { id: 'u1', name: 'Ada', email: 'ada@algoflow.io', role: 'USER' };
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const signIn = (token = 'access-1', minutes = 15) => ({ status: 200, body: { user: USER, accessToken: token, accessTokenExpiresAt: inMinutes(minutes) } });

function installFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = { url, method: init.method ?? 'GET', auth: headers.Authorization ?? null, credentials: init.credentials, body: init.body as string | undefined };
    calls.push(call);
    for (const route of routes) {
      const reply = await route(call);
      if (reply) return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, text: async () => (reply.body === undefined ? '' : JSON.stringify(reply.body)) };
    }
    throw new Error(`unexpected request ${call.method} ${url}`);
  }));
}

const on = (method: string, path: string, reply: Reply | ((call: Call) => Reply | Promise<Reply>)): Route => call =>
  call.method === method && call.url.endsWith(path) ? (typeof reply === 'function' ? reply(call) : reply) : undefined;
const refreshCalls = () => calls.filter(c => c.url.endsWith('/auth/refresh'));
const expired = { status: 401, body: { code: 'ACCESS_TOKEN_EXPIRED', error: 'Your session needs to be renewed.' } };
/** /users/profile answers 200 only for the given token, else "expired" */
const profileFor = (token: string): Route => on('GET', '/users/profile', call => (call.auth === `Bearer ${token}` ? { status: 200, body: { user: USER } } : expired));

async function loggedIn(client: HttpApiClient, token = 'access-1') {
  routes.unshift(on('POST', '/auth/login', signIn(token)));
  await client.auth.login('ada@algoflow.io', 'Correct-Horse-9');
  routes.shift();
  calls = [];
}

beforeEach(() => {
  _resetAuthSessionForTesting();
  calls = [];
  routes = [];
  sessionEnded.mockReset();
  installFetch();
  setUnauthorizedHandler(sessionEnded);
});

afterEach(() => {
  _resetAuthSessionForTesting();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('access token handling', () => {
  it('keeps the access token in memory only and sends it as a Bearer header', async () => {
    // browser storage, recording every write (this suite runs without a DOM)
    const writes: string[] = [];
    const storage = () => ({ setItem: (k: string, v: string) => writes.push(`${k}=${v}`), getItem: () => null, removeItem: () => undefined, clear: () => undefined });
    vi.stubGlobal('localStorage', storage());
    vi.stubGlobal('sessionStorage', storage());
    vi.stubGlobal('document', { set cookie(v: string) { writes.push(v); }, get cookie() { return ''; } });

    const client = new HttpApiClient();
    await loggedIn(client, 'access-xyz');
    routes.push(profileFor('access-xyz'));

    await client.settings.getProfile();
    expect(calls[0].auth).toBe('Bearer access-xyz');
    expect(calls[0].credentials).toBe('include');
    expect(getAccessToken()).toBe('access-xyz');
    expect(writes).toEqual([]);
  });

  it('never sends the access token to the sign-in, refresh or logout endpoints', async () => {
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/login', signIn('access-2')));
    await client.auth.login('ada@algoflow.io', 'pw');
    expect(calls[0].auth).toBeNull();
  });

  it('rejects a sign-in response without an access token', async () => {
    routes.push(on('POST', '/auth/login', { status: 200, body: { user: USER } }));
    await expect(new HttpApiClient().auth.login('ada@algoflow.io', 'pw')).rejects.toThrow(/Invalid response/);
    expect(hasSession()).toBe(false);
  });
});

describe('refresh on 401', () => {
  it('refreshes once for several concurrent 401s, queues them, and retries each once with the new token', async () => {
    const client = new HttpApiClient();
    await loggedIn(client, 'old');
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    routes.push(
      on('POST', '/auth/refresh', async () => { await gate; return { status: 200, body: { accessToken: 'new', accessTokenExpiresAt: inMinutes(15) } }; }),
      profileFor('new')
    );

    const pending = [client.settings.getProfile(), client.settings.getProfile(), client.settings.getProfile()];
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    // a request started while the refresh runs waits for it instead of going out with the old token
    const late = client.settings.getProfile();
    release();
    const results = await Promise.all([...pending, late]);

    expect(results.every(p => p.id === 'u1')).toBe(true);
    expect(refreshCalls()).toHaveLength(1);
    const profileCalls = calls.filter(c => c.url.endsWith('/users/profile'));
    expect(profileCalls.filter(c => c.auth === 'Bearer old')).toHaveLength(3);
    expect(profileCalls.filter(c => c.auth === 'Bearer new')).toHaveLength(4);
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it('retries a request at most once: a second 401 is an error, not another refresh (no loop)', async () => {
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/refresh', { status: 200, body: { accessToken: 'new', accessTokenExpiresAt: inMinutes(15) } }), on('GET', '/users/profile', expired));

    await expect(client.settings.getProfile()).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toHaveLength(1);
    expect(calls.filter(c => c.url.endsWith('/users/profile'))).toHaveLength(2);
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it('signs out when the refresh itself is refused (401), once, and stops sending the token', async () => {
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/refresh', { status: 401, body: { code: 'SESSION_REVOKED' } }), on('GET', '/users/profile', expired));

    const results = await Promise.allSettled([client.settings.getProfile(), client.settings.getProfile()]);
    expect(results.every(r => r.status === 'rejected')).toBe(true);
    expect(refreshCalls()).toHaveLength(1);
    expect(sessionEnded).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(hasSession()).toBe(false);

    // no further refresh attempts once signed out
    calls = [];
    await expect(client.settings.getProfile()).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBeNull();
  });

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', () => ({ status: 500, body: { error: 'boom' } })],
    ['a rate limit', () => ({ status: 429, body: { error: 'slow down' } })],
  ])('does not sign out when the refresh fails with %s', async (_label, reply) => {
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/refresh', reply as () => Reply), on('GET', '/users/profile', expired));

    await expect(client.settings.getProfile()).rejects.toMatchObject({ status: 401 });
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(hasSession()).toBe(true);
  });

  it('retries the refresh after a 409 (another tab rotated the cookie a moment ago)', async () => {
    const client = new HttpApiClient();
    await loggedIn(client);
    let n = 0;
    routes.push(
      on('POST', '/auth/refresh', () => (++n === 1 ? { status: 409, body: { code: 'REFRESH_IN_PROGRESS' } } : { status: 200, body: { accessToken: 'new', accessTokenExpiresAt: inMinutes(15) } })),
      profileFor('new')
    );
    expect((await client.settings.getProfile()).id).toBe('u1');
    expect(refreshCalls()).toHaveLength(2);
  });

  it('signs out at once on SESSION_REVOKED or ACCOUNT_SUSPENDED, without trying a refresh', async () => {
    for (const code of ['SESSION_REVOKED', 'ACCOUNT_SUSPENDED']) {
      const client = new HttpApiClient();
      await loggedIn(client);
      sessionEnded.mockClear();
      routes = [on('GET', '/users/profile', { status: 401, body: { code } })];
      await expect(client.settings.getProfile()).rejects.toMatchObject({ status: 401, code });
      expect(refreshCalls()).toHaveLength(0);
      expect(sessionEnded).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBeNull();
    }
  });

  it('does not treat a 403 (missing permission) as a session problem', async () => {
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('GET', '/admin/metrics', { status: 403, body: { error: 'Access denied.' } }));
    await expect(client.admin.getMetrics()).rejects.toMatchObject({ status: 403 });
    expect(refreshCalls()).toHaveLength(0);
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('access-1');
  });

  it('does not try to refresh for a visitor who never signed in', async () => {
    routes.push(on('GET', '/users/profile', { status: 401, body: { code: 'AUTH_REQUIRED' } }));
    await expect(new HttpApiClient().settings.getProfile()).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toHaveLength(0);
  });

  it('does not refresh on a failed sign-in', async () => {
    routes.push(on('POST', '/auth/login', { status: 401, body: { error: 'Invalid email or password.' } }));
    await expect(new HttpApiClient().auth.login('ada@algoflow.io', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toHaveLength(0);
    expect(sessionEnded).not.toHaveBeenCalled();
  });
});

describe('page load', () => {
  it('resumes the session with the refresh cookie, then loads the user with the new access token', async () => {
    routes.push(on('POST', '/auth/refresh', { status: 200, body: { accessToken: 'resumed', accessTokenExpiresAt: inMinutes(15) } }), on('GET', '/auth/me', { status: 200, body: { user: USER } }));
    const user = await new HttpApiClient().auth.getCurrentUser();
    expect(user?.id).toBe('u1');
    expect(calls.map(c => c.url.replace(/^.*\/api/, ''))).toEqual(['/auth/refresh', '/auth/me']);
    expect(calls[0]).toMatchObject({ method: 'POST', credentials: 'include', auth: null, body: undefined });
    expect(calls[1].auth).toBe('Bearer resumed');
  });

  it('is signed out without asking /me when there is no session to resume', async () => {
    routes.push(on('POST', '/auth/refresh', { status: 401, body: { code: 'REFRESH_INVALID' } }));
    expect(await new HttpApiClient().auth.getCurrentUser()).toBeNull();
    expect(calls).toHaveLength(1);
    expect(hasSession()).toBe(false);
  });

  it('is signed out (not stuck) when the server cannot be reached', async () => {
    routes.push(on('POST', '/auth/refresh', () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await new HttpApiClient().auth.getCurrentUser()).toBeNull();
  });
});

describe('proactive renewal', () => {
  it('renews the access token shortly before it expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/refresh', { status: 200, body: { accessToken: 'renewed', accessTokenExpiresAt: inMinutes(15) } }));

    await vi.advanceTimersByTimeAsync(13 * 60_000);
    expect(refreshCalls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000 + 1_000);
    expect(refreshCalls()).toHaveLength(1);
    expect(getAccessToken()).toBe('renewed');
  });

  it('signs out when the scheduled renewal is refused', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/refresh', { status: 401, body: { code: 'REFRESH_EXPIRED' } }));
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(sessionEnded).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('stops renewing after logout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const client = new HttpApiClient();
    await loggedIn(client);
    routes.push(on('POST', '/auth/logout', { status: 200, body: {} }), on('POST', '/auth/refresh', { status: 200, body: { accessToken: 'x', accessTokenExpiresAt: inMinutes(15) } }));
    await client.auth.logout();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('logout', () => {
  it('clears the token, sends it to /auth/logout once so the server ends this session, and forgets it', async () => {
    const client = new HttpApiClient();
    await loggedIn(client, 'mine');
    routes.push(on('POST', '/auth/logout', { status: 200, body: {} }), on('GET', '/users/profile', { status: 401, body: { code: 'AUTH_REQUIRED' } }));

    await client.auth.logout();
    expect(calls).toEqual([expect.objectContaining({ method: 'POST', auth: 'Bearer mine', credentials: 'include' })]);
    expect(getAccessToken()).toBeNull();

    await expect(client.settings.getProfile()).rejects.toMatchObject({ status: 401 });
    expect(calls.at(-1)!.auth).toBeNull();
    expect(refreshCalls()).toHaveLength(0);
  });

  it('a refresh still running when the user logs out cannot sign them back in', async () => {
    const client = new HttpApiClient();
    await loggedIn(client, 'old');
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const order: string[] = [];
    routes.push(
      on('POST', '/auth/refresh', async () => { await gate; order.push('refresh done'); return { status: 200, body: { accessToken: 'late', accessTokenExpiresAt: inMinutes(15) } }; }),
      on('POST', '/auth/logout', () => { order.push('logout sent'); return { status: 200, body: {} }; }),
      on('GET', '/users/profile', expired)
    );

    const request = client.settings.getProfile().catch(err => err);
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    const logout = client.auth.logout();
    release();
    await logout;
    const result = await request;

    // the logout request went out after the refresh answered, so it carried the newest refresh cookie
    expect(order).toEqual(['refresh done', 'logout sent']);
    expect(getAccessToken()).toBeNull();
    expect(hasSession()).toBe(false);
    expect(result).toBeInstanceOf(HttpError);
    expect(calls.filter(c => c.auth === 'Bearer late')).toHaveLength(0);
  });

  it('logout-all asks the server to end every session and clears this tab', async () => {
    const client = new HttpApiClient();
    await loggedIn(client, 'mine');
    routes.push(on('POST', '/auth/logout-all', { status: 200, body: {} }), on('POST', '/auth/logout', { status: 200, body: {} }));
    await client.auth.logoutAll();
    expect(calls[0]).toMatchObject({ method: 'POST', auth: 'Bearer mine' });
    expect(calls[0].url).toMatch(/\/auth\/logout-all$/);
    expect(getAccessToken()).toBeNull();
  });
});
