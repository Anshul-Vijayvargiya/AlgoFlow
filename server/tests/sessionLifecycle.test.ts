import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { hashPassword } from '../services/authService';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

/**
 * Sprint 8 / B3 integration tests: the real routes, requireAuth/requireRole, sessionService and JWT handling,
 * against a small stateful in-memory stand-in for the User collection (no MongoDB is available locally or in CI).
 * The stand-in implements only the query shapes these code paths use.
 */
const { users, auditLog, UserFake, AuditFake } = vi.hoisted(() => {
  type Doc = Record<string, any>;
  const users = new Map<string, Doc>();
  const auditLog: Doc[] = [];

  const project = (doc: Doc | undefined, fields?: string) => {
    if (!doc) return null;
    const copy: Doc = { ...doc };
    if (!fields?.includes('+passwordHash')) delete copy.passwordHash;
    return copy;
  };
  const withSave = (doc: Doc | null) =>
    doc && Object.assign(doc, { save: async () => { const { save: _s, ...data } = doc; users.set(String(doc._id), { ...users.get(String(doc._id)), ...data }); } });

  // A thenable query supporting .select() and .lean(), like a mongoose Query
  const query = (find: () => Doc | undefined) => {
    let fields: string | undefined;
    const q: any = {
      select: (f: string) => ((fields = f), q),
      lean: async () => project(find(), fields),
      then: (ok: any, fail: any) => Promise.resolve(withSave(project(find(), fields))).then(ok, fail),
    };
    return q;
  };

  const matchesVersion = (doc: Doc, filter: Doc) => {
    if ('tokenVersion' in filter) return doc.tokenVersion === filter.tokenVersion;
    if (filter.$or) {
      return filter.$or.some((c: Doc) =>
        typeof c.tokenVersion === 'object' ? c.tokenVersion.$exists === 'tokenVersion' in doc : doc.tokenVersion === c.tokenVersion
      );
    }
    return true;
  };

  const UserFake = {
    findOne: (filter: Doc) => query(() => [...users.values()].find(u => u.email === filter.email)),
    findById: (id: string) => query(() => users.get(String(id))),
    updateOne: async (filter: Doc, update: Doc) => {
      const doc = users.get(String(filter._id));
      if (!doc || !matchesVersion(doc, filter)) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$inc ?? {})) doc[k] = (doc[k] ?? 0) + (v as number);
      return { modifiedCount: 1 };
    },
    countDocuments: async () => users.size,
  };
  const AuditFake = { create: async (entry: Doc) => { auditLog.push(entry); return entry; } };
  return { users, auditLog, UserFake, AuditFake };
});

vi.mock('../models/User', () => ({ User: UserFake }));
vi.mock('../models/AdminAuditLog', () => ({ AdminAuditLog: AuditFake }));
const { submissionDistinct } = vi.hoisted(() => ({ submissionDistinct: vi.fn(async () => []) }));
vi.mock('../models/Problem', () => {
  const chain: any = { select: () => chain, sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
  return { Problem: { countDocuments: async () => 0, find: () => chain } };
});
vi.mock('../models/Submission', () => ({ Submission: { countDocuments: async () => 0, distinct: submissionDistinct } }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: { distinct: async () => [] } }));

const PASSWORD = 'Correct-Horse-9';
let passwordHash: string;

async function addUser(email: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', extra: Record<string, unknown> = {}) {
  const _id = new mongoose.Types.ObjectId();
  users.set(String(_id), { _id, name: email.split('@')[0], email, passwordHash, role, accountStatus: 'active', tokenVersion: 0, createdAt: new Date(), updatedAt: new Date(), ...extra });
  return String(_id);
}

async function login(email: string, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find(c => c.startsWith('algoflow_token='));
  return { res, cookie: cookie?.split(';')[0] };
}

const me = (cookie: string) => request(app).get('/api/auth/me').set('Cookie', [cookie]);
const metrics = (cookie: string) => request(app).get('/api/admin/metrics').set('Cookie', [cookie]);

describe('Session lifecycle (login, logout, suspension, demotion, revocation)', () => {
  beforeEach(async () => {
    users.clear();
    auditLog.length = 0;
    submissionDistinct.mockClear();
    _resetRateLimitsForTesting();
    passwordHash ??= await hashPassword(PASSWORD);
  });

  describe('login and logout', () => {
    it('logs in, uses the session, and revokes it server side on logout', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const { res, cookie } = await login('ada@example.com');
      expect(res.status).toBe(200);
      expect((await me(cookie!)).body.user.id).toBe(id);

      const out = await request(app).post('/api/auth/logout').set('Cookie', [cookie!]);
      expect(out.status).toBe(200);
      expect(users.get(id)!.tokenVersion).toBe(1);

      // The copied token is useless after logout, even though it has not expired
      const replay = await me(cookie!);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('SESSION_REVOKED');
    });

    it('logout revokes every session of the user (other devices too)', async () => {
      await addUser('ada@example.com', 'USER');
      const laptop = (await login('ada@example.com')).cookie!;
      const phone = (await login('ada@example.com')).cookie!;

      await request(app).post('/api/auth/logout').set('Cookie', [laptop]);
      expect((await me(phone)).status).toBe(401);
    });

    it('a revoked token cannot be replayed at /logout to end newer sessions', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const old = (await login('ada@example.com')).cookie!;
      await request(app).post('/api/auth/logout').set('Cookie', [old]);
      const fresh = (await login('ada@example.com')).cookie!;

      await request(app).post('/api/auth/logout').set('Cookie', [old]);
      expect(users.get(id)!.tokenVersion).toBe(1);
      expect((await me(fresh)).status).toBe(200);
    });

    it('revokes a bearer-token session on logout as well', async () => {
      await addUser('ada@example.com', 'USER');
      const token = (await login('ada@example.com')).cookie!.split('=')[1];
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });

    it('accepts and revokes sessions of users created before tokenVersion existed', async () => {
      const id = await addUser('legacy@example.com', 'USER');
      delete users.get(id)!.tokenVersion;
      const { cookie } = await login('legacy@example.com');
      expect((await me(cookie!)).status).toBe(200);

      await request(app).post('/api/auth/logout').set('Cookie', [cookie!]);
      expect(users.get(id)!.tokenVersion).toBe(1);
      expect((await me(cookie!)).status).toBe(401);
    });

    // Regression (found in a local database): users created before accountStatus existed have no such field, and
    // .lean() does not apply the schema default, so they were treated as suspended right after a successful login.
    it('accepts sessions of users created before accountStatus existed, and can still suspend them', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const id = await addUser('old@example.com', 'USER');
      delete users.get(id)!.accountStatus;
      delete users.get(id)!.tokenVersion;
      const { res, cookie } = await login('old@example.com');
      expect(res.status).toBe(200);
      expect((await me(cookie!)).status).toBe(200);
      expect((await request(app).get('/api/users/profile').set('Cookie', [cookie!])).status).toBe(200);

      const root = (await login('root@example.com')).cookie!;
      await request(app).patch(`/api/admin/users/${id}/status`).set('Cookie', [root]).send({ status: 'suspended' });
      expect((await me(cookie!)).status).toBe(401);
    });

    it('fails closed on an unexpected accountStatus value', async () => {
      const id = await addUser('odd@example.com', 'USER');
      const { cookie } = await login('odd@example.com');
      users.get(id)!.accountStatus = 'pending';
      expect((await me(cookie!)).body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('rejects a session whose user no longer exists', async () => {
      const id = await addUser('gone@example.com', 'USER');
      const { cookie } = await login('gone@example.com');
      users.delete(id);
      const res = await me(cookie!);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
    });

    it('clears the cookie when it rejects a session', async () => {
      await addUser('ada@example.com', 'USER');
      const { cookie } = await login('ada@example.com');
      await request(app).post('/api/auth/logout').set('Cookie', [cookie!]);
      const res = await me(cookie!);
      expect(String(res.headers['set-cookie'])).toMatch(/algoflow_token=;/);
    });
  });

  describe('optional authentication (public problem list)', () => {
    it('personalises for a live session and treats revoked or suspended sessions as anonymous', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const cookie = (await login('ada@example.com')).cookie!;
      const list = () => request(app).get('/api/problems').set('Cookie', [cookie]);

      expect((await list()).status).toBe(200);
      expect(submissionDistinct).toHaveBeenCalledTimes(1);

      users.get(id)!.accountStatus = 'suspended';
      expect((await list()).status).toBe(200);
      users.get(id)!.accountStatus = 'active';
      await request(app).post('/api/auth/logout').set('Cookie', [cookie]);
      expect((await list()).status).toBe(200);
      expect(submissionDistinct).toHaveBeenCalledTimes(1);
    });
  });

  describe('suspended users', () => {
    it('ends existing sessions immediately when an admin suspends the account', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const targetId = await addUser('mallory@example.com', 'USER');
      const root = (await login('root@example.com')).cookie!;
      const mallory = (await login('mallory@example.com')).cookie!;
      expect((await me(mallory)).status).toBe(200);

      const suspend = await request(app).patch(`/api/admin/users/${targetId}/status`).set('Cookie', [root]).send({ status: 'suspended' });
      expect(suspend.status).toBe(200);

      const res = await me(mallory);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
      expect(auditLog.at(-1)).toMatchObject({ action: 'USER_STATUS_CHANGE', details: { newStatus: 'suspended', sessionsRevoked: true } });
    });

    it('rejects a suspended account even if only the database was changed (no token version bump)', async () => {
      const id = await addUser('mallory@example.com', 'USER');
      const mallory = (await login('mallory@example.com')).cookie!;
      users.get(id)!.accountStatus = 'suspended';

      const res = await request(app).get('/api/users/profile').set('Cookie', [mallory]);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('rejects login for a suspended account, without disclosing the suspension to a wrong password', async () => {
      await addUser('mallory@example.com', 'USER', { accountStatus: 'suspended' });
      const wrong = await login('mallory@example.com', 'not-the-password');
      expect(wrong.res.status).toBe(401);
      expect(wrong.res.body.error).toBe('Invalid email or password.');
      expect(wrong.cookie).toBeUndefined();

      const right = await login('mallory@example.com');
      expect(right.res.status).toBe(403);
      expect(right.res.body.error).toMatch(/suspended/i);
      expect(right.cookie).toBeUndefined();
    });

    it('does not revive old sessions when the account is reactivated', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const targetId = await addUser('mallory@example.com', 'USER');
      const root = (await login('root@example.com')).cookie!;
      const mallory = (await login('mallory@example.com')).cookie!;

      await request(app).patch(`/api/admin/users/${targetId}/status`).set('Cookie', [root]).send({ status: 'suspended' });
      await request(app).patch(`/api/admin/users/${targetId}/status`).set('Cookie', [root]).send({ status: 'active' });

      expect((await me(mallory)).body.code).toBe('SESSION_REVOKED');
      expect((await me((await login('mallory@example.com')).cookie!)).status).toBe(200);
    });
  });

  describe('demoted administrators', () => {
    it('loses admin access immediately when a SUPER_ADMIN demotes them', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const adminId = await addUser('eve@example.com', 'ADMIN');
      const root = (await login('root@example.com')).cookie!;
      const eve = (await login('eve@example.com')).cookie!;
      expect((await metrics(eve)).status).toBe(200);

      const demote = await request(app).patch(`/api/admin/users/${adminId}/role`).set('Cookie', [root]).send({ role: 'USER' });
      expect(demote.status).toBe(200);
      expect(auditLog.at(-1)).toMatchObject({ action: 'USER_ROLE_CHANGE', details: { oldRole: 'ADMIN', newRole: 'USER', sessionsRevoked: true } });

      expect((await metrics(eve)).status).toBe(401);
      // After logging in again she is an ordinary user
      expect((await metrics((await login('eve@example.com')).cookie!)).status).toBe(403);
    });

    it('uses the role in the database, not the role at login (direct database demotion)', async () => {
      const adminId = await addUser('eve@example.com', 'ADMIN');
      const eve = (await login('eve@example.com')).cookie!;
      users.get(adminId)!.role = 'USER';

      const res = await metrics(eve);
      expect(res.status).toBe(403);
      expect((await me(eve)).status).toBe(200);
    });

    it('a demoted SUPER_ADMIN can no longer change roles', async () => {
      const rootId = await addUser('root@example.com', 'SUPER_ADMIN');
      const targetId = await addUser('bob@example.com', 'USER');
      const root = (await login('root@example.com')).cookie!;
      users.get(rootId)!.role = 'ADMIN';

      const res = await request(app).patch(`/api/admin/users/${targetId}/role`).set('Cookie', [root]).send({ role: 'SUPER_ADMIN' });
      expect(res.status).toBe(403);
      expect(users.get(targetId)!.role).toBe('USER');
    });

    it('a role-change request that does not change the role keeps the target sessions', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const adminId = await addUser('eve@example.com', 'ADMIN');
      const root = (await login('root@example.com')).cookie!;
      const eve = (await login('eve@example.com')).cookie!;

      await request(app).patch(`/api/admin/users/${adminId}/role`).set('Cookie', [root]).send({ role: 'ADMIN' });
      expect((await metrics(eve)).status).toBe(200);
    });
  });
});
