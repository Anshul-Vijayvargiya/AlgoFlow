import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * What a session token proves: who the user is and which token generation it belongs to. Role and account status
 * are deliberately NOT in the token: they are read from the database on every request (see sessionService), so
 * demotion and suspension take effect immediately.
 */
export interface TokenClaims {
  userId: string;
  tokenVersion: number;
}

const SALT_ROUNDS = 10;
const JWT_ALGORITHM = 'HS256';
export const TOKEN_LIFETIME = '7d';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken({ userId, tokenVersion }: TokenClaims): string {
  return jwt.sign({ sub: userId, tv: tokenVersion }, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: TOKEN_LIFETIME,
  });
}

/** Signature, algorithm, expiry and claim shape. Tokens from before Sprint 8 (no `tv`) are rejected. */
export function verifyToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { sub, tv } = decoded as { sub?: unknown; tv?: unknown };
    if (typeof sub !== 'string' || sub.length === 0) return null;
    if (typeof tv !== 'number' || !Number.isInteger(tv) || tv < 0) return null;
    return { userId: sub, tokenVersion: tv };
  } catch {
    return null;
  }
}
