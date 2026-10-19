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

    it('should reject an invalid status with its custom message (400)', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${regularUserId}/status`)
        .set('Cookie', [`algoflow_token=${adminToken}`])
        .send({ status: 'banned' });

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual([{ field: 'status', message: 'Status must be active or suspended' }]);
    });

    it('should reject an invalid role with its custom message (400)', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${regularUserId}/role`)
        .set('Cookie', [`algoflow_token=${superAdminToken}`])
        .send({ role: 'OWNER' });

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual([{ field: 'role', message: 'Role must be USER, ADMIN, or SUPER_ADMIN' }]);
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

    it.each([
      ['examples', { examples: [{ input: '1', output: '1', note: 'extra' }] }],
      ['testCases', { testCases: [{ input: '1', expected: '1', $where: 'sleep(1000)' }] }],
    ])('should reject unknown fields inside %s on create (400)', async (_label, nested) => {
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
          ...nested,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(mockProblem.create).not.toHaveBeenCalled();
    });

    describe('POST /api/admin/problems strict validation', () => {
      const validProblem = {
        problemId: 'lru-cache',
        title: 'LRU Cache Design',
        difficulty: 'Medium',
        category: 'Design',
        description: 'Implement a Least Recently Used (LRU) cache with O(1) ops.',
        testCases: [{ input: 'get(1)', expected: '-1' }],
      };
      const postProblem = (body: object) =>
        request(app).post('/api/admin/problems').set('Cookie', [`algoflow_token=${adminToken}`]).send(body);

      beforeEach(() => {
        mockProblem.findOne.mockResolvedValue(null);
        mockProblem.create.mockImplementation(async (doc: any) => ({ _id: new mongoose.Types.ObjectId(), ...doc }));
      });

      it('accepts every documented field and fills the defaults', async () => {
        const res = await postProblem({
          ...validProblem,
          tags: ['design', 'hash-map'],
          constraints: ['1 <= capacity <= 3000'],
          examples: [{ input: 'put(1,1)', output: 'null', explanation: 'Stores key 1' }],
          starterCode: { cpp: 'class LRUCache {};' },
          testCases: [{ input: 'get(1)', expected: '-1', isHidden: true }],
          publicationStatus: 'draft',
        });

        expect(res.status).toBe(201);
        expect(mockProblem.create).toHaveBeenCalledWith(
          expect.objectContaining({
            starterCode: { cpp: 'class LRUCache {};', c: '', java: '', python: '' },
            publicationStatus: 'draft',
          })
        );
      });

      it('still defaults publicationStatus to published', async () => {
        const res = await postProblem(validProblem);

        expect(res.status).toBe(201);
        expect(mockProblem.create).toHaveBeenCalledWith(expect.objectContaining({ publicationStatus: 'published' }));
      });

      it.each([
        ['an unknown top-level field', { solved: true }],
        ['a client-side id', { id: 'lru-cache' }],
        ['a $ operator key', { $where: 'sleep(1000)' }],
        ['a dotted key', { 'starterCode.cpp': 'int main() {}' }],
        ['an unsupported starter language', { starterCode: { rust: 'fn main() {}' } }],
        ['a nested object as starter code', { starterCode: { cpp: { $ne: '' } } }],
      ])('rejects %s with 400', async (_label, extra) => {
        const res = await postProblem({ ...validProblem, ...extra });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(mockProblem.create).not.toHaveBeenCalled();
      });

      it('returns 409 when a concurrent create wins the race for the slug', async () => {
        mockProblem.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

        const res = await postProblem(validProblem);

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('Problem with slug "lru-cache" already exists.');
        expect(mockAdminAuditLog.create).not.toHaveBeenCalled();
      });

      it('maps a Mongoose validation error on create to 400 with one detail per failing path', async () => {
        const validationError = new mongoose.Error.ValidationError();
        validationError.addError(
          'testCases.0.expected',
          new mongoose.Error.ValidatorError({ path: 'testCases.0.expected', message: 'Expected output is too long.' })
        );
        mockProblem.create.mockRejectedValue(validationError);

        const res = await postProblem(validProblem);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          error: 'Validation failed',
          details: [{ field: 'testCases.0.expected', message: 'Expected output is too long.' }],
        });
        expect(mockAdminAuditLog.create).not.toHaveBeenCalled();
      });

      it('maps a Mongoose cast error on create to 400', async () => {
        mockProblem.create.mockRejectedValue(new mongoose.Error.CastError('[String]', 42, 'tags'));

        const res = await postProblem(validProblem);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(res.body.details[0].field).toBe('tags');
        expect(mockAdminAuditLog.create).not.toHaveBeenCalled();
      });

      it('keeps other create failures as a masked 500', async () => {
        mockProblem.create.mockRejectedValue(Object.assign(new Error('not primary'), { code: 10107 }));

        const res = await postProblem(validProblem);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal Server Error' });
        expect(mockAdminAuditLog.create).not.toHaveBeenCalled();
      });

      it('reports an audit log failure after a successful create as a 500, not a client error', async () => {
        mockAdminAuditLog.create.mockRejectedValueOnce(new mongoose.Error.ValidationError());

        const res = await postProblem(validProblem);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal Server Error' });
      });
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

    describe('PUT /api/admin/problems/:id', () => {
      const problemObjectId = new mongoose.Types.ObjectId();

      const putProblem = (body: unknown) =>
        request(app)
          .put('/api/admin/problems/lru-cache')
          .set('Cookie', [`algoflow_token=${adminToken}`])
          .send(body as object);

      beforeEach(() => {
        mockProblem.findOne.mockResolvedValue({ _id: problemObjectId, problemId: 'lru-cache' });
        mockProblem.findOneAndUpdate.mockResolvedValue({
          _id: problemObjectId,
          problemId: 'lru-cache',
          title: 'LRU Cache v2',
        });
      });

      it('sets only the fields sent, with no defaults, and audits the changed fields', async () => {
        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(200);
        expect(mockProblem.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: problemObjectId },
          { $set: { title: 'LRU Cache v2' } },
          { new: true, runValidators: true }
        );
        expect(mockAdminAuditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'PROBLEM_UPDATE',
            details: expect.objectContaining({ fields: ['title'] }),
          })
        );
      });

      it('updates one starter language without touching the others', async () => {
        const res = await putProblem({ starterCode: { cpp: 'int main() {}' } });

        expect(res.status).toBe(200);
        expect(mockProblem.findOneAndUpdate.mock.calls[0][1]).toEqual({
          $set: { 'starterCode.cpp': 'int main() {}' },
        });
      });

      it('accepts problemId when it is unchanged and leaves it out of the update', async () => {
        const res = await putProblem({ problemId: 'lru-cache', title: 'LRU Cache v2' });

        expect(res.status).toBe(200);
        expect(mockProblem.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { title: 'LRU Cache v2' } });
      });

      it('rejects a problemId change with 400', async () => {
        const res = await putProblem({ problemId: 'lfu-cache', title: 'LFU Cache' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/problemId cannot be changed/i);
        expect(mockProblem.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it.each([
        ['an unknown field', { title: 'LRU Cache v2', solved: true }],
        ['a dotted key', { 'testCases.0.isHidden': false }],
        ['a MongoDB operator key', { $unset: { testCases: 1 } }],
        ['an unknown nested field', { testCases: [{ input: '1', expected: '1', weight: 5 }] }],
        ['an unknown starter language', { starterCode: { rust: 'fn main() {}' } }],
        ['an operator object as a value', { title: { $ne: null } }],
        ['an empty test case list', { testCases: [] }],
        ['an empty body', {}],
        ['only an unchanged problemId', { problemId: 'lru-cache' }],
        ['an invalid enum value', { difficulty: 'Impossible' }],
      ])('rejects %s with 400 before touching the database', async (_label, body) => {
        const res = await putProblem(body);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(mockProblem.findOne).not.toHaveBeenCalled();
        expect(mockProblem.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('returns 404 without an audit entry when the problem is deleted between lookup and update', async () => {
        mockProblem.findOneAndUpdate.mockResolvedValue(null);

        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(404);
        expect(mockAdminAuditLog.create).not.toHaveBeenCalled();
      });

      it('returns 404 when the problem does not exist', async () => {
        mockProblem.findOne.mockResolvedValue(null);

        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(404);
        expect(mockProblem.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('maps a Mongoose validation error to 400 with one detail per failing path', async () => {
        const validationError = new mongoose.Error.ValidationError();
        validationError.addError(
          'title',
          new mongoose.Error.ValidatorError({ path: 'title', message: 'Title is too long.' })
        );
        mockProblem.findOneAndUpdate.mockRejectedValue(validationError);

        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          error: 'Validation failed',
          details: [{ field: 'title', message: 'Title is too long.' }],
        });
      });

      it('maps a Mongoose cast error to 400', async () => {
        mockProblem.findOneAndUpdate.mockRejectedValue(new mongoose.Error.CastError('[String]', 42, 'tags'));

        const res = await putProblem({ tags: ['cache'] });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(res.body.details[0].field).toBe('tags');
      });

      it('keeps unexpected database errors as a masked 500', async () => {
        mockProblem.findOneAndUpdate.mockRejectedValue(
          Object.assign(new Error('connection pool for 10.0.0.5:27017 was cleared'), { name: 'MongoServerError', code: 91 })
        );

        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal Server Error' });
      });

      it('maps a duplicate key error to 409', async () => {
        mockProblem.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(409);
      });

      it('reports an audit log failure after a successful update as a 500, not a client error', async () => {
        mockAdminAuditLog.create.mockRejectedValueOnce(new mongoose.Error.ValidationError());

        const res = await putProblem({ title: 'LRU Cache v2' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal Server Error' });
      });

      it('forbids regular users (403)', async () => {
        const res = await request(app)
          .put('/api/admin/problems/lru-cache')
          .set('Cookie', [`algoflow_token=${userToken}`])
          .send({ title: 'LRU Cache v2' });

        expect(res.status).toBe(403);
        expect(mockProblem.findOneAndUpdate).not.toHaveBeenCalled();
      });
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
