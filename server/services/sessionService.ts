import mongoose from 'mongoose';
import { User, type UserRole } from '../models/User';
import type { TokenClaims } from './authService';

/** The authenticated caller, as the database says right now (never as the token claims). */
export interface SessionPrincipal {
  userId: string;
  role: UserRole;
}

export type SessionCheck =
  | { ok: true; principal: SessionPrincipal }
  | { ok: false; reason: 'unknown_user' | 'revoked' | 'suspended' };

/**
 * One indexed _id lookup per authenticated request. A token is valid only while its `tokenVersion` equals the
 * user's current one and the account is active, so logout, suspension and role changes revoke it immediately.
 */
export async function resolveSession(claims: TokenClaims): Promise<SessionCheck> {
  if (!mongoose.isValidObjectId(claims.userId)) return { ok: false, reason: 'unknown_user' };

  const user = await User.findById(claims.userId).select('role accountStatus tokenVersion').lean();
  if (!user) return { ok: false, reason: 'unknown_user' };
  // .lean() skips schema defaults, and documents created before the field existed have no accountStatus: a missing
  // value means the schema default 'active' (as login and the admin list treat it). Any other value fails closed.
  if ((user.accountStatus ?? 'active') !== 'active') return { ok: false, reason: 'suspended' };
  // Documents created before Sprint 8 have no tokenVersion field: treat it as 0.
  if ((user.tokenVersion ?? 0) !== claims.tokenVersion) return { ok: false, reason: 'revoked' };

  return { ok: true, principal: { userId: String(user._id), role: user.role } };
}

/**
 * Logout: revokes every session of the user, but only if the presented token is still current, so a token that is
 * already revoked cannot be replayed to log the user out of their newer sessions.
 */
export async function revokeSessionsForToken(claims: TokenClaims): Promise<boolean> {
  if (!mongoose.isValidObjectId(claims.userId)) return false;
  const versionFilter =
    claims.tokenVersion === 0
      ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
      : { tokenVersion: claims.tokenVersion };
  const result = await User.updateOne({ _id: claims.userId, ...versionFilter }, { $inc: { tokenVersion: 1 } });
  return result.modifiedCount > 0;
}
