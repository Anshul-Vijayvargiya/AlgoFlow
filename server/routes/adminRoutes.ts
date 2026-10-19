import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Problem, IProblem } from '../models/Problem';
import { Submission } from '../models/Submission';
import { ActivityLog } from '../models/ActivityLog';
import { AdminAuditLog } from '../models/AdminAuditLog';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], {
    error: 'Status must be active or suspended',
  }),
});

const updateRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN'], {
    error: 'Role must be USER, ADMIN, or SUPER_ADMIN',
  }),
});

// Field rules shared by the create and update schemas, so the two cannot drift apart
const problemFields = {
  problemId: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug cannot exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  title: z.string().trim().min(2).max(150),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  category: z.string().trim().min(2).max(50),
  tags: z.array(z.string().trim()),
  description: z.string().min(10),
  constraints: z.array(z.string().trim()),
  publicationStatus: z.enum(['published', 'draft', 'archived']),
};
// "" is a valid input/output/expected value (no stdin, no output); the Problem model stores it as is
const exampleShape = {
  input: z.string(),
  output: z.string(),
  explanation: z.string().optional(),
};
const testCaseShape = {
  input: z.string(),
  expected: z.string(),
  isHidden: z.boolean().optional(),
};
const STARTER_LANGUAGES = ['cpp', 'c', 'java', 'python'] as const;

// Strict like the update schema: unknown keys at any level are a 400, not silently dropped
const problemInputSchema = z.strictObject({
  problemId: problemFields.problemId,
  title: problemFields.title,
  difficulty: problemFields.difficulty,
  category: problemFields.category,
  tags: problemFields.tags.optional(),
  description: problemFields.description,
  constraints: problemFields.constraints.optional(),
  examples: z.array(z.strictObject(exampleShape)).optional(),
  starterCode: z
    .strictObject({
      cpp: z.string().default(''),
      c: z.string().default(''),
      java: z.string().default(''),
      python: z.string().default(''),
    })
    .optional(),
  testCases: z.array(z.strictObject(testCaseShape)).min(1, 'At least one testcase is required'),
  publicationStatus: problemFields.publicationStatus.default('published'),
});

// Not problemInputSchema.partial(): that would keep the defaults (any edit would re-publish a draft and blank the
// other starter languages) and silently strip unknown keys. Strict objects reject unknown, dotted and `$` keys with
// a 400 instead, and no field has a default. problemId is accepted only so a client can send it back unchanged; the
// route rejects any other value, because submissions and activity logs reference problems by slug.
const problemUpdateSchema = z
  .strictObject({
    problemId: problemFields.problemId.optional(),
    title: problemFields.title.optional(),
    difficulty: problemFields.difficulty.optional(),
    category: problemFields.category.optional(),
    tags: problemFields.tags.optional(),
    description: problemFields.description.optional(),
    constraints: problemFields.constraints.optional(),
    examples: z.array(z.strictObject(exampleShape)).optional(),
    starterCode: z
      .strictObject({
        cpp: z.string().optional(),
        c: z.string().optional(),
        java: z.string().optional(),
        python: z.string().optional(),
      })
      .optional(),
    testCases: z.array(z.strictObject(testCaseShape)).min(1, 'At least one testcase is required').optional(),
    publicationStatus: problemFields.publicationStatus.optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'problemId'), {
    message: 'At least one field to update is required',
  });

// Helper: Escape regex
function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// Helper: Answer an error thrown by a Problem write (create/update) that the client caused. A model rule the Zod
// schema does not mirror is a 400 (same shape as validateBody) and a duplicate slug is a 409. Returns false for any
// other error, which the caller rethrows so the error handler sends a masked 500. Only wrap the Problem write itself,
// so a failure elsewhere (e.g. the audit log) is never reported as a client error.
function sendProblemWriteError(res: Response, err: any, conflictMessage: string): boolean {
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    const issues: any[] = err.name === 'ValidationError' ? Object.values(err.errors ?? {}) : [err];
    res.status(400).json({
      error: 'Validation failed',
      details: issues.map((issue) => ({ field: issue.path ?? '', message: issue.message })),
    });
    return true;
  }
  if (err?.code === 11000) {
    res.status(409).json({ error: conflictMessage });
    return true;
  }
  return false;
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

      let problem: IProblem;
      try {
        problem = await Problem.create({
          ...body,
          problemId,
        });
      } catch (err) {
        // Two creates with the same slug can both pass the check above; the unique index rejects the second (409)
        if (sendProblemWriteError(res, err, `Problem with slug "${problemId}" already exists.`)) return;
        throw err;
      }

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
  validateBody(problemUpdateSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { problemId, starterCode, ...fields } = req.body as z.infer<typeof problemUpdateSchema>;
      const isObjectId = mongoose.isValidObjectId(id);

      const existing = await Problem.findOne({
        $or: isObjectId ? [{ _id: id }, { problemId: id.toLowerCase() }] : [{ problemId: id.toLowerCase() }],
      });
      if (!existing) {
        res.status(404).json({ error: 'Problem not found.' });
        return;
      }

      if (problemId !== undefined && problemId !== existing.problemId) {
        res.status(400).json({
          error: 'problemId cannot be changed: submissions and activity logs reference problems by slug.',
        });
        return;
      }

      // Each starter language is set on its own path, so updating one language keeps the others
      const updates: Record<string, unknown> = { ...fields };
      for (const language of STARTER_LANGUAGES) {
        if (starterCode?.[language] !== undefined) {
          updates[`starterCode.${language}`] = starterCode[language];
        }
      }

      let problem: IProblem | null;
      try {
        problem = await Problem.findOneAndUpdate(
          { _id: existing._id },
          { $set: updates },
          { new: true, runValidators: true }
        );
      } catch (err) {
        if (sendProblemWriteError(res, err, 'A problem with this slug already exists.')) return;
        throw err;
      }

      if (!problem) {
        res.status(404).json({ error: 'Problem not found.' });
        return;
      }

      await AdminAuditLog.create({
        adminId: req.user!.userId,
        action: 'PROBLEM_UPDATE',
        targetType: 'PROBLEM',
        targetId: problem._id.toString(),
        details: { problemId: problem.problemId, title: problem.title, fields: Object.keys(updates) },
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
