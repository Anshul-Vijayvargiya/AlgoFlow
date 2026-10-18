import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

const {
  mockUser,
  mockProblem,
  mockSubmission,
  mockActivityLog,
  mockAdminAuditLog,
} = vi.hoisted(() => {
  return {
    mockUser: {
      countDocuments: vi.fn().mockResolvedValue(10),
      find: vi.fn(),
      findById: vi.fn(),
    },
    mockProblem: {
      countDocuments: vi.fn().mockResolvedValue(6),
      findOne: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
    mockSubmission: {
      countDocuments: vi.fn().mockResolvedValue(45),
    },
    mockActivityLog: {
      distinct: vi.fn().mockResolvedValue([]),
    },
    mockAdminAuditLog: {
      countDocuments: vi.fn().mockResolvedValue(5),
      find: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
  };
});

// Role and status come from the database on every request; see helpers/sessionStub.ts
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
vi.mock('../models/User', () => ({ User: mockUser }));
vi.mock('../models/Problem', () => ({ Problem: mockProblem }));
vi.mock('../models/Submission', () => ({ Submission: mockSubmission }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: mockActivityLog }));
vi.mock('../models/AdminAuditLog', () => ({ AdminAuditLog: mockAdminAuditLog }));

function createQueryMock(result: any) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
    then: (onfulfilled?: (val: any) => any, onrejected?: (reason: any) => any) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected?: (reason: any) => any) =>
      Promise.resolve(result).catch(onrejected),
  };
}

describe('Phase 3 Admin Routes - RBAC, Audit Logging & Hierarchy', () => {
  const adminId = '507f1f77bcf86cd799439001';
  const superAdminId = '507f1f77bcf86cd799439002';
  const regularUserId = '507f1f77bcf86cd799439003';
  const targetAdminId = '507f1f77bcf86cd799439004';

  const userToken = tokenFor(regularUserId, 'USER');
  const adminToken = tokenFor(adminId, 'ADMIN');
  const superAdminToken = tokenFor(superAdminId, 'SUPER_ADMIN');

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitsForTesting();
  });

  // ── 1. AUTHORIZATION & RBAC GATING ─────────────────────────────────────────
  describe('Authorization & RBAC Gating', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/admin/metrics');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    it('should reject regular USER accessing admin route with 403', async () => {
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Cookie', [`algoflow_token=${userToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Access denied/i);
    });

    it('should allow ADMIN accessing metrics', async () => {
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Cookie', [`algoflow_token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.metrics.totalUsers).toBe(10);
      expect(res.body.metrics.totalProblems).toBe(6);
    });

    it('should allow SUPER_ADMIN accessing metrics', async () => {
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Cookie', [`algoflow_token=${superAdminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.metrics).toBeDefined();
    });
  });

  // ── 2. USER MANAGEMENT & HIERARCHY CONTROLS ────────────────────────────────
  describe('User Administration & Role Hierarchy', () => {
    it('should list users with pagination and search', async () => {
      mockUser.countDocuments.mockResolvedValue(1);
      mockUser.find.mockReturnValue(
        createQueryMock([
          {
            _id: new mongoose.Types.ObjectId(regularUserId),
            name: 'Learner User',
            email: 'learner@algoflow.io',
            role: 'USER',
            accountStatus: 'active',
            streakDays: 5,
            solvedCount: 12,
            createdAt: new Date(),
          },
        ])
      );

      const res = await request(app)
        .get('/api/admin/users?search=learner')
        .set('Cookie', [`algoflow_token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].name).toBe('Learner User');
    });

    it('should reject admin attempting to modify own account status (400)', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminId}/status`)
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({ status: 'suspended' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot modify your own account status/i);
    });

    it('should forbid standard ADMIN from suspending another ADMIN (403)', async () => {
      mockUser.findById.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(targetAdminId),
        name: 'Target Admin',
        email: 'target@algoflow.io',
        role: 'ADMIN',
        accountStatus: 'active',
        save: vi.fn(),
      });

      const res = await request(app)
        .patch(`/api/admin/users/${targetAdminId}/status`)
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({ status: 'suspended' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Standard ADMIN cannot modify accounts with administrative privileges/i);
    });

    it('should allow SUPER_ADMIN to suspend an ADMIN account (200)', async () => {
      const saveMock = vi.fn().mockResolvedValue({});
      mockUser.findById.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(targetAdminId),
        name: 'Target Admin',
        email: 'target@algoflow.io',
        role: 'ADMIN',
        accountStatus: 'active',
        streakDays: 0,
        solvedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: saveMock,
      });

      const res = await request(app)
        .patch(`/api/admin/users/${targetAdminId}/status`)
        .set('Cookie', [`algoflow_token=${superAdminToken}`])
        .send({ status: 'suspended' });

      expect(res.status).toBe(200);
      expect(saveMock).toHaveBeenCalled();
      expect(res.body.user.accountStatus).toBe('suspended');
      // Audit log must be recorded
      expect(mockAdminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: superAdminId,
          action: 'USER_STATUS_CHANGE',
          targetId: targetAdminId,
        })
      );
    });

    it('should forbid standard ADMIN from changing user roles (403)', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${regularUserId}/role`)
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Access denied/i);
    });

    it('should allow SUPER_ADMIN to promote a USER to ADMIN (200)', async () => {
      const saveMock = vi.fn().mockResolvedValue({});
      mockUser.findById.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(regularUserId),
        name: 'Promoted User',
        email: 'promoted@algoflow.io',
        role: 'USER',
        accountStatus: 'active',
        streakDays: 0,
        solvedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: saveMock,
      });

      const res = await request(app)
        .patch(`/api/admin/users/${regularUserId}/role`)
        .set('Cookie', [`algoflow_token=${superAdminToken}`])
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('ADMIN');
      expect(mockAdminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: superAdminId,
          action: 'USER_ROLE_CHANGE',
          targetId: regularUserId,
        })
      );
    });
  });

  // ── 3. PROBLEM CONTENT MANAGEMENT ──────────────────────────────────────────
  describe('Content Management & Audit Trail', () => {
    it('should allow ADMIN to create practice problem and record audit log', async () => {
      mockProblem.findOne.mockResolvedValue(null);
      mockProblem.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        problemId: 'lru-cache',
        title: 'LRU Cache Design',
        difficulty: 'Medium',
        category: 'Design',
      });

      const res = await request(app)
        .post('/api/admin/problems')
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({
          problemId: 'lru-cache',
          title: 'LRU Cache Design',
          difficulty: 'Medium',
          category: 'Design',
          description: 'Implement a Least Recently Used (LRU) cache with O(1) ops.',
          testCases: [{ input: 'get(1)', expected: '-1' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.problem.problemId).toBe('lru-cache');
      expect(mockAdminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: adminId,
          action: 'PROBLEM_CREATE',
        })
      );
    });

    it('should allow ADMIN to archive problem', async () => {
      mockProblem.findOneAndUpdate.mockResolvedValue({
        problemId: 'lru-cache',
        title: 'LRU Cache Design',
        publicationStatus: 'archived',
      });

      const res = await request(app)
        .delete('/api/admin/problems/lru-cache')
        .set('Cookie', [`algoflow_token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/archived successfully/i);
      expect(mockAdminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROBLEM_ARCHIVE',
        })
      );
    });

    it('should return paginated audit logs for ADMIN', async () => {
      mockAdminAuditLog.find.mockReturnValue(
        createQueryMock([
          {
            _id: new mongoose.Types.ObjectId(),
            adminId: { _id: adminId, name: 'System Admin' },
            action: 'USER_STATUS_CHANGE',
            targetType: 'USER',
            targetId: regularUserId,
            details: { newStatus: 'suspended' },
            createdAt: new Date(),
          },
        ])
      );

      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Cookie', [`algoflow_token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].action).toBe('USER_STATUS_CHANGE');
    });
  });
});
