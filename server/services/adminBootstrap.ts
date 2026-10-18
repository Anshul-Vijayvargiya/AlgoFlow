import mongoose from 'mongoose';
import { z } from 'zod';
import { User } from '../models/User';
import { AdminAuditLog } from '../models/AdminAuditLog';
import { SystemLock } from '../models/SystemLock';

/**
 * One-time creation of the first SUPER_ADMIN in an environment where seeding is disabled (staging, production).
 * Operator-run only (server/scripts/bootstrapAdmin.ts); there is deliberately no HTTP route.
 *
 * - Promotes an EXISTING account that its owner registered and logged into through the normal sign-up. The script
 *   never sees, sets or prints a password.
 * - Requires both the email and the account id. The operator reads the id from GET /api/auth/me while logged in, which
 *   proves they control the account (registration has no email verification, so the email alone proves nothing).
 * - Refuses once any SUPER_ADMIN exists: further role changes go through the audited PATCH /api/admin/users/:id/role.
 * - Concurrency-safe: before promoting it inserts the lock document `_id: 'super-admin-bootstrap'`. `_id` is unique,
 *   so when several runs race exactly one insert succeeds and the others are refused. The lock is kept after a
 *   successful promotion (bootstrap stays one-time even if that SUPER_ADMIN is later demoted) and released only when
 *   the promotion itself fails, so the operator can retry.
 * - Writes the audit record BEFORE promoting, so a promotion can never exist without one.
 */
export const BOOTSTRAP_AUDIT_ACTION = 'SUPER_ADMIN_BOOTSTRAP';
export const BOOTSTRAP_LOCK_ID = 'super-admin-bootstrap';

const isDuplicateKey = (err: unknown) => (err as { code?: unknown } | null)?.code === 11000;
// If a run is killed between taking the lock and promoting, the lock stays and bootstrap is refused. Recovery is a
// manual, deliberate step: confirm no SUPER_ADMIN exists, then delete { _id: 'super-admin-bootstrap' } from the
// systemlocks collection.

export interface BootstrapRequest {
  email: string;
  userId: string;
  operator: string;
}

export type BootstrapResult =
  | { ok: true; userId: string; email: string; previousRole: string }
  | { ok: false; error: string };

const emailSchema = z.string().trim().toLowerCase().email();

export async function bootstrapSuperAdmin(input: BootstrapRequest): Promise<BootstrapResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, error: 'A valid --email is required.' };
  if (!mongoose.isValidObjectId(input.userId)) return { ok: false, error: 'A valid --user-id is required.' };
  const operator = input.operator.trim().slice(0, 200);
  if (!operator) return { ok: false, error: 'An operator identity is required for the audit record.' };

  const existingSuperAdmins = await User.countDocuments({ role: 'SUPER_ADMIN' });
  if (existingSuperAdmins > 0) {
    return {
      ok: false,
      error: 'A SUPER_ADMIN already exists. Bootstrap is one-time only; use the audited role-management route instead.',
    };
  }

  const user = await User.findOne({ email: email.data });
  if (!user) {
    return { ok: false, error: 'No account with that email. The owner must register through the normal sign-up first.' };
  }
  if (user._id.toString() !== input.userId) {
    return { ok: false, error: 'The --user-id does not match the account with that email. Nothing was changed.' };
  }
  if (user.accountStatus !== 'active') {
    return { ok: false, error: 'The account is not active. Nothing was changed.' };
  }

  try {
    await SystemLock.create({ _id: BOOTSTRAP_LOCK_ID, operator });
  } catch (err) {
    if (isDuplicateKey(err)) {
      return {
        ok: false,
        error: 'Bootstrap has already run or is running right now (lock is held). Nothing was changed.',
      };
    }
    throw err;
  }
  // From here on the lock is held: release it on any refusal or failure, since nothing was promoted
  const release = () => SystemLock.deleteOne({ _id: BOOTSTRAP_LOCK_ID }).catch(() => {});

  // Re-check under the lock: the count above can be stale if another run finished in the meantime
  if ((await User.countDocuments({ role: 'SUPER_ADMIN' })) > 0) {
    // Keep the lock: a SUPER_ADMIN exists, so bootstrap must never run again
    return { ok: false, error: 'A SUPER_ADMIN already exists. Nothing was changed.' };
  }

  const previousRole = user.role;
  const audit = {
    adminId: user._id,
    targetType: 'SYSTEM' as const,
    targetId: user._id.toString(),
    details: { method: 'cli-bootstrap', operator, userEmail: user.email, oldRole: previousRole, newRole: 'SUPER_ADMIN' },
  };
  try {
    await AdminAuditLog.create({ ...audit, action: BOOTSTRAP_AUDIT_ACTION });
  } catch (err) {
    await release();
    throw err;
  }

  try {
    user.role = 'SUPER_ADMIN';
    // End any session that was opened with the old role
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
  } catch (err) {
    await AdminAuditLog.create({ ...audit, action: `${BOOTSTRAP_AUDIT_ACTION}_FAILED` }).catch(() => {});
    await release();
    throw err;
  }

  return { ok: true, userId: user._id.toString(), email: user.email, previousRole };
}
