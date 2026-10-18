import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { bootstrapSuperAdmin, BOOTSTRAP_AUDIT_ACTION, BOOTSTRAP_LOCK_ID } from '../services/adminBootstrap';
import { parseBootstrapArgs } from '../scripts/bootstrapAdmin';

// Sprint 8 / B2: first-admin provisioning without a public privilege-escalation route.

const { mockUser, mockAudit, mockLock } = vi.hoisted(() => ({
  mockUser: { countDocuments: vi.fn(), findOne: vi.fn() },
  mockAudit: { create: vi.fn() },
  mockLock: { create: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock('../models/User', () => ({ User: mockUser }));
vi.mock('../models/AdminAuditLog', () => ({ AdminAuditLog: mockAudit }));
vi.mock('../models/SystemLock', () => ({ SystemLock: mockLock }));

const duplicateKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

const id = new mongoose.Types.ObjectId();
const events: string[] = [];

function account(overrides: Record<string, unknown> = {}) {
  const doc: any = { _id: id, email: 'owner@example.com', role: 'USER', accountStatus: 'active', tokenVersion: 2, ...overrides };
  doc.save = vi.fn(async () => { events.push(`save:${doc.role}`); });
  return doc;
}

const request = (overrides: Partial<Parameters<typeof bootstrapSuperAdmin>[0]> = {}) =>
  bootstrapSuperAdmin({ email: 'Owner@Example.com', userId: id.toString(), operator: 'ops@host', ...overrides });

describe('bootstrapSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    mockUser.countDocuments.mockResolvedValue(0);
    mockAudit.create.mockImplementation(async (e: any) => { events.push(`audit:${e.action}`); return e; });
    mockLock.create.mockImplementation(async () => { events.push('lock'); return {}; });
    mockLock.deleteOne.mockImplementation(async () => { events.push('unlock'); return {}; });
  });

  it('promotes the matching active account, revokes its sessions, and audits first', async () => {
    const doc = account();
    mockUser.findOne.mockResolvedValue(doc);

    const result = await request();

    expect(result).toEqual({ ok: true, userId: id.toString(), email: 'owner@example.com', previousRole: 'USER' });
    expect(mockUser.findOne).toHaveBeenCalledWith({ email: 'owner@example.com' });
    expect(doc.role).toBe('SUPER_ADMIN');
    expect(doc.tokenVersion).toBe(3);
    // lock first, audit before the promotion, and the lock is kept afterwards
    expect(events).toEqual(['lock', `audit:${BOOTSTRAP_AUDIT_ACTION}`, 'save:SUPER_ADMIN']);
    expect(mockLock.create).toHaveBeenCalledWith({ _id: BOOTSTRAP_LOCK_ID, operator: 'ops@host' });
    expect(mockAudit.create.mock.calls[0][0]).toMatchObject({
      targetType: 'SYSTEM',
      targetId: id.toString(),
      details: { method: 'cli-bootstrap', operator: 'ops@host', oldRole: 'USER', newRole: 'SUPER_ADMIN' },
    });
  });

  it('is one-time only: refuses when any SUPER_ADMIN already exists', async () => {
    mockUser.countDocuments.mockResolvedValue(1);
    const result = await request();
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
    expect(mockUser.findOne).not.toHaveBeenCalled();
    expect(mockAudit.create).not.toHaveBeenCalled();
    expect(mockLock.create).not.toHaveBeenCalled();
  });

  it('refuses when the user id does not match the email (e.g. someone pre-registered that email)', async () => {
    const doc = account();
    mockUser.findOne.mockResolvedValue(doc);
    const result = await request({ userId: new mongoose.Types.ObjectId().toString() });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/does not match/) });
    expect(doc.save).not.toHaveBeenCalled();
    expect(mockAudit.create).not.toHaveBeenCalled();
  });

  it('refuses unknown emails and never creates accounts', async () => {
    mockUser.findOne.mockResolvedValue(null);
    expect(await request()).toMatchObject({ ok: false, error: expect.stringMatching(/register/) });
  });

  it('refuses suspended accounts', async () => {
    const doc = account({ accountStatus: 'suspended' });
    mockUser.findOne.mockResolvedValue(doc);
    expect(await request()).toMatchObject({ ok: false, error: expect.stringMatching(/not active/) });
    expect(doc.save).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: 'not-an-email' }, /email/],
    [{ userId: 'abc' }, /user-id/],
    [{ operator: '   ' }, /operator/],
  ])('validates its input %o', async (overrides, message) => {
    expect(await request(overrides)).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    expect(mockUser.countDocuments).not.toHaveBeenCalled();
  });

  it('records a failure entry and rethrows when the promotion cannot be saved', async () => {
    const doc = account();
    doc.save.mockRejectedValue(new Error('write conflict'));
    mockUser.findOne.mockResolvedValue(doc);
    await expect(request()).rejects.toThrow('write conflict');
    // nothing was promoted, so the lock is released for a retry
    expect(events).toEqual(['lock', `audit:${BOOTSTRAP_AUDIT_ACTION}`, `audit:${BOOTSTRAP_AUDIT_ACTION}_FAILED`, 'unlock']);
  });

  // Hardening F2: the one-time guarantee is enforced by a unique lock document, not only by the SUPER_ADMIN count
  describe('bootstrap lock', () => {
    it('refuses without changing anything when the lock is already held', async () => {
      const doc = account();
      mockUser.findOne.mockResolvedValue(doc);
      mockLock.create.mockRejectedValue(duplicateKey());

      expect(await request()).toMatchObject({ ok: false, error: expect.stringMatching(/already run or is running/) });
      expect(mockAudit.create).not.toHaveBeenCalled();
      expect(doc.save).not.toHaveBeenCalled();
      expect(mockLock.deleteOne).not.toHaveBeenCalled();
    });

    it('propagates lock errors other than a duplicate key, without promoting', async () => {
      const doc = account();
      mockUser.findOne.mockResolvedValue(doc);
      mockLock.create.mockRejectedValue(new Error('not primary'));
      await expect(request()).rejects.toThrow('not primary');
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('re-checks for a SUPER_ADMIN under the lock and keeps the lock if one appeared', async () => {
      const doc = account();
      mockUser.findOne.mockResolvedValue(doc);
      mockUser.countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      expect(await request()).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
      expect(doc.save).not.toHaveBeenCalled();
      expect(mockLock.deleteOne).not.toHaveBeenCalled();
    });

    it('releases the lock when the audit record cannot be written (nothing promoted)', async () => {
      const doc = account();
      mockUser.findOne.mockResolvedValue(doc);
      mockAudit.create.mockRejectedValue(new Error('audit down'));
      await expect(request()).rejects.toThrow('audit down');
      expect(doc.save).not.toHaveBeenCalled();
      expect(events).toEqual(['lock', 'unlock']);
    });
  });
});

describe('bootstrap CLI arguments', () => {
  it('requires both --email and --user-id', () => {
    expect(parseBootstrapArgs(['--email', 'a@b.co', '--user-id', 'x'])).toEqual({ email: 'a@b.co', userId: 'x' });
    expect(parseBootstrapArgs(['--email', 'a@b.co'])).toHaveProperty('error');
    expect(parseBootstrapArgs([])).toHaveProperty('error');
  });

  it('accepts no password or other flags', () => {
    expect(parseBootstrapArgs(['--email', 'a@b.co', '--user-id', 'x', '--password', 'p'])).toMatchObject({ error: expect.stringMatching(/Unknown argument: --password/) });
    expect(parseBootstrapArgs(['--email', '--user-id', 'x'])).toMatchObject({ error: expect.stringMatching(/Missing value/) });
  });
});
