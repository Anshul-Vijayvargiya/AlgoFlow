import { vi } from 'vitest';
import { generateToken } from '../../services/authService';
import type { SessionCheck } from '../../services/sessionService';
import type { UserRole } from '../../models/User';

/**
 * Route tests that mock the User model replace the session lookup with this stub:
 *   vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
 * `tokenFor(id, role)` records the role the "database" holds for that user and returns a real signed token, so JWT
 * verification and requireAuth/requireRole still run for real. The real lookup is covered by sessionLifecycle.test.ts.
 */
const roles = new Map<string, UserRole>();

export const resolveSession = vi.fn(async ({ userId }: { userId: string }): Promise<SessionCheck> => {
  const role = roles.get(userId);
  return role ? { ok: true, principal: { userId, role } } : { ok: false, reason: 'unknown_user' };
});

export const revokeSessionsForToken = vi.fn(async () => true);

export function tokenFor(userId: string, role: UserRole): string {
  roles.set(userId, role);
  return generateToken({ userId, tokenVersion: 0 });
}
