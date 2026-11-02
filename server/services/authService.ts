import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

/**
 * What an access token proves: who the user is, which session (device) it belongs to, and which token generation
 * of the account it was issued under. Role and account status are deliberately NOT in the token: they are read from
 * the database on every request (see sessionService), so demotion and suspension take effect immediately.
 */
export interface AccessClaims {
  userId: string;
  sessionId: string;
  tokenVersion: number;
}

const SALT_ROUNDS = 10;
const JWT_ALGORITHM = 'HS256';
/** the `typ` claim of an access token: a token of any other kind (or from before the refresh flow) is refused */
const ACCESS_TOKEN_TYPE = 'access';
const OBJECT_ID = /^[a-f0-9]{24}$/;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** A short-lived access JWT (ACCESS_TOKEN_TTL), and when it expires */
export function generateAccessToken({ userId, sessionId, tokenVersion }: AccessClaims, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresInSeconds = Math.floor(env.ACCESS_TOKEN_TTL / 1000);
  const token = jwt.sign({ sub: userId, sid: sessionId, tv: tokenVersion, typ: ACCESS_TOKEN_TYPE }, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: expiresInSeconds,
  });
  return { token, expiresAt: new Date(now + expiresInSeconds * 1000) };
}

export type AccessCheck = { ok: true; claims: AccessClaims } | { ok: false; reason: 'expired' | 'invalid' };

/**
 * Signature (HS256 only), expiry, and every required claim: `typ` must be "access", and `sub`, `sid` and `tv` must be
 * well-formed. The 7-day cookie tokens of the previous design have no `typ` or `sid`, so they are refused.
 */
export function verifyAccessToken(token: string): AccessCheck {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (typeof decoded !== 'object' || decoded === null) return { ok: false, reason: 'invalid' };
    const { sub, sid, tv, typ, exp } = decoded as { sub?: unknown; sid?: unknown; tv?: unknown; typ?: unknown; exp?: unknown };
    if (typ !== ACCESS_TOKEN_TYPE || typeof exp !== 'number') return { ok: false, reason: 'invalid' };
    if (typeof sub !== 'string' || !OBJECT_ID.test(sub)) return { ok: false, reason: 'invalid' };
    if (typeof sid !== 'string' || !OBJECT_ID.test(sid)) return { ok: false, reason: 'invalid' };
    if (typeof tv !== 'number' || !Number.isInteger(tv) || tv < 0) return { ok: false, reason: 'invalid' };
    return { ok: true, claims: { userId: sub, sessionId: sid, tokenVersion: tv } };
  } catch (err) {
    return { ok: false, reason: err instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
  }
}

/** A refresh token: 256 bits from the OS's CSPRNG, URL-safe. Only its hash is ever stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The stored form of a refresh token: SHA-256 (the token is random and long, so a fast hash cannot be brute-forced) */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** a value that can be a refresh token (any other cookie value is rejected before touching the database) */
export const isRefreshTokenShaped = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
