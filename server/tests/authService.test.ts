import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  isRefreshTokenShaped,
} from '../services/authService';
import { env } from '../config/env';

const USER = '507f1f77bcf86cd799439011';
const SESSION = '65a1b2c3d4e5f6a7b8c9d0e1';
const sign = (payload: object, options: jwt.SignOptions = { expiresIn: 600 }, secret = env.JWT_SECRET) =>
  jwt.sign(payload, secret, { algorithm: 'HS256', ...options });

describe('AuthService - password hashing', () => {
  it('hashes a password with bcrypt and verifies only the matching password', async () => {
    const rawPass = 'SecretP@ssw0rd123';
    const hash = await hashPassword(rawPass);

    expect(hash).not.toBe(rawPass);
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await comparePassword(rawPass, hash)).toBe(true);
    expect(await comparePassword('WrongP@ssword', hash)).toBe(false);
  });
});

describe('AuthService - access tokens', () => {
  it('signs and verifies an access token with the user, session and token version', () => {
    const { token, expiresAt } = generateAccessToken({ userId: USER, sessionId: SESSION, tokenVersion: 3 });
    expect(verifyAccessToken(token)).toEqual({ ok: true, claims: { userId: USER, sessionId: SESSION, tokenVersion: 3 } });
    // ACCESS_TOKEN_TTL (default 15 minutes)
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(env.ACCESS_TOKEN_TTL - 5_000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(env.ACCESS_TOKEN_TTL);
  });

  it('uses HS256 and carries no role, status, email or other profile data', () => {
    const { token } = generateAccessToken({ userId: USER, sessionId: SESSION, tokenVersion: 0 });
    const [header, body] = token.split('.').slice(0, 2).map(part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(body).sort()).toEqual(['exp', 'iat', 'sid', 'sub', 'tv', 'typ']);
    expect(body.typ).toBe('access');
    expect(body.exp - body.iat).toBe(env.ACCESS_TOKEN_TTL / 1000);
  });

  it('reports an expired token as expired (the client refreshes), distinct from an invalid one', () => {
    const expired = sign({ sub: USER, sid: SESSION, tv: 0, typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 }, {});
    expect(verifyAccessToken(expired)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyAccessToken('invalid.garbage.token')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects the previous design\'s 7-day session tokens (no session id, no token type)', () => {
    expect(verifyAccessToken(sign({ sub: USER, tv: 0 }, { expiresIn: '7d' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyAccessToken(sign({ userId: USER, role: 'SUPER_ADMIN' }, { expiresIn: '7d' }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['a missing token type', { sub: USER, sid: SESSION, tv: 0 }],
    ['another token type', { sub: USER, sid: SESSION, tv: 0, typ: 'refresh' }],
    ['a missing session id', { sub: USER, tv: 0, typ: 'access' }],
    ['a malformed session id', { sub: USER, sid: 'abc', tv: 0, typ: 'access' }],
    ['a malformed user id', { sub: 'usr_12345', sid: SESSION, tv: 0, typ: 'access' }],
    ['a negative token version', { sub: USER, sid: SESSION, tv: -1, typ: 'access' }],
    ['a fractional token version', { sub: USER, sid: SESSION, tv: 1.5, typ: 'access' }],
    ['a string token version', { sub: USER, sid: SESSION, tv: '0', typ: 'access' }],
    ['a null token version', { sub: USER, sid: SESSION, tv: null, typ: 'access' }],
  ])('rejects a token with %s', (_label, payload) => {
    expect(verifyAccessToken(sign(payload))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token without an expiry', () => {
    expect(verifyAccessToken(sign({ sub: USER, sid: SESSION, tv: 0, typ: 'access' }, {}))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects tokens signed with another algorithm or secret', () => {
    const payload = { sub: USER, sid: SESSION, tv: 0, typ: 'access' };
    const none = jwt.sign(payload, '', { algorithm: 'none', expiresIn: 600 } as jwt.SignOptions);
    expect(verifyAccessToken(none)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyAccessToken(sign(payload, { expiresIn: 600 }, 'x'.repeat(48)))).toEqual({ ok: false, reason: 'invalid' });
    const hs512 = jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS512', expiresIn: 600 });
    expect(verifyAccessToken(hs512)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('AuthService - refresh tokens', () => {
  it('generates 256-bit, URL-safe, unique refresh tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect(isRefreshTokenShaped(token)).toBe(true);
    }
  });

  it('stores only a SHA-256 hash, which is deterministic and not the token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(hashRefreshToken(token));
  });

  it.each([undefined, null, 42, '', 'short', 'x'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}.`, ['a'.repeat(43)]])(
    'treats %j as not a refresh token',
    value => {
      expect(isRefreshTokenShaped(value)).toBe(false);
    }
  );
});
