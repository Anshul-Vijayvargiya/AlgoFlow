import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';

// Hoisted mocks for Mongoose models
const {
  mockNote,
  mockProgressTrack,
  mockActivityLog,
  mockProblem,
  mockSubmission,
  mockUser,
} = vi.hoisted(() => {
  return {
    mockNote: {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
      countDocuments: vi.fn(),
    },
    mockProgressTrack: {
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      countDocuments: vi.fn(),
    },
    mockActivityLog: {
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      distinct: vi.fn(),
    },
    mockProblem: {
      find: vi.fn(),
      findOne: vi.fn(),
      countDocuments: vi.fn(),
    },
    mockSubmission: {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      distinct: vi.fn(),
    },
    mockUser: {
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      updateOne: vi.fn(),
    },
  };
});

vi.mock('../models/Note', () => ({ Note: mockNote }));
vi.mock('../models/ProgressTrack', () => ({ ProgressTrack: mockProgressTrack }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: mockActivityLog }));
vi.mock('../models/Problem', () => ({ Problem: mockProblem }));
vi.mock('../models/Submission', () => ({ Submission: mockSubmission }));
// Role and status come from the database on every request; see helpers/sessionStub.ts
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));
vi.mock('../models/User', () => ({ User: mockUser }));

function createQueryMock(result: any) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
    then: (onfulfilled?: (val: any) => any, onrejected?: (reason: any) => any) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
    catch: (onrejected?: (reason: any) => any) =>
      Promise.resolve(result).catch(onrejected),
  };
}

describe('Phase 3 Product APIs - Notes, Progress, Practice & Settings', () => {
  const userToken = tokenFor('507f1f77bcf86cd799439011', 'USER');
  const otherUserToken = tokenFor('507f1f77bcf86cd799439022', 'USER');
  const validNoteId = '507f1f77bcf86cd799439033';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitsForTesting();
  });

  // ── 1. NOTES API & USER ISOLATION ──────────────────────────────────────────
  describe('Notes API & User Isolation', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/notes');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    it('should list notes scoped strictly to authenticated user', async () => {
      mockNote.countDocuments.mockResolvedValue(1);
      mockNote.find.mockReturnValue(
        createQueryMock([
          {
            _id: new mongoose.Types.ObjectId(validNoteId),
            userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
            title: 'Bubble Sort Invariant',
            content: 'Outer loop pass invariants',
            tags: ['Sorting'],
            updatedAt: new Date(),
          },
        ])
      );

      const res = await request(app)
        .get('/api/notes')
        .set('Cookie', [`algoflow_token=${userToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.notes).toHaveLength(1);
      expect(res.body.notes[0].title).toBe('Bubble Sort Invariant');
      expect(mockNote.find).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '507f1f77bcf86cd799439011' })
      );
    });

    it('should filter notes by search query safely', async () => {
      mockNote.countDocuments.mockResolvedValue(0);
      mockNote.find.mockReturnValue(createQueryMock([]));

      const res = await request(app)
        .get('/api/notes?search=Binary+Search')
        .set('Cookie', [`algoflow_token=${userToken}`]);

      expect(res.status).toBe(200);
      expect(mockNote.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          $or: expect.any(Array),
        })
      );
    });

    it('should reject note creation with invalid payload (missing content)', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Cookie', [`algoflow_token=${userToken}`])
        .send({ title: 'A title without content' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should create note with user ownership set from token (not frontend body)', async () => {
      const createdNote = {
        _id: new mongoose.Types.ObjectId(validNoteId),
        userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        title: 'New Note',
        content: 'Note contents',
        tags: ['General'],
      };
      mockNote.create.mockResolvedValue(createdNote);

      const res = await request(app)
        .post('/api/notes')
        .set('Cookie', [`algoflow_token=${userToken}`])
        .send({
          title: 'New Note',
          content: 'Note contents',
          userId: 'attempted_spoofed_user_id', // Spoofed ID should be ignored
        });

      expect(res.status).toBe(201);
      expect(mockNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          title: 'New Note',
        })
      );
    });

    it('should enforce user isolation on single note fetch (404 for unowned note)', async () => {
      mockNote.findOne.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/notes/${validNoteId}`)
        .set('Cookie', [`algoflow_token=${otherUserToken}`]);

      expect(res.status).toBe(404);
      expect(mockNote.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: validNoteId,
          userId: '507f1f77bcf86cd799439022',
        })
      );
    });

    it('should enforce user isolation on delete (404 for unowned note)', async () => {
      mockNote.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const res = await request(app)
        .delete(`/api/notes/${validNoteId}`)
        .set('Cookie', [`algoflow_token=${otherUserToken}`]);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Note not found/i);
    });
  });

  // ── 2. PROGRESS API & AUTHENTIC STREAK ─────────────────────────────────────
  describe('Progress API & Streak Tracking', () => {
    it('should reject unauthenticated progress request with 401', async () => {
      const res = await request(app).get('/api/progress/summary');
      expect(res.status).toBe(401);
    });

    it('should calculate authentic streak from active days in ActivityLog', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      mockActivityLog.distinct.mockResolvedValue([yesterdayStr, todayStr]);
      mockSubmission.distinct.mockResolvedValue(['p1', 'p2']);
      mockProgressTrack.countDocuments.mockResolvedValue(3);
      mockActivityLog.find.mockResolvedValue([]);
      mockSubmission.find.mockReturnValue(createQueryMock([]));
      mockProgressTrack.find.mockResolvedValue([]);
      mockUser.updateOne.mockResolvedValue({});

      const res = await request(app)
        .get('/api/progress/summary')
        .set('Cookie', [`algoflow_token=${userToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.streakDays).toBe(2);
      expect(res.body.solvedCount).toBe(2);
      expect(res.body.algorithmsLearned).toBe(3);
      expect(res.body.weeklyActivity).toBeDefined();
    });

    it('should return 0 streak if user had no activity recently', async () => {
      mockActivityLog.distinct.mockResolvedValue(['2025-01-01']); // Old date
      mockSubmission.distinct.mockResolvedValue([]);
      mockProgressTrack.countDocuments.mockResolvedValue(0);
      mockActivityLog.find.mockResolvedValue([]);
      mockSubmission.find.mockReturnValue(createQueryMock([]));
      mockProgressTrack.find.mockResolvedValue([]);
      mockUser.updateOne.mockResolvedValue({});

      const res = await request(app)
        .get('/api/progress/summary')
        .set('Cookie', [`algoflow_token=${userToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.streakDays).toBe(0);
    });

    it('should record legitimate activity and prevent duplicate event inflation', async () => {
      mockActivityLog.findOneAndUpdate.mockResolvedValue({});
      mockActivityLog.distinct.mockResolvedValue([]);
      mockActivityLog.find.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/progress/activity')
        .set('Cookie', [`algoflow_token=${userToken}`])
        .send({
          minutes: 30,
          steps: 50,
          algorithmId: 'bubble-sort',
          activityType: 'visualizer_step',
        });

      expect(res.status).toBe(200);
      expect(mockActivityLog.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          activityType: 'visualizer_step',
          targetId: 'bubble-sort',
        }),
        expect.any(Object),
        expect.objectContaining({ upsert: true })
      );
    });
  });

  // ── 3. PRACTICE API & ATTEMPT ISOLATION ────────────────────────────────────
  describe('Practice API & Evaluation Isolation', () => {
    it('should list published problems and never expose hidden test cases', async () => {
      mockProblem.countDocuments.mockResolvedValue(1);
      mockProblem.find.mockReturnValue(
        createQueryMock([
          {
            problemId: 'two-sum',
            title: 'Two Sum',
            difficulty: 'Easy',
            category: 'Arrays',
            description: 'Sum problem',
            testCases: [
              { input: 'nums = [2,7]', expected: '[0,1]', isHidden: false },
              { input: 'nums = [3,3]', expected: '[0,1]', isHidden: true }, // HIDDEN
            ],
          },
        ])
      );

      const res = await request(app).get('/api/problems');
      expect(res.status).toBe(200);
      expect(res.body.problems).toHaveLength(1);
      // Hidden test case must be stripped
      expect(res.body.problems[0].testCases).toHaveLength(1);
      expect(res.body.problems[0].testCases[0].expected).toBe('[0,1]');
    });

    it('should record practice attempt in Submission collection', async () => {
      mockProblem.findOne.mockReturnValue(
        createQueryMock({
          problemId: 'two-sum',
          title: 'Two Sum',
          publicationStatus: 'published',
        })
      );
      mockSubmission.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(validNoteId),
        problemId: 'two-sum',
        language: 'cpp',
        status: 'SUBMITTED',
        passed: false,
        runtimeMs: 0,
        memoryMb: 0,
      });
      mockActivityLog.findOneAndUpdate.mockResolvedValue({});

      const res = await request(app)
        .post('/api/problems/two-sum/submit')
        .set('Cookie', [`algoflow_token=${userToken}`])
        .send({
          language: 'cpp',
          code: 'int main() { return 0; }',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.message).toMatch(/Practice solution submitted/i);
      expect(mockSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          problemId: 'two-sum',
          language: 'cpp',
          status: 'SUBMITTED',
        })
      );
    });

    it('should fetch user submission history isolated to current user', async () => {
      mockProblem.findOne.mockResolvedValue({ problemId: 'two-sum' });
      mockSubmission.find.mockReturnValue(
        createQueryMock([
          {
            _id: new mongoose.Types.ObjectId(validNoteId),
            problemId: 'two-sum',
            language: 'cpp',
            status: 'SUBMITTED',
            createdAt: new Date(),
          },
        ])
      );

      const res = await request(app)
        .get('/api/problems/two-sum/submissions')
        .set('Cookie', [`algoflow_token=${userToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.submissions).toHaveLength(1);
      expect(mockSubmission.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          problemId: 'two-sum',
        })
      );
    });
  });

  // ── 4. USER SETTINGS & PRIVILEGE ISOLATION ────────────────────────────────
  describe('User Settings & Privilege Isolation', () => {
    it('should allow user to update display name and learning preferences', async () => {
      mockUser.findByIdAndUpdate.mockResolvedValue({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Updated Name',
        email: 'user@algoflow.io',
        role: 'USER',
        accountStatus: 'active',
        preferences: {
          theme: 'dark',
          preferredLanguage: 'python',
          dailyGoalMinutes: 45,
        },
      });

      const res = await request(app)
        .patch('/api/users/profile')
        .set('Cookie', [`algoflow_token=${userToken}`])
        .send({
          name: 'Updated Name',
          preferences: {
            preferredLanguage: 'python',
            dailyGoalMinutes: 45,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
      expect(res.body.user.preferences.preferredLanguage).toBe('python');
    });

    it('should prevent user from escalating role through profile endpoint', async () => {
      mockUser.findByIdAndUpdate.mockResolvedValue({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Hacker',
        email: 'user@algoflow.io',
        role: 'USER', // Kept as USER
        accountStatus: 'active',
      });

      const res = await request(app)
        .patch('/api/users/profile')
        .set('Cookie', [`algoflow_token=${userToken}`])
        .send({
          name: 'Hacker',
          role: 'ADMIN', // Tamper attempt
          accountStatus: 'suspended', // Tamper attempt
        });

      expect(res.status).toBe(200);
      // Ensure update query did NOT include role or accountStatus
      const updateCall = mockUser.findByIdAndUpdate.mock.calls[0];
      const updateFields = updateCall[1].$set;
      expect(updateFields.role).toBeUndefined();
      expect(updateFields.accountStatus).toBeUndefined();
    });
  });
});
