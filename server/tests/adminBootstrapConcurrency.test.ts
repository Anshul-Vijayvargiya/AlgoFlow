import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { bootstrapSuperAdmin, BOOTSTRAP_LOCK_ID } from '../services/adminBootstrap';

/**
 * Hardening F2 regression test: concurrent bootstrap attempts must create at most one SUPER_ADMIN.
 *
 * Every operation goes through a small stateful store with simulated I/O latency, so all attempts interleave the way
 * separate operator processes would: each one reads "no SUPER_ADMIN" before any has written. The lock collection
 * enforces `_id` uniqueness with MongoDB's duplicate-key error (code 11000), exactly as a real server does.
 * Before the lock existed, this scenario produced one SUPER_ADMIN per attempt (final review, section 3).
 */
const { users, locks, audits } = vi.hoisted(() => ({
  users: new Map<string, any>(),
  locks: new Map<string, any>(),
  audits: [] as any[],
}));

const io = () => new Promise(resolve => setTimeout(resolve, 2 + Math.floor(Math.random() * 4)));

vi.mock('../models/User', () => ({
  User: {
    countDocuments: async (filter: any) => {
      await io();
      return [...users.values()].filter(u => u.role === filter.role).length;
    },
    findOne: async (filter: any) => {
      await io();
      const found = [...users.values()].find(u => u.email === filter.email);
      if (!found) return null;
      const doc: any = { ...found };
      doc.save = async () => {
        await io();
        users.set(String(found._id), { ...users.get(String(found._id)), role: doc.role, tokenVersion: doc.tokenVersion });
      };
      return doc;
    },
  },
}));
vi.mock('../models/SystemLock', () => ({
  SystemLock: {
    create: async (doc: any) => {
      await io();
      // The check-and-insert is one step, like MongoDB's unique _id index
      if (locks.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key error collection: systemlocks'), { code: 11000 });
      locks.set(doc._id, doc);
      return doc;
    },
    deleteOne: async (filter: any) => {
      await io();
      locks.delete(filter._id);
      return { deletedCount: 1 };
    },
  },
}));
vi.mock('../models/AdminAuditLog', () => ({
  AdminAuditLog: { create: async (entry: any) => { await io(); audits.push(entry); return entry; } },
}));

function addAccount(email: string) {
  const _id = new mongoose.Types.ObjectId();
  users.set(String(_id), { _id, email, role: 'USER', accountStatus: 'active', tokenVersion: 0 });
  return String(_id);
}

const superAdmins = () => [...users.values()].filter(u => u.role === 'SUPER_ADMIN');

describe('first-admin bootstrap under concurrent execution', () => {
  beforeEach(() => {
    users.clear();
    locks.clear();
    audits.length = 0;
  });

  it('five simultaneous attempts for five different accounts create exactly one SUPER_ADMIN', async () => {
    const accounts = Array.from({ length: 5 }, (_, i) => ({ email: `op${i}@example.com`, userId: addAccount(`op${i}@example.com`) }));

    const results = await Promise.all(accounts.map((a, i) => bootstrapSuperAdmin({ ...a, operator: `operator-${i}` })));

    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(superAdmins()).toHaveLength(1);
    for (const refused of results.filter(r => !r.ok)) {
      expect(refused).toMatchObject({ error: expect.stringMatching(/already run or is running|already exists/) });
    }
    // Only the winner is audited, and the lock stays held so bootstrap remains one-time
    expect(audits.filter(a => a.action === 'SUPER_ADMIN_BOOTSTRAP')).toHaveLength(1);
    expect(locks.has(BOOTSTRAP_LOCK_ID)).toBe(true);
  });

  it('simultaneous attempts for the same account promote it once, with one audit entry', async () => {
    const userId = addAccount('owner@example.com');
    const results = await Promise.all(
      [1, 2, 3].map(i => bootstrapSuperAdmin({ email: 'owner@example.com', userId, operator: `operator-${i}` }))
    );

    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(superAdmins()).toHaveLength(1);
    expect(users.get(userId)!.tokenVersion).toBe(1);
    expect(audits).toHaveLength(1);
  });

  it('stays one-time after success, even once no SUPER_ADMIN remains', async () => {
    const first = addAccount('first@example.com');
    expect((await bootstrapSuperAdmin({ email: 'first@example.com', userId: first, operator: 'op' })).ok).toBe(true);

    users.get(first)!.role = 'ADMIN'; // e.g. demoted later through the admin UI
    const second = addAccount('second@example.com');
    const result = await bootstrapSuperAdmin({ email: 'second@example.com', userId: second, operator: 'op' });

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/already run or is running/) });
    expect(superAdmins()).toHaveLength(0);
  });
});
