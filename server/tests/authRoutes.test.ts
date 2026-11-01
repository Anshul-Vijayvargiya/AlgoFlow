import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { hashPassword, verifyAccessToken } from '../services/authService';
import * as sessions from './helpers/sessionStub';
import { env } from '../config/env';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// ── Mock Mongoose models so tests don't require a live MongoDB ─────────────
const { mockUser } = vi.hoisted(() => {
  return {
    mockUser: {
      countDocuments: vi.fn().mockResolvedValue(42),
      findOne: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
    },
  };
});

// The session service is stubbed here (these tests are about the routes: status codes, bodies, cookies); the real one
// (rotation, reuse detection, revocation) runs in sessionLifecycle.test.ts.
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
vi.mock('../models/User', () => ({
  User: mockUser,
}));
vi.mock('../models/Problem', () => ({
  Problem: { countDocuments: vi.fn().mockResolvedValue(12) },
}));
vi.mock('../models/Submission', () => ({
  Submission: { countDocuments: vi.fn().mockResolvedValue(200) },
}));
vi.mock('../models/ActivityLog', () => ({
  ActivityLog: { distinct: vi.fn().mockResolvedValue([]) },
}));

const USER_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439033';
const FRONT_END = env.CLIENT_URL;
const REFRESH = 'A'.repeat(43);

function createQueryMock(result: any) {
  return {
    select: vi.fn().mockReturnThis(),
    then: (onfulfilled?: (val: any) => any, onrejected?: (reason: any) => any) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected?: (reason: any) => any) =>
      Promise.resolve(result).catch(onrejected),
  };
}

const setCookies = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
};
const cookieNamed = (res: request.Response, name: string) => setCookies(res).find(c => c.startsWith(`${name}=`));
const isCleared = (cookie: string | undefined) => !!cookie && /^[^=]+=;/.test(cookie) && /Expires=Thu, 01 Jan 1970/i.test(cookie);

async function signInUser(overrides: Record<string, unknown> = {}) {
  const password = 'CorrectPassword123!';
  mockUser.findOne.mockReturnValue(createQueryMock({
    _id: USER_ID,
    name: 'Valid User',
    email: 'valid@algoflow.io',
    passwordHash: await hashPassword(password),
    role: 'USER',
    tokenVersion: 4,
    streakDays: 1,
    solvedCount: 0,
    algorithmsLearned: 1,
    ...overrides,
  }));
  return request(app).post('/api/auth/login').send({ email: 'valid@algoflow.io', password });
}

const refresh = (cookie = `algoflow_refresh=${REFRESH}`, origin: string | null = FRONT_END) => {
  const req = request(app).post('/api/auth/refresh').set('Cookie', [cookie]);
  return origin === null ? req : req.set('Origin', origin);
};

describe('Auth API Routes - Integration & Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitsForTesting();
  });

  // ── Input Validation ───────────────────────────────────────────────────────
  it('should reject registration with invalid Zod payloads', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'A', // Too short
      email: 'not-an-email',
      password: '123', // Too short
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
    expect(res.body.details.length).toBeGreaterThanOrEqual(2);
  });

  it('should reject login with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should handle malformed JSON bodies without crashing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"badJson": ');

    // Express body-parser catches syntax error; existing errorHandler handles it
    expect([400, 500]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  // ── Duplicate Registration ─────────────────────────────────────────────────
  it('should reject duplicate registration with existing email with HTTP 409', async () => {
    mockUser.findOne.mockReturnValue(createQueryMock({
      _id: 'existing_id',
      email: 'existing@algoflow.io',
    }));

    const res = await request(app).post('/api/auth/register').send({
      name: 'Existing User',
      email: 'existing@algoflow.io',
      password: 'SecurePassword123!',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
    expect(sessions.createSession).not.toHaveBeenCalled();
    expect(setCookies(res)).toEqual([]);
  });

  it('should handle concurrent registration race condition (Mongo 11000) with HTTP 409', async () => {
    // Simulate race: findOne passes (returns null), but concurrent insert throws Mongo duplicate key code 11000
    mockUser.findOne.mockReturnValue(createQueryMock(null));
    const mongoDuplicateError: any = new Error('E11000 duplicate key error collection: algoflow.users index: email_1 dup key');
    mongoDuplicateError.code = 11000;
    mockUser.create.mockRejectedValue(mongoDuplicateError);

    const res = await request(app).post('/api/auth/register').send({
      name: 'Concurrent User',
      email: 'concurrent@algoflow.io',
      password: 'SecurePassword123!',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('An account with this email already exists.');
    // Confirm raw Mongo driver details were NOT leaked
    expect(res.body.error).not.toMatch(/E11000/);
    expect(res.body.error).not.toMatch(/algoflow\.users/);
  });

  it('should register a user with a bcrypt hash, start a session and return an access token', async () => {
    mockUser.findOne.mockReturnValue(createQueryMock(null));
    mockUser.create.mockImplementation(async (doc: any) => ({ _id: USER_ID, tokenVersion: 0, streakDays: 0, solvedCount: 0, algorithmsLearned: 0, ...doc }));

    const res = await request(app).post('/api/auth/register').send({ name: 'New User', email: 'NEW@algoflow.io', password: 'SecurePassword123!' });

    expect(res.status).toBe(201);
    const created = mockUser.create.mock.calls[0][0];
    expect(created).toMatchObject({ email: 'new@algoflow.io', role: 'USER' });
    expect(created.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(res.body.user).toMatchObject({ id: USER_ID, email: 'new@algoflow.io', role: 'USER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(sessions.createSession).toHaveBeenCalledWith(USER_ID, 0);
    expect(verifyAccessToken(res.body.accessToken)).toEqual({ ok: true, claims: { userId: USER_ID, sessionId: sessions.sessionIdFor(USER_ID), tokenVersion: 0 } });
    expect(cookieNamed(res, 'algoflow_refresh')).toBeDefined();
  });

  // ── Invalid Login Scenarios ────────────────────────────────────────────────
  it('should reject login for non-existent user with generic message', async () => {
    mockUser.findOne.mockReturnValue(createQueryMock(null));

    const res = await request(app).post('/api/auth/login').send({
      email: 'nonexistent@algoflow.io',
      password: 'RandomPassword123!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('should reject login for incorrect password with generic message', async () => {
    const realHash = await hashPassword('CorrectPassword123!');
    mockUser.findOne.mockReturnValue(createQueryMock({
      _id: USER_ID,
      email: 'user@algoflow.io',
      passwordHash: realHash,
      role: 'USER',
    }));

    const res = await request(app).post('/api/auth/login').send({
      email: 'user@algoflow.io',
      password: 'WrongPassword456!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('should refuse a suspended account only after the password is verified, without starting a session', async () => {
    const wrong = await (async () => {
      mockUser.findOne.mockReturnValue(createQueryMock({ _id: USER_ID, passwordHash: await hashPassword('CorrectPassword123!'), role: 'USER', accountStatus: 'suspended' }));
      return request(app).post('/api/auth/login').send({ email: 'valid@algoflow.io', password: 'WrongPassword456!' });
    })();
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('Invalid email or password.');

    const res = await signInUser({ accountStatus: 'suspended' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
    expect(res.body.accessToken).toBeUndefined();
    expect(sessions.createSession).not.toHaveBeenCalled();
    expect(cookieNamed(res, 'algoflow_refresh')).toBeUndefined();
  });

  // ── Successful login: access token in the body, refresh token in a cookie ──
  it('should return a short-lived access token and set the refresh cookie on successful login', async () => {
    const res = await signInUser();

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: USER_ID, role: 'USER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');

    // the access token: in the body only (never a cookie), bound to the new session and the account's token version
    expect(sessions.createSession).toHaveBeenCalledWith(USER_ID, 4);
    expect(verifyAccessToken(res.body.accessToken)).toEqual({ ok: true, claims: { userId: USER_ID, sessionId: sessions.sessionIdFor(USER_ID), tokenVersion: 4 } });
    const expiresIn = new Date(res.body.accessTokenExpiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(env.ACCESS_TOKEN_TTL - 10_000);
    expect(expiresIn).toBeLessThanOrEqual(env.ACCESS_TOKEN_TTL);

    // the refresh token: HttpOnly, SameSite=Lax, only for /api/auth, host-only, persistent until the session expires
    const refreshCookie = cookieNamed(res, 'algoflow_refresh')!;
    expect(refreshCookie).toBe(`algoflow_refresh=${'R'.repeat(43)}; Path=/api/auth; Expires=${new Date(refreshCookie.match(/Expires=([^;]+)/)![1]).toUTCString()}; HttpOnly; SameSite=Lax`);
    expect(refreshCookie).not.toMatch(/Domain=/i);
    expect(setCookies(res).some(c => c.includes(res.body.accessToken))).toBe(false);
    // the previous design's 7-day cookie is removed
    expect(isCleared(cookieNamed(res, 'algoflow_token'))).toBe(true);
  });

  // ── Access tokens on requests ──────────────────────────────────────────────
  it('should return 401 AUTH_REQUIRED for an unauthenticated /api/auth/me request', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED', error: expect.stringMatching(/Authentication required/) });
  });

  it('should accept a valid Bearer access token on /api/auth/me', async () => {
    mockUser.findById.mockResolvedValue({ _id: USER_ID, name: 'Valid User', email: 'valid@algoflow.io', role: 'USER' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${sessions.tokenFor(USER_ID, 'USER')}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: USER_ID, role: 'USER' });
  });

  it('should reject a request with an invalid or tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer tampered.invalid.token');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'SESSION_INVALID', error: expect.stringMatching(/Invalid or expired/) });
  });

  it('should answer an expired access token with ACCESS_TOKEN_EXPIRED, so the client knows to refresh', async () => {
    const expiredToken = jwt.sign({ sub: USER_ID, sid: sessions.sessionIdFor(USER_ID), tv: 0, typ: 'access' }, env.JWT_SECRET, { expiresIn: '-10s' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ACCESS_TOKEN_EXPIRED');
    // a 401 never clears the refresh cookie: only the refresh endpoint decides whether the session is over
    expect(setCookies(res)).toEqual([]);
  });

  it('should never accept an access token from a cookie, even a valid one', async () => {
    const token = sessions.tokenFor(USER_ID, 'USER');
    for (const name of ['algoflow_token', 'algoflow_refresh', 'accessToken']) {
      const res = await request(app).get('/api/auth/me').set('Cookie', [`${name}=${token}`]);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    }
  });

  // ── RBAC Enforcement ───────────────────────────────────────────────────────
  it('should return 403 for user accessing admin route without role', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${sessions.tokenFor(USER_ID, 'USER')}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/);
  });

  it('should allow admin role accessing admin route', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${sessions.tokenFor(ADMIN_ID, 'ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.serverUptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.metrics.totalUsers).toBe(42);
  });

  // ── Refresh ───────────────────────────────────────────────────────────────
  describe('POST /api/auth/refresh', () => {
    it('rotates the refresh cookie and returns a new access token', async () => {
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      sessions.rotateRefreshToken.mockResolvedValueOnce({ ok: true, userId: USER_ID, sessionId: sessions.sessionIdFor(USER_ID), tokenVersion: 2, refreshToken: 'N'.repeat(43), refreshExpiresAt: expiresAt });

      const res = await refresh();

      expect(res.status).toBe(200);
      expect(sessions.rotateRefreshToken).toHaveBeenCalledWith(REFRESH);
      expect(verifyAccessToken(res.body.accessToken)).toEqual({ ok: true, claims: { userId: USER_ID, sessionId: sessions.sessionIdFor(USER_ID), tokenVersion: 2 } });
      expect(res.body.accessTokenExpiresAt).toEqual(expect.any(String));
      expect(res.body.user).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
      expect(cookieNamed(res, 'algoflow_refresh')).toMatch(new RegExp(`^algoflow_refresh=${'N'.repeat(43)}; Path=/api/auth; Expires=${expiresAt.toUTCString()}; HttpOnly; SameSite=Lax$`));
    });

    it.each([
      ['invalid', 'REFRESH_INVALID'],
      ['expired', 'REFRESH_EXPIRED'],
      ['revoked', 'SESSION_REVOKED'],
      ['reuse', 'SESSION_REVOKED'],
      ['suspended', 'ACCOUNT_SUSPENDED'],
    ] as const)('answers a %s refresh token with 401 %s and clears the cookie', async (reason, code) => {
      sessions.rotateRefreshToken.mockResolvedValueOnce({ ok: false, reason });
      const res = await refresh();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(code);
      expect(res.body.accessToken).toBeUndefined();
      expect(isCleared(cookieNamed(res, 'algoflow_refresh'))).toBe(true);
      expect(cookieNamed(res, 'algoflow_refresh')).toMatch(/Path=\/api\/auth/);
    });

    it('answers a concurrent rotation of the same token with 409 and leaves the cookie alone', async () => {
      sessions.rotateRefreshToken.mockResolvedValueOnce({ ok: false, reason: 'race' });
      const res = await refresh();
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REFRESH_IN_PROGRESS');
      expect(setCookies(res)).toEqual([]);
    });

    it('reads the refresh token only from its cookie, never from the body, query or a header', async () => {
      await request(app).post(`/api/auth/refresh?refreshToken=${REFRESH}`).set('Origin', FRONT_END).set('Authorization', `Bearer ${REFRESH}`).send({ refreshToken: REFRESH });
      expect(sessions.rotateRefreshToken).toHaveBeenCalledWith(undefined);
      // the legacy cookie is not a refresh token either
      await refresh(`algoflow_token=${REFRESH}`);
      expect(sessions.rotateRefreshToken).toHaveBeenLastCalledWith(undefined);
    });

    it.each([
      ['no Origin header', null, {}],
      ['another origin', 'https://evil.example', {}],
      ['a look-alike origin', `${FRONT_END}.evil.example`, {}],
      ['a malformed Origin', 'not a url', {}],
      ['Sec-Fetch-Site: cross-site', FRONT_END, { 'Sec-Fetch-Site': 'cross-site' }],
      ['Sec-Fetch-Site: none (typed into the address bar)', FRONT_END, { 'Sec-Fetch-Site': 'none' }],
    ])('refuses a refresh with %s (403) before touching the session', async (_label, origin, headers) => {
      const res = await refresh(undefined, origin).set(headers);
      expect(res.status).toBe(403);
      expect(sessions.rotateRefreshToken).not.toHaveBeenCalled();
      expect(setCookies(res)).toEqual([]);
    });

    it('accepts Sec-Fetch-Site same-origin and same-site from the front end', async () => {
      for (const site of ['same-origin', 'same-site']) {
        const res = await refresh().set('Sec-Fetch-Site', site);
        expect(res.status).toBe(401); // the stub's default answer: the request reached the session check
      }
      expect(sessions.rotateRefreshToken).toHaveBeenCalledTimes(2);
    });
  });

  // ── Logout & Post-Logout State ─────────────────────────────────────────────
  it('should logout cleanly and clear both cookies, even with no or a stale cookie', async () => {
    for (const cookie of [null, `algoflow_refresh=${REFRESH}`, 'algoflow_refresh=garbage']) {
      const req = request(app).post('/api/auth/logout');
      const res = await (cookie ? req.set('Cookie', [cookie]) : req);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Logged out/);
      expect(isCleared(cookieNamed(res, 'algoflow_refresh'))).toBe(true);
      expect(cookieNamed(res, 'algoflow_refresh')).toMatch(/Path=\/api\/auth/);
      expect(isCleared(cookieNamed(res, 'algoflow_token'))).toBe(true);
    }
  });

  it('should end the session of the refresh cookie on logout', async () => {
    sessions.revokeSessionByRefreshToken.mockResolvedValueOnce(true);
    await request(app).post('/api/auth/logout').set('Cookie', [`algoflow_refresh=${REFRESH}`]);
    expect(sessions.revokeSessionByRefreshToken).toHaveBeenCalledWith(REFRESH);
    expect(sessions.revokeSessionById).not.toHaveBeenCalled();
  });

  it('should fall back to the access token\'s session on logout when there is no usable refresh cookie', async () => {
    const token = sessions.tokenFor(USER_ID, 'USER');
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(sessions.revokeSessionById).toHaveBeenCalledWith(sessions.sessionIdFor(USER_ID), USER_ID);

    // an invalid access token revokes nothing
    sessions.revokeSessionById.mockClear();
    await request(app).post('/api/auth/logout').set('Authorization', 'Bearer forged.token.value');
    expect(sessions.revokeSessionById).not.toHaveBeenCalled();
  });

  it('should keep the CSRF origin check on logout', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example').set('Cookie', [`algoflow_refresh=${REFRESH}`]);
    expect(res.status).toBe(403);
    expect(sessions.revokeSessionByRefreshToken).not.toHaveBeenCalled();
  });

  it('should end every session on logout-all, which needs a valid access token', async () => {
    const anonymous = await request(app).post('/api/auth/logout-all').set('Cookie', [`algoflow_refresh=${REFRESH}`]);
    expect(anonymous.status).toBe(401);
    expect(sessions.revokeAllSessions).not.toHaveBeenCalled();

    const res = await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${sessions.tokenFor(USER_ID, 'USER')}`);
    expect(res.status).toBe(200);
    expect(sessions.revokeAllSessions).toHaveBeenCalledWith(USER_ID);
    expect(isCleared(cookieNamed(res, 'algoflow_refresh'))).toBe(true);
  });

  // ── Rate Limiting ──────────────────────────────────────────────────────────
  it('should enforce rate limiting on auth endpoints after exceeding max attempts', async () => {
    _resetRateLimitsForTesting();
    mockUser.findOne.mockReturnValue(createQueryMock(null));

    const maxAttempts = env.RATE_LIMIT_MAX_AUTH;
    for (let i = 0; i < maxAttempts; i++) {
      await request(app).post('/api/auth/login').send({
        email: 'attacker@algoflow.io',
        password: 'pass',
      });
    }

    // Attempt maxAttempts + 1 must be blocked with HTTP 429
    const blockedRes = await request(app).post('/api/auth/login').send({
      email: 'attacker@algoflow.io',
      password: 'pass',
    });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toMatch(/Too many authentication attempts/i);
    expect(blockedRes.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blockedRes.headers['retry-after']).toBe(String(blockedRes.body.retryAfterSeconds));
  });
});
