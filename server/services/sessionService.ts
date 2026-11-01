import mongoose from 'mongoose';
import { User, type UserRole } from '../models/User';
import { AuthSession, PREVIOUS_TOKEN_HASHES_KEPT, type SessionRevokedReason } from '../models/AuthSession';
import { env } from '../config/env';
import { generateRefreshToken, hashRefreshToken, isRefreshTokenShaped, type AccessClaims } from './authService';

/** The authenticated caller, as the database says right now (never as the token claims). */
export interface SessionPrincipal {
  userId: string;
  sessionId: string;
  role: UserRole;
}

export type SessionCheck =
  | { ok: true; principal: SessionPrincipal }
  | { ok: false; reason: 'unknown_user' | 'revoked' | 'suspended' };

/**
 * A request still presenting the refresh token that was rotated away moments ago is treated as a concurrent refresh
 * (two tabs, a retried request), not as theft: it gets "try again" (409), and the session stays. Later, it is reuse.
 */
export const ROTATION_GRACE_MS = 10_000;

const activeStatus = (status: unknown) => (status ?? 'active') === 'active';

/**
 * Every authenticated request: the user must exist, be active and still be on the token's tokenVersion, AND the
 * token's session must exist, belong to that user, be unrevoked and unexpired. So logout-all, suspension and role
 * changes (tokenVersion) and single-device logout (the session) all take effect on the very next request.
 */
export async function resolveSession(claims: AccessClaims, now = new Date()): Promise<SessionCheck> {
  if (!mongoose.isValidObjectId(claims.userId) || !mongoose.isValidObjectId(claims.sessionId)) return { ok: false, reason: 'unknown_user' };

  const [user, session] = await Promise.all([
    User.findById(claims.userId).select('role accountStatus tokenVersion').lean(),
    AuthSession.findById(claims.sessionId).select('userId revokedAt expiresAt').lean(),
  ]);
  if (!user) return { ok: false, reason: 'unknown_user' };
  // .lean() skips schema defaults: a missing accountStatus is the default 'active'; any other value fails closed
  if (!activeStatus(user.accountStatus)) return { ok: false, reason: 'suspended' };
  // documents created before Sprint 8 have no tokenVersion: 0
  if ((user.tokenVersion ?? 0) !== claims.tokenVersion) return { ok: false, reason: 'revoked' };
  if (!session || String(session.userId) !== claims.userId || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'revoked' };
  }
  return { ok: true, principal: { userId: String(user._id), sessionId: claims.sessionId, role: user.role } };
}

export interface NewSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Sign-in: a new session (device) with its first refresh token. Only the token's hash is stored. */
export async function createSession(userId: string, tokenVersion: number, now = new Date()): Promise<NewSession> {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(now.getTime() + env.REFRESH_TOKEN_TTL);
  const session = await AuthSession.create({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    previousTokenHashes: [],
    tokenVersion,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: refreshExpiresAt,
  });
  return { sessionId: String(session._id), refreshToken, refreshExpiresAt };
}

export type RotationResult =
  | { ok: true; userId: string; sessionId: string; tokenVersion: number; refreshToken: string; refreshExpiresAt: Date }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'reuse' | 'suspended' | 'race' };

/** marks a session revoked (once: an already revoked session keeps its first reason and time) */
async function revokeSession(sessionId: mongoose.Types.ObjectId, reason: SessionRevokedReason, now: Date): Promise<void> {
  await AuthSession.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: now, revokedReason: reason } });
}

/**
 * Refresh: exchanges a refresh token for a new one (rotation) and says whose session it is. The old token stops
 * working at once. Checks, in order: a token of the right shape that belongs to a session; not revoked; the current
 * token (an older one of the same session is reuse: the session is revoked, unless it was rotated within the grace
 * window); not expired; the user exists, is active and is still on the session's tokenVersion. The swap itself is a
 * single conditional update on the current hash, so of two concurrent refreshes with one token exactly one wins.
 */
export async function rotateRefreshToken(rawToken: unknown, now = new Date()): Promise<RotationResult> {
  if (!isRefreshTokenShaped(rawToken)) return { ok: false, reason: 'invalid' };
  const hash = hashRefreshToken(rawToken);
  const session = await AuthSession.findOne({ $or: [{ tokenHash: hash }, { previousTokenHashes: hash }] })
    .select('userId tokenHash rotatedFromHash rotatedAt tokenVersion expiresAt revokedAt')
    .lean();
  if (!session) return { ok: false, reason: 'invalid' };
  if (session.revokedAt) return { ok: false, reason: 'revoked' };

  if (session.tokenHash !== hash) {
    const justRotated = session.rotatedFromHash === hash && session.rotatedAt && now.getTime() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
    if (justRotated) return { ok: false, reason: 'race' };
    // an old token came back after it was replaced: someone else may hold this session's tokens; end it
    await revokeSession(session._id, 'reuse_detected', now);
    return { ok: false, reason: 'reuse' };
  }
  if (session.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };

  const user = await User.findById(session.userId).select('accountStatus tokenVersion').lean();
  if (!user || !activeStatus(user.accountStatus)) {
    await revokeSession(session._id, 'account_inactive', now);
    return { ok: false, reason: user ? 'suspended' : 'revoked' };
  }
  const tokenVersion = user.tokenVersion ?? 0;
  if (tokenVersion !== session.tokenVersion) {
    await revokeSession(session._id, 'token_version', now);
    return { ok: false, reason: 'revoked' };
  }

  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(now.getTime() + env.REFRESH_TOKEN_TTL);
  const swapped = await AuthSession.findOneAndUpdate(
    { _id: session._id, tokenHash: hash, revokedAt: null },
    {
      $set: { tokenHash: hashRefreshToken(refreshToken), rotatedFromHash: hash, rotatedAt: now, lastUsedAt: now, expiresAt: refreshExpiresAt },
      $push: { previousTokenHashes: { $each: [hash], $slice: -PREVIOUS_TOKEN_HASHES_KEPT } },
    },
    { returnDocument: 'after', projection: { _id: 1 } }
  ).lean();
  // another request rotated this token between the read and the swap: it won; this one may try again
  if (!swapped) return { ok: false, reason: 'race' };

  return { ok: true, userId: String(session.userId), sessionId: String(session._id), tokenVersion, refreshToken, refreshExpiresAt };
}

/**
 * Logout of one device: revokes the session the refresh token belongs to, if the token is its current one (or the
 * one rotated away within the grace window, so a refresh racing the logout cannot keep the session alive). An older
 * or unknown token revokes nothing: a stale cookie can never end a newer session. Returns whether one was revoked.
 */
export async function revokeSessionByRefreshToken(rawToken: unknown, now = new Date()): Promise<boolean> {
  if (!isRefreshTokenShaped(rawToken)) return false;
  const hash = hashRefreshToken(rawToken);
  const graceStart = new Date(now.getTime() - ROTATION_GRACE_MS);
  const result = await AuthSession.updateOne(
    { revokedAt: null, $or: [{ tokenHash: hash }, { rotatedFromHash: hash, rotatedAt: { $gt: graceStart } }] },
    { $set: { revokedAt: now, revokedReason: 'logout' } }
  );
  return result.modifiedCount > 0;
}

/** Logout of one device by its session id (when the request carries a valid access token for it) */
export async function revokeSessionById(sessionId: string, userId: string, now = new Date()): Promise<boolean> {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const result = await AuthSession.updateOne({ _id: sessionId, userId, revokedAt: null }, { $set: { revokedAt: now, revokedReason: 'logout' } });
  return result.modifiedCount > 0;
}

/**
 * Logout of every device: bumps the user's tokenVersion (every access token and every session of the account stops
 * working on its next use, as admin actions also do) and marks the user's sessions revoked. Only called with a
 * current, valid access token (requireAuth), so a stale token can never trigger it.
 */
export async function revokeAllSessions(userId: string, now = new Date()): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await AuthSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now, revokedReason: 'logout_all' } });
}
