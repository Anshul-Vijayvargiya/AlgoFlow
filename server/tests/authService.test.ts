import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../services/authService';
import { env } from '../config/env';

describe('AuthService - Hashing & Token Operations', () => {
  it('should hash a password securely and verify matching password', async () => {
    const rawPass = 'SecretP@ssw0rd123';
    const hash = await hashPassword(rawPass);

    expect(hash).not.toBe(rawPass);
    expect(hash.length).toBeGreaterThan(20);

    const isMatch = await comparePassword(rawPass, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await comparePassword('WrongP@ssword', hash);
    expect(isWrongMatch).toBe(false);
  });

  it('should sign and verify valid JWT tokens', () => {
    const token = generateToken({ userId: 'usr_12345', tokenVersion: 3 });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded).toEqual({ userId: 'usr_12345', tokenVersion: 3 });
  });

  // Sprint 8: role and status are never trusted from the token
  it('should not put the role or account status into the token', () => {
    const [, body] = generateToken({ userId: 'usr_12345', tokenVersion: 0 }).split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub', 'tv']);
  });

  it('should reject pre-Sprint-8 tokens that carry a role but no token version', () => {
    const legacy = jwt.sign({ userId: 'usr_12345', role: 'SUPER_ADMIN' }, env.JWT_SECRET, { expiresIn: '7d' });
    expect(verifyToken(legacy)).toBeNull();
  });

  it('should reject tokens with a non-integer or negative token version', () => {
    for (const tv of [-1, 1.5, '0', null]) {
      const token = jwt.sign({ sub: 'usr_12345', tv }, env.JWT_SECRET, { expiresIn: '7d' });
      expect(verifyToken(token)).toBeNull();
    }
  });

  it('should reject tokens signed with another algorithm or secret', () => {
    const none = jwt.sign({ sub: 'usr_12345', tv: 0 }, '', { algorithm: 'none' } as jwt.SignOptions);
    expect(verifyToken(none)).toBeNull();
    const otherSecret = jwt.sign({ sub: 'usr_12345', tv: 0 }, 'x'.repeat(48), { expiresIn: '7d' });
    expect(verifyToken(otherSecret)).toBeNull();
  });

  it('should return null for malformed or invalid JWT tokens', () => {
    const decoded = verifyToken('invalid.garbage.token');
    expect(decoded).toBeNull();
  });
});
