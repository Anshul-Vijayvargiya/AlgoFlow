import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Problem } from '../models/Problem';
import { Submission } from '../models/Submission';
import { ActivityLog } from '../models/ActivityLog';
import { AdminAuditLog } from '../models/AdminAuditLog';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], {
    errorMap: () => ({ message: 'Status must be active or suspended' }),
  }),
});

const updateRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN'], {
    errorMap: () => ({ message: 'Role must be USER, ADMIN, or SUPER_ADMIN' }),
  }),
});

const problemInputSchema = z.object({
  problemId: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug cannot exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  title: z.string().trim().min(2).max(150),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  category: z.string().trim().min(2).max(50),
  tags: z.array(z.string().trim()).optional(),
  description: z.string().min(10),
  constraints: z.array(z.string().trim()).optional(),
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: z.string().optional(),
      })
    )
    .optional(),
  starterCode: z
    .object({
      cpp: z.string().default(''),
      c: z.string().default(''),
      java: z.string().default(''),
      python: z.string().default(''),
    })
    .optional(),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expected: z.string(),
        isHidden: z.boolean().optional(),
      })
    )
    .min(1, 'At least one testcase is required'),
  publicationStatus: z.enum(['published', 'draft', 'archived']).default('published'),
});

// Helper: Escape regex
function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// GET /api/admin/metrics — Platform overview for ADMIN and SUPER_ADMIN
router.get(
  '/metrics',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      const [totalUsers, totalProblems, totalSubmissions] = await Promise.all([
        User.countDocuments(),
        Problem.countDocuments(),
        Submission.countDocuments(),
      ]);

      // Calculate active users in the past 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
      const activeUsersPastWeek = (
        await ActivityLog.distinct('userId', {
          date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
        })
      ).length;

      res.json({
        metrics: {
          totalUsers,
          totalProblems,
          totalSubmissions,
          activeUsersPastWeek,
          serverUptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/admin/users — Paginated user listing with search & filters
router.get(
  '/users',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const filter: Record<string, any> = {};

      const role = typeof req.query.role === 'string' ? req.query.role.trim() : undefined;
      if (role && role !== 'All') {
        filter.role = role;
      }

      const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      if (status && status !== 'All') {
        filter.accountStatus = status;
      }

      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      if (search) {
        const sanitized = escapeRegex(search);
        filter.$or = [
          { name: { $regex: sanitized, $options: 'i' } },
          { email: { $regex: sanitized, $options: 'i' } },
        ];
      }

      const [total, rawUsers] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
          .select('name email role accountStatus streakDays solvedCount createdAt updatedAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      const users = rawUsers.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        accountStatus: u.accountStatus || 'active',
        streakDays: u.streakDays || 0,
        solvedCount: u.solvedCount || 0,
        createdAt: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: u.updatedAt ? u.updatedAt.toISOString() : new Date().toISOString(),
      }));

      res.json({
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/admin/users/:id/status — Manage user account status (suspend/activate)
router.patch(
  '/users/:id/status',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateBody(updateStatusSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const actingAdmin = req.user!;

      if (!mongoose.isValidObjectId(id)) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (id === actingAdmin.userId) {
        res.status(400).json({ error: 'Cannot modify your own account status.' });
        return;
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      // Hierarchy Guard: Standard ADMIN cannot suspend another ADMIN or SUPER_ADMIN
      if (actingAdmin.role === 'ADMIN' && (targetUser.role === 'ADMIN' || targetUser.role === 'SUPER_ADMIN')) {
        res.status(403).json({
          error: 'Access denied. Standard ADMIN cannot modify accounts with administrative privileges.',
        });
        return;
      }

      const oldStatus = targetUser.accountStatus;
      targetUser.accountStatus = status;
      // Suspension ends every existing session immediately (requireAuth also rejects suspended accounts)
      const sessionsRevoked = status === 'suspended' && oldStatus !== 'suspended';
      if (sessionsRevoked) {
        targetUser.tokenVersion = (targetUser.tokenVersion ?? 0) + 1;
      }
      await targetUser.save();

      // Audit Log
      await AdminAuditLog.create({
        adminId: actingAdmin.userId,
        action: 'USER_STATUS_CHANGE',
        targetType: 'USER',
        targetId: targetUser._id.toString(),
        details: { oldStatus, newStatus: status, userEmail: targetUser.email, sessionsRevoked },
        ipAddress: req.ip,
      });

      res.json({
        user: {
          id: targetUser._id.toString(),
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          accountStatus: targetUser.accountStatus,
          streakDays: targetUser.streakDays,
          solvedCount: targetUser.solvedCount,
          createdAt: targetUser.createdAt.toISOString(),
          updatedAt: targetUser.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/admin/users/:id/role — Modify user role (Restricted strictly to SUPER_ADMIN)
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  validateBody(updateRoleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const actingAdmin = req.user!;

      if (!mongoose.isValidObjectId(id)) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (id === actingAdmin.userId) {
        res.status(400).json({ error: 'Cannot modify your own role.' });
        return;
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const oldRole = targetUser.role;
      targetUser.role = role;
      // Any role change ends existing sessions; the new role applies from the next login (and every request
      // already reads the role from the database, so a demotion is effective immediately either way)
      const sessionsRevoked = oldRole !== role;
      if (sessionsRevoked) {
        targetUser.tokenVersion = (targetUser.tokenVersion ?? 0) + 1;
      }
      await targetUser.save();

      // Audit Log
      await AdminAuditLog.create({
        adminId: actingAdmin.userId,
        action: 'USER_ROLE_CHANGE',
        targetType: 'USER',
        targetId: targetUser._id.toString(),
        details: { oldRole, newRole: role, userEmail: targetUser.email, sessionsRevoked },
        ipAddress: req.ip,
      });

      res.json({
        user: {
          id: targetUser._id.toString(),
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          accountStatus: targetUser.accountStatus,
          streakDays: targetUser.streakDays,
          solvedCount: targetUser.solvedCount,
          createdAt: targetUser.createdAt.toISOString(),
          updatedAt: targetUser.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/admin/audit-logs — View administrative audit trail
router.get(
  '/audit-logs',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const [total, rawLogs] = await Promise.all([
        AdminAuditLog.countDocuments(),
        AdminAuditLog.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('adminId', 'name email')
          .lean(),
      ]);

      const logs = rawLogs.map((l: any) => ({
        id: l._id.toString(),
        adminId: l.adminId?._id ? l.adminId._id.toString() : String(l.adminId),
        adminName: l.adminId?.name || 'Administrator',
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        details: l.details || {},
        ipAddress: l.ipAddress,
        createdAt: l.createdAt ? l.createdAt.toISOString() : new Date().toISOString(),
      }));

      res.json({
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/problems — Create new practice problem (ADMIN / SUPER_ADMIN)
router.post(
  '/problems',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateBody(problemInputSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const body = req.body;
      const problemId = body.problemId.toLowerCase().trim();

      const existing = await Problem.findOne({ problemId });
      if (existing) {
        res.status(409).json({ error: `Problem with slug "${problemId}" already exists.` });
        return;
      }

      const problem = await Problem.create({
        ...body,
        problemId,
      });

      await AdminAuditLog.create({
        adminId: req.user!.userId,
        action: 'PROBLEM_CREATE',
        targetType: 'PROBLEM',
        targetId: problem._id.toString(),
        details: { problemId: problem.problemId, title: problem.title },
        ipAddress: req.ip,
      });

      res.status(201).json({ problem });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/admin/problems/:id — Update existing practice problem
router.put(
  '/problems/:id',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const isObjectId = mongoose.isValidObjectId(id);

      const problem = await Problem.findOneAndUpdate(
        { $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }] },
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!problem) {
        res.status(404).json({ error: 'Problem not found.' });
        return;
      }

      await AdminAuditLog.create({
        adminId: req.user!.userId,
        action: 'PROBLEM_UPDATE',
        targetType: 'PROBLEM',
        targetId: problem._id ? problem._id.toString() : (problem.problemId || id),
        details: { problemId: problem.problemId, title: problem.title },
        ipAddress: req.ip,
      });

      res.json({ problem });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/admin/problems/:id — Archive problem
router.delete(
  '/problems/:id',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const isObjectId = mongoose.isValidObjectId(id);

      const problem = await Problem.findOneAndUpdate(
        { $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }] },
        { $set: { publicationStatus: 'archived' } },
        { new: true }
      );

      if (!problem) {
        res.status(404).json({ error: 'Problem not found.' });
        return;
      }

      await AdminAuditLog.create({
        adminId: req.user!.userId,
        action: 'PROBLEM_ARCHIVE',
        targetType: 'PROBLEM',
        targetId: problem._id ? problem._id.toString() : (problem.problemId || id),
        details: { problemId: problem.problemId, title: problem.title },
        ipAddress: req.ip,
      });

      res.json({ message: 'Problem archived successfully.' });

    } catch (err) {
      next(err);
    }
  }
);

export default router;
