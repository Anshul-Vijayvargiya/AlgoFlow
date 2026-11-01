import { vi } from 'vitest';
import { generateAccessToken } from '../../services/authService';
import type { NewSession, RotationResult, SessionCheck } from '../../services/sessionService';
import type { UserRole } from '../../models/User';

/**
 * Route tests that mock the User model replace the session service with this stub:
 *   vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
 * `tokenFor(id, role)` records the role the "database" holds for that user and returns a real signed access token, so
 * JWT verification and requireAuth/requireRole still run for real. The real session service (rotation, reuse
 * detection, revocation) is covered by sessionLifecycle.test.ts against in-memory models.
 */
const roles = new Map<string, UserRole>();

/** a fixed, valid session id per user id (both ObjectId-shaped) */
export const sessionIdFor = (userId: string): string => `${userId.slice(0, 22)}ff`;

export const resolveSession = vi.fn(async ({ userId, sessionId }: { userId: string; sessionId: string }): Promise<SessionCheck> => {
  const role = roles.get(userId);
  return role ? { ok: true, principal: { userId, sessionId, role } } : { ok: false, reason: 'unknown_user' };
});

export const createSession = vi.fn(
  async (userId: string): Promise<NewSession> => ({
    sessionId: sessionIdFor(userId),
    refreshToken: 'R'.repeat(43),
    refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })
);

export const rotateRefreshToken = vi.fn(async (): Promise<RotationResult> => ({ ok: false, reason: 'invalid' }));
export const revokeSessionByRefreshToken = vi.fn(async () => false);
export const revokeSessionById = vi.fn(async () => false);
export const revokeAllSessions = vi.fn(async () => undefined);
export const ROTATION_GRACE_MS = 10_000;

export function tokenFor(userId: string, role: UserRole): string {
  roles.set(userId, role);
  return generateAccessToken({ userId, sessionId: sessionIdFor(userId), tokenVersion: 0 }).token;
}
