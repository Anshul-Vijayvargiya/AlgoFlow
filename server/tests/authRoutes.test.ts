import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { hashPassword } from '../services/authService';
import { tokenFor } from './helpers/sessionStub';
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

// Role and status come from the database on every request; see helpers/sessionStub.ts
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


function createQueryMock(result: any) {
  return {
    select: vi.fn().mockReturnThis(),
    then: (onfulfilled?: (val: any) => any, onrejected?: (reason: any) => any) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected?: (reason: any) => any) =>
      Promise.resolve(result).catch(onrejected),
  };
}

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
      _id: 'user_123',
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
  });

  // ── Cookie Security & Successful Auth ──────────────────────────────────────
  it('should set HttpOnly and SameSite cookie on successful login', async () => {
    const password = 'CorrectPassword123!';
    const passwordHash = await hashPassword(password);
    mockUser.findOne.mockReturnValue(createQueryMock({
      _id: 'user_valid',
      name: 'Valid User',
      email: 'valid@algoflow.io',
      passwordHash,
      role: 'USER',
      streakDays: 1,
      solvedCount: 0,
      algorithmsLearned: 1,
    }));

    const res = await request(app).post('/api/auth/login').send({
      email: 'valid@algoflow.io',
      password,
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const tokenCookie = cookies.find((c: string) => c.startsWith('algoflow_token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toMatch(/HttpOnly/i);
    expect(tokenCookie).toMatch(/SameSite=Lax/i);
  });

  // ── Authentication & Token Verification ───────────────────────────────────
  it('should return 401 for unauthenticated /api/auth/me request', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/);
  });

  it('should reject request with invalid/tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', ['algoflow_token=tampered.invalid.token']);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired/);
  });

  it('should reject request with expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'u_exp', role: 'USER' },
      env.JWT_SECRET,
      { expiresIn: '-10s' }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`algoflow_token=${expiredToken}`]);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired/);
  });

  // ── RBAC Enforcement ───────────────────────────────────────────────────────
  it('should return 403 for user accessing admin route without role', async () => {
    const userToken = tokenFor('u_user', 'USER');

    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Cookie', [`algoflow_token=${userToken}`]);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/);
  });

  it('should allow admin role accessing admin route', async () => {
    const adminToken = tokenFor('u_admin', 'ADMIN');

    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Cookie', [`algoflow_token=${adminToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.serverUptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.metrics.totalUsers).toBe(42);
  });

  // ── Logout & Post-Logout State ─────────────────────────────────────────────
  it('should logout cleanly and clear the auth cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Logged out/);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const tokenCookie = cookies.find((c: string) => c.startsWith('algoflow_token='));
    expect(tokenCookie).toBeDefined();
    // Cookie is cleared (empty value or expired date)
    expect(tokenCookie).toMatch(/algoflow_token=;/);
  });

  it('should reject /api/auth/me after logout', async () => {
    const logoutRes = await request(app).post('/api/auth/logout');
    const clearedCookie = logoutRes.headers['set-cookie'];

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', clearedCookie);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/);
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
  });
});

