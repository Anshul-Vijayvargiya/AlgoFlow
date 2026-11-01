import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../app';
import { env } from '../config/env';
import { hashPassword, hashRefreshToken } from '../services/authService';
import { rotateRefreshToken, ROTATION_GRACE_MS } from '../services/sessionService';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

/**
 * Integration tests of the whole session design: the real routes, requireAuth/requireRole, sessionService, JWT
 * handling and refresh-token rotation, against small stateful in-memory stand-ins for the User and AuthSession
 * collections (no MongoDB is available locally or in CI). The stand-ins implement only the query shapes these code
 * paths use; each update is applied synchronously, as one MongoDB document update is atomic.
 */
const { users, sessions, auditLog, UserFake, AuthSessionFake, AuditFake } = vi.hoisted(() => {
  type Doc = Record<string, any>;
  const users = new Map<string, Doc>();
  const sessions = new Map<string, Doc>();
  const auditLog: Doc[] = [];
  let sessionCounter = 0;

  const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);
  /** the filter operators the session service uses: equality (also "array contains"), null, $gt, $or */
  const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([key, cond]) => {
      if (key === '$or') return (cond as Doc[]).some(c => matches(doc, c));
      const value = doc[key];
      if (cond === null) return value == null;
      if (cond && typeof cond === 'object' && '$gt' in cond) return value != null && value > cond.$gt;
      if (Array.isArray(value)) return value.some(v => same(v, cond));
      return same(value, cond);
    });
  const applyUpdate = (doc: Doc, update: Doc) => {
    Object.assign(doc, update.$set ?? {});
    for (const [k, v] of Object.entries(update.$inc ?? {})) doc[k] = (doc[k] ?? 0) + (v as number);
    for (const [k, v] of Object.entries(update.$push ?? {}) as [string, Doc][]) {
      const list = [...(doc[k] ?? []), ...v.$each];
      doc[k] = v.$slice < 0 ? list.slice(v.$slice) : list;
    }
  };

  const projectUser = (doc: Doc | undefined, fields?: string) => {
    if (!doc) return null;
    const copy: Doc = { ...doc };
    if (!fields?.includes('+passwordHash')) delete copy.passwordHash;
    return copy;
  };
  const withSave = (doc: Doc | null) =>
    doc && Object.assign(doc, { save: async () => { const { save: _s, ...data } = doc; users.set(String(doc._id), { ...users.get(String(doc._id)), ...data }); } });

  // A thenable query supporting .select() and .lean(), like a mongoose Query
  const userQuery = (find: () => Doc | undefined) => {
    let fields: string | undefined;
    const q: any = {
      select: (f: string) => ((fields = f), q),
      lean: async () => projectUser(find(), fields),
      then: (ok: any, fail: any) => Promise.resolve(withSave(projectUser(find(), fields))).then(ok, fail),
    };
    return q;
  };
  const leanQuery = (find: () => Doc | undefined) => {
    const q: any = { select: () => q, lean: async () => { const doc = find(); return doc ? structuredClone(doc) : null; } };
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
    findOne: (filter: Doc) => userQuery(() => [...users.values()].find(u => u.email === filter.email)),
    findById: (id: string) => userQuery(() => users.get(String(id))),
    updateOne: async (filter: Doc, update: Doc) => {
      const doc = users.get(String(filter._id));
      if (!doc || !matchesVersion(doc, filter)) return { modifiedCount: 0 };
      applyUpdate(doc, update);
      return { modifiedCount: 1 };
    },
    countDocuments: async () => users.size,
  };

  const AuthSessionFake = {
    create: async (data: Doc) => {
      const doc = { _id: (++sessionCounter).toString(16).padStart(24, 'a'), revokedAt: null, ...data };
      sessions.set(String(doc._id), doc);
      return doc;
    },
    findById: (id: string) => leanQuery(() => sessions.get(String(id))),
    findOne: (filter: Doc) => leanQuery(() => [...sessions.values()].find(s => matches(s, filter))),
    updateOne: async (filter: Doc, update: Doc) => {
      const doc = [...sessions.values()].find(s => matches(s, filter));
      if (doc) applyUpdate(doc, update);
      return { modifiedCount: doc ? 1 : 0 };
    },
    updateMany: async (filter: Doc, update: Doc) => {
      const docs = [...sessions.values()].filter(s => matches(s, filter));
      docs.forEach(d => applyUpdate(d, update));
      return { modifiedCount: docs.length };
    },
    findOneAndUpdate: (filter: Doc, update: Doc) => ({
      lean: async () => {
        const doc = [...sessions.values()].find(s => matches(s, filter));
        if (!doc) return null;
        applyUpdate(doc, update);
        return { _id: doc._id };
      },
    }),
  };
  const AuditFake = { create: async (entry: Doc) => { auditLog.push(entry); return entry; } };
  return { users, sessions, auditLog, UserFake, AuthSessionFake, AuditFake };
});

vi.mock('../models/User', () => ({ User: UserFake }));
vi.mock('../models/AuthSession', () => ({ AuthSession: AuthSessionFake, PREVIOUS_TOKEN_HASHES_KEPT: 10 }));
vi.mock('../models/AdminAuditLog', () => ({ AdminAuditLog: AuditFake }));
const { submissionDistinct } = vi.hoisted(() => ({ submissionDistinct: vi.fn(async () => []) }));
vi.mock('../models/Problem', () => {
  const chain: any = { select: () => chain, sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
  return { Problem: { countDocuments: async () => 0, find: () => chain } };
});
vi.mock('../models/Submission', () => ({ Submission: { countDocuments: async () => 0, distinct: submissionDistinct } }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: { distinct: async () => [] } }));

const PASSWORD = 'Correct-Horse-9';
const FRONT_END = new URL(env.CLIENT_URL).origin;
let passwordHash: string;

async function addUser(email: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', extra: Record<string, unknown> = {}) {
  const _id = new mongoose.Types.ObjectId();
  users.set(String(_id), { _id, name: email.split('@')[0], email, passwordHash, role, accountStatus: 'active', tokenVersion: 0, createdAt: new Date(), updatedAt: new Date(), ...extra });
  return String(_id);
}

const setCookies = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
const refreshCookieOf = (res: request.Response) => setCookies(res).find(c => c.startsWith('algoflow_refresh='))?.split(';')[0].split('=')[1];

/** a signed-in device: its in-memory access token and its refresh cookie */
interface Device { access: string; refresh: string }

async function login(email: string, password = PASSWORD): Promise<{ res: request.Response; device?: Device }> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  const refresh = refreshCookieOf(res);
  return { res, device: res.status === 200 && refresh ? { access: res.body.accessToken, refresh } : undefined };
}
const signIn = async (email: string) => (await login(email)).device!;

const refresh = (token: string | undefined) => {
  const req = request(app).post('/api/auth/refresh').set('Origin', FRONT_END).set('Sec-Fetch-Site', 'same-origin');
  return token === undefined ? req : req.set('Cookie', [`algoflow_refresh=${token}`]);
};
/** refreshes a device the way the browser does: the new cookie replaces the old one, the new access token is kept */
async function renew(device: Device): Promise<request.Response> {
  const res = await refresh(device.refresh);
  if (res.status === 200) Object.assign(device, { access: res.body.accessToken, refresh: refreshCookieOf(res)! });
  return res;
}
const logout = (device: Partial<Device>) => {
  const req = request(app).post('/api/auth/logout');
  if (device.access) req.set('Authorization', `Bearer ${device.access}`);
  return device.refresh ? req.set('Cookie', [`algoflow_refresh=${device.refresh}`]) : req;
};
const logoutAll = (device: Device) => request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${device.access}`).set('Cookie', [`algoflow_refresh=${device.refresh}`]);

const me = (device: Pick<Device, 'access'>) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${device.access}`);
const metrics = (device: Pick<Device, 'access'>) => request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${device.access}`);
const asAdmin = (device: Device) => ({
  setStatus: (id: string, status: string) => request(app).patch(`/api/admin/users/${id}/status`).set('Authorization', `Bearer ${device.access}`).send({ status }),
  setRole: (id: string, role: string) => request(app).patch(`/api/admin/users/${id}/role`).set('Authorization', `Bearer ${device.access}`).send({ role }),
});

const sessionOf = (device: Device) => [...sessions.values()].find(s => s.tokenHash === hashRefreshToken(device.refresh))!;
/** moves a session's last rotation back in time, past the concurrent-refresh grace window */
const ageRotation = (sessionId: unknown, ms = ROTATION_GRACE_MS + 1_000) => {
  const s = sessions.get(String(sessionId))!;
  s.rotatedAt = new Date(s.rotatedAt.getTime() - ms);
};

describe('Session lifecycle (login, refresh, logout, suspension, demotion, revocation)', () => {
  beforeEach(async () => {
    users.clear();
    sessions.clear();
    auditLog.length = 0;
    submissionDistinct.mockClear();
    _resetRateLimitsForTesting();
    passwordHash ??= await hashPassword(PASSWORD);
  });

  describe('sign-in', () => {
    it('creates one session per sign-in and stores only the refresh token\'s hash', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const laptop = await signIn('ada@example.com');
      const phone = await signIn('ada@example.com');

      expect(sessions.size).toBe(2);
      for (const device of [laptop, phone]) {
        const stored = sessionOf(device);
        expect(String(stored.userId)).toBe(id);
        expect(stored.tokenHash).toBe(hashRefreshToken(device.refresh));
        expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(env.REFRESH_TOKEN_TTL - 10_000);
      }
      const stored = JSON.stringify([...sessions.values()]);
      expect(stored).not.toContain(laptop.refresh);
      expect(stored).not.toContain(phone.refresh);
      expect((await me(laptop)).body.user.id).toBe(id);
    });

    it('does not create a session for a wrong password or a suspended account', async () => {
      await addUser('mallory@example.com', 'USER', { accountStatus: 'suspended' });
      const wrong = await login('mallory@example.com', 'not-the-password');
      expect(wrong.res.status).toBe(401);
      expect(wrong.res.body.error).toBe('Invalid email or password.');

      const right = await login('mallory@example.com');
      expect(right.res.status).toBe(403);
      expect(right.res.body.error).toMatch(/suspended/i);
      expect(right.device).toBeUndefined();
      expect(sessions.size).toBe(0);
    });
  });

  describe('access tokens', () => {
    it('answers an expired access token with ACCESS_TOKEN_EXPIRED, and a refresh gives a working one', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const sid = String(sessionOf(device)._id);
      const expired = jwt.sign({ sub: id, sid, tv: 0, typ: 'access' }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -5 });

      const res = await me({ access: expired });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ACCESS_TOKEN_EXPIRED');

      expect((await renew(device)).status).toBe(200);
      expect((await me(device)).status).toBe(200);
    });

    it('ignores the previous design\'s cookie and tokens', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      // a valid access token in the old cookie is not read
      const viaCookie = await request(app).get('/api/auth/me').set('Cookie', [`algoflow_token=${device.access}`]);
      expect(viaCookie.body.code).toBe('AUTH_REQUIRED');
      // an old 7-day token (no session id, no token type) is refused even as a Bearer token
      const legacy = jwt.sign({ sub: id, tv: 0 }, env.JWT_SECRET, { expiresIn: '7d' });
      expect((await me({ access: legacy })).body.code).toBe('SESSION_INVALID');
    });

    it('refuses an access token whose session belongs to another user', async () => {
      await addUser('ada@example.com', 'USER');
      const bobId = await addUser('bob@example.com', 'USER');
      const ada = await signIn('ada@example.com');
      const forged = jwt.sign({ sub: bobId, sid: String(sessionOf(ada)._id), tv: 0, typ: 'access' }, env.JWT_SECRET, { expiresIn: 600 });
      expect((await me({ access: forged })).body.code).toBe('SESSION_REVOKED');
    });
  });

  describe('refresh and rotation', () => {
    it('rotates the refresh token on every use: the new one works, the old one stops working', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const first = device.refresh;

      const res = await renew(device);
      expect(res.status).toBe(200);
      expect(device.refresh).not.toBe(first);
      expect((await me(device)).status).toBe(200);
      const stored = sessionOf(device);
      expect(stored.previousTokenHashes).toEqual([hashRefreshToken(first)]);
      expect(stored.rotatedFromHash).toBe(hashRefreshToken(first));

      expect((await renew(device)).status).toBe(200);
      expect((await renew(device)).status).toBe(200);
      expect(sessions.size).toBe(1);
    });

    it('treats a rotated token presented again after the grace window as theft: the whole session ends', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const stolen = device.refresh;
      await renew(device);
      ageRotation(sessionOf(device)._id);

      const replay = await refresh(stolen);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('SESSION_REVOKED');
      expect(String(setCookies(replay))).toMatch(/algoflow_refresh=;/);

      // the legitimate holder is signed out too: refresh and the access token both stop working
      expect(sessionOf(device).revokedReason).toBe('reuse_detected');
      expect((await renew(device)).body.code).toBe('SESSION_REVOKED');
      expect((await me(device)).body.code).toBe('SESSION_REVOKED');
    });

    it('detects reuse of any earlier token of the session at once, not only the last one', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const oldest = device.refresh;
      await renew(device);
      await renew(device);

      const replay = await refresh(oldest);
      expect(replay.body.code).toBe('SESSION_REVOKED');
      expect(sessionOf(device).revokedReason).toBe('reuse_detected');
    });

    it('answers a refresh with the just-rotated token within the grace window with 409, keeping the session', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const previous = device.refresh;
      await renew(device);

      const late = await refresh(previous);
      expect(late.status).toBe(409);
      expect(late.body.code).toBe('REFRESH_IN_PROGRESS');
      expect(setCookies(late)).toEqual([]);
      expect(sessionOf(device).revokedAt).toBeNull();
      expect((await renew(device)).status).toBe(200);
    });

    it('lets exactly one of several concurrent refreshes with the same token win; the others get 409', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');

      const results = await Promise.all(Array.from({ length: 5 }, () => refresh(device.refresh)));
      const statuses = results.map(r => r.status).sort();
      expect(statuses).toEqual([200, 409, 409, 409, 409]);
      const winner = results.find(r => r.status === 200)!;

      // the session survives and continues with the winner's token
      const continued: Device = { access: winner.body.accessToken, refresh: refreshCookieOf(winner)! };
      expect(sessionOf(continued).revokedAt).toBeNull();
      expect((await renew(continued)).status).toBe(200);
    });

    it('swaps the token atomically in the service: concurrent rotations of one token produce one new token', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const results = await Promise.all(Array.from({ length: 8 }, () => rotateRefreshToken(device.refresh)));
      expect(results.filter(r => r.ok)).toHaveLength(1);
      expect(results.filter(r => !r.ok && r.reason === 'race')).toHaveLength(7);
    });

    it('refuses an expired session and clears its cookie', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      sessionOf(device).expiresAt = new Date(Date.now() - 1_000);

      const res = await refresh(device.refresh);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('REFRESH_EXPIRED');
      expect(String(setCookies(res))).toMatch(/algoflow_refresh=;/);
      // the access token of an expired session is refused too
      expect((await me(device)).body.code).toBe('SESSION_REVOKED');
    });

    it.each([
      ['no cookie', undefined],
      ['an empty cookie', ''],
      ['a malformed cookie', 'not-a-refresh-token'],
      ['an unknown token of the right shape', 'x'.repeat(43)],
      ['an access token in the refresh cookie', null],
    ])('refuses %s with REFRESH_INVALID', async (_label, value) => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const res = await refresh(value === null ? device.access : value);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('REFRESH_INVALID');
      expect(sessionOf(device).revokedAt).toBeNull();
    });

    it('refuses a refresh from another origin or a cross-site context, and the session is untouched', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const cookie = [`algoflow_refresh=${device.refresh}`];

      const evil = await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Origin', 'https://evil.example');
      const crossSite = await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Origin', FRONT_END).set('Sec-Fetch-Site', 'cross-site');
      const noOrigin = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      for (const res of [evil, crossSite, noOrigin]) {
        expect(res.status).toBe(403);
        expect(res.body.accessToken).toBeUndefined();
      }
      expect(sessionOf(device).previousTokenHashes).toEqual([]);
      expect((await renew(device)).status).toBe(200);
    });
  });

  describe('logout', () => {
    it('ends only this device\'s session: its refresh token and access token stop working, other devices stay', async () => {
      await addUser('ada@example.com', 'USER');
      const laptop = await signIn('ada@example.com');
      const phone = await signIn('ada@example.com');

      const out = await logout(laptop);
      expect(out.status).toBe(200);
      expect(String(setCookies(out))).toMatch(/algoflow_refresh=;/);

      expect((await me(laptop)).body.code).toBe('SESSION_REVOKED');
      expect((await refresh(laptop.refresh)).body.code).toBe('SESSION_REVOKED');
      expect(sessionOf(laptop).revokedReason).toBe('logout');
      expect((await me(phone)).status).toBe(200);
      expect((await renew(phone)).status).toBe(200);
    });

    it('works with only the access token (no cookie), and with only the cookie', async () => {
      await addUser('ada@example.com', 'USER');
      const a = await signIn('ada@example.com');
      const b = await signIn('ada@example.com');
      await logout({ access: a.access });
      await logout({ refresh: b.refresh });
      expect((await me(a)).status).toBe(401);
      expect((await me(b)).status).toBe(401);
    });

    it('a stale refresh token replayed at /logout never ends a newer session', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const stale = device.refresh;
      await renew(device);
      ageRotation(sessionOf(device)._id);

      const res = await logout({ refresh: stale });
      expect(res.status).toBe(200);
      expect(sessionOf(device).revokedAt).toBeNull();
      expect((await me(device)).status).toBe(200);

      // nor does the cookie of a session that was already logged out end the next sign-in
      const old = await signIn('ada@example.com');
      await logout(old);
      const fresh = await signIn('ada@example.com');
      await logout({ refresh: old.refresh });
      expect((await me(fresh)).status).toBe(200);
    });

    it('a logout racing a refresh still ends the session (the just-rotated token counts)', async () => {
      await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const before = device.refresh;
      await renew(device); // the refresh won; the browser's logout request still carried the previous cookie

      await logout({ refresh: before });
      expect(sessionOf(device).revokedReason).toBe('logout');
      expect((await renew(device)).status).toBe(401);
    });

    it('logout-all ends every session and access token of the account, and needs a valid access token', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const laptop = await signIn('ada@example.com');
      const phone = await signIn('ada@example.com');

      // a refresh cookie alone (e.g. a stale one) cannot sign everyone out
      expect((await request(app).post('/api/auth/logout-all').set('Cookie', [`algoflow_refresh=${laptop.refresh}`])).status).toBe(401);

      const res = await logoutAll(laptop);
      expect(res.status).toBe(200);
      expect(users.get(id)!.tokenVersion).toBe(1);
      for (const device of [laptop, phone]) {
        expect((await me(device)).body.code).toBe('SESSION_REVOKED');
        expect((await refresh(device.refresh)).body.code).toBe('SESSION_REVOKED');
        expect(sessionOf(device).revokedReason).toBe('logout_all');
      }
      // signing in again works
      expect((await me(await signIn('ada@example.com'))).status).toBe(200);
    });

    it('accepts and revokes sessions of users created before tokenVersion existed', async () => {
      const id = await addUser('legacy@example.com', 'USER');
      delete users.get(id)!.tokenVersion;
      const device = await signIn('legacy@example.com');
      expect((await me(device)).status).toBe(200);
      expect((await renew(device)).status).toBe(200);

      await logoutAll(device);
      expect(users.get(id)!.tokenVersion).toBe(1);
      expect((await me(device)).status).toBe(401);
    });
  });

  describe('account status', () => {
    // Regression (found in a local database): users created before accountStatus existed have no such field, and
    // .lean() does not apply the schema default, so they were treated as suspended right after a successful login.
    it('accepts sessions of users created before accountStatus existed, and can still suspend them', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const id = await addUser('old@example.com', 'USER');
      delete users.get(id)!.accountStatus;
      delete users.get(id)!.tokenVersion;
      const device = await signIn('old@example.com');
      expect((await me(device)).status).toBe(200);
      expect((await renew(device)).status).toBe(200);
      expect((await request(app).get('/api/users/profile').set('Authorization', `Bearer ${device.access}`)).status).toBe(200);

      const root = await signIn('root@example.com');
      await asAdmin(root).setStatus(id, 'suspended');
      expect((await me(device)).status).toBe(401);
    });

    it('fails closed on an unexpected accountStatus value', async () => {
      const id = await addUser('odd@example.com', 'USER');
      const device = await signIn('odd@example.com');
      users.get(id)!.accountStatus = 'pending';
      expect((await me(device)).body.code).toBe('ACCOUNT_SUSPENDED');
      expect((await refresh(device.refresh)).body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('ends existing sessions immediately when an admin suspends the account; refresh cannot revive them', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const targetId = await addUser('mallory@example.com', 'USER');
      const root = await signIn('root@example.com');
      const mallory = await signIn('mallory@example.com');
      expect((await me(mallory)).status).toBe(200);

      expect((await asAdmin(root).setStatus(targetId, 'suspended')).status).toBe(200);

      const res = await me(mallory);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
      const renewed = await refresh(mallory.refresh);
      expect(renewed.status).toBe(401);
      expect(renewed.body.code).toBe('ACCOUNT_SUSPENDED');
      expect(sessionOf(mallory).revokedReason).toBe('account_inactive');
      expect(auditLog.at(-1)).toMatchObject({ action: 'USER_STATUS_CHANGE', details: { newStatus: 'suspended', sessionsRevoked: true } });
    });

    it('rejects a suspended account even if only the database was changed (no token version bump)', async () => {
      const id = await addUser('mallory@example.com', 'USER');
      const mallory = await signIn('mallory@example.com');
      users.get(id)!.accountStatus = 'suspended';

      const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${mallory.access}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
      expect((await refresh(mallory.refresh)).body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('does not revive old sessions when the account is reactivated', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const targetId = await addUser('mallory@example.com', 'USER');
      const root = await signIn('root@example.com');
      const mallory = await signIn('mallory@example.com');

      await asAdmin(root).setStatus(targetId, 'suspended');
      await asAdmin(root).setStatus(targetId, 'active');

      expect((await me(mallory)).body.code).toBe('SESSION_REVOKED');
      expect((await refresh(mallory.refresh)).body.code).toBe('SESSION_REVOKED');
      expect((await me(await signIn('mallory@example.com'))).status).toBe(200);
    });

    it('rejects the sessions of a deleted user, access and refresh alike', async () => {
      const id = await addUser('gone@example.com', 'USER');
      const device = await signIn('gone@example.com');
      users.delete(id);

      const res = await me(device);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
      expect((await refresh(device.refresh)).body.code).toBe('SESSION_REVOKED');
      expect(sessionOf(device).revokedReason).toBe('account_inactive');
    });
  });

  describe('optional authentication (public problem list)', () => {
    it('personalises for a live session and treats revoked or suspended sessions as anonymous', async () => {
      const id = await addUser('ada@example.com', 'USER');
      const device = await signIn('ada@example.com');
      const list = () => request(app).get('/api/problems').set('Authorization', `Bearer ${device.access}`);

      expect((await list()).status).toBe(200);
      expect(submissionDistinct).toHaveBeenCalledTimes(1);

      users.get(id)!.accountStatus = 'suspended';
      expect((await list()).status).toBe(200);
      users.get(id)!.accountStatus = 'active';
      await logout(device);
      expect((await list()).status).toBe(200);
      expect(submissionDistinct).toHaveBeenCalledTimes(1);
    });
  });

  describe('demoted administrators', () => {
    it('loses admin access immediately when a SUPER_ADMIN demotes them, and refresh cannot restore it', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const adminId = await addUser('eve@example.com', 'ADMIN');
      const root = await signIn('root@example.com');
      const eve = await signIn('eve@example.com');
      expect((await metrics(eve)).status).toBe(200);

      const demote = await asAdmin(root).setRole(adminId, 'USER');
      expect(demote.status).toBe(200);
      expect(auditLog.at(-1)).toMatchObject({ action: 'USER_ROLE_CHANGE', details: { oldRole: 'ADMIN', newRole: 'USER', sessionsRevoked: true } });

      expect((await metrics(eve)).status).toBe(401);
      expect((await refresh(eve.refresh)).body.code).toBe('SESSION_REVOKED');
      expect(sessionOf(eve).revokedReason).toBe('token_version');
      // After logging in again she is an ordinary user
      expect((await metrics(await signIn('eve@example.com'))).status).toBe(403);
    });

    it('uses the role in the database, not the role at login (direct database demotion)', async () => {
      const adminId = await addUser('eve@example.com', 'ADMIN');
      const eve = await signIn('eve@example.com');
      users.get(adminId)!.role = 'USER';

      expect((await metrics(eve)).status).toBe(403);
      expect((await me(eve)).status).toBe(200);
      // a refreshed access token does not restore the old role either
      await renew(eve);
      expect((await metrics(eve)).status).toBe(403);
    });

    it('a demoted SUPER_ADMIN can no longer change roles', async () => {
      const rootId = await addUser('root@example.com', 'SUPER_ADMIN');
      const targetId = await addUser('bob@example.com', 'USER');
      const root = await signIn('root@example.com');
      users.get(rootId)!.role = 'ADMIN';

      const res = await asAdmin(root).setRole(targetId, 'SUPER_ADMIN');
      expect(res.status).toBe(403);
      expect(users.get(targetId)!.role).toBe('USER');
    });

    it('a role-change request that does not change the role keeps the target sessions', async () => {
      await addUser('root@example.com', 'SUPER_ADMIN');
      const adminId = await addUser('eve@example.com', 'ADMIN');
      const root = await signIn('root@example.com');
      const eve = await signIn('eve@example.com');

      await asAdmin(root).setRole(adminId, 'ADMIN');
      expect((await metrics(eve)).status).toBe(200);
      expect((await renew(eve)).status).toBe(200);
    });
  });
});
