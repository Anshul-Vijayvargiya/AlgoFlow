import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Note } from '../models/Note';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

// Zod schema for creating a note
const createNoteSchema = z.object({
  title: z
    .string({ error: (issue) => (issue.input === undefined ? 'Title is required' : undefined) })
    .trim()
    .min(1, 'Title cannot be empty')
    .max(120, 'Title cannot exceed 120 characters'),
  content: z
    .string({ error: (issue) => (issue.input === undefined ? 'Content is required' : undefined) })
    .min(1, 'Content cannot be empty')
    .max(10000, 'Content cannot exceed 10,000 characters'),
  algorithmId: z.string().trim().max(100, 'Algorithm ID cannot exceed 100 characters').optional(),
  tags: z
    .array(z.string().trim().min(1).max(30, 'Tag name cannot exceed 30 characters'))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),
});

// Zod schema for updating a note
const updateNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty')
    .max(120, 'Title cannot exceed 120 characters')
    .optional(),
  content: z
    .string()
    .min(1, 'Content cannot be empty')
    .max(10000, 'Content cannot exceed 10,000 characters')
    .optional(),
  algorithmId: z.string().trim().max(100).optional(),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(10)
    .optional(),
});

// Helper: escape regex special characters
function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// GET /api/notes — List current user's notes with search, tags, algorithm filter & pagination
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { userId };

    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : undefined;
    if (tag && tag !== 'All') {
      filter.tags = tag;
    }

    const algorithmId = typeof req.query.algorithmId === 'string' ? req.query.algorithmId.trim() : undefined;
    if (algorithmId) {
      filter.algorithmId = algorithmId;
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    if (search) {
      const sanitized = escapeRegex(search);
      filter.$or = [
        { title: { $regex: sanitized, $options: 'i' } },
        { content: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const [total, notes] = await Promise.all([
      Note.countDocuments(filter),
      Note.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);

    res.json({
      notes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/notes/:id — Fetch a specific note owned by the authenticated user
router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const note = await Note.findOne({ _id: id, userId: req.user?.userId });
    if (!note) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.json(note);
  } catch (err) {
    next(err);
  }
});

// POST /api/notes — Create a note scoped to authenticated user
router.post('/', requireAuth, validateBody(createNoteSchema), async (req: AuthRequest, res, next) => {
  try {
    const { title, content, algorithmId, tags } = req.body;
    const userId = req.user?.userId;

    const note = await Note.create({
      userId,
      title,
      content,
      algorithmId: algorithmId || undefined,
      tags: tags && tags.length > 0 ? tags : ['General'],
    });

    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notes/:id — Update note owned by authenticated user
router.put('/:id', requireAuth, validateBody(updateNoteSchema), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const { title, content, algorithmId, tags } = req.body;
    const update: Record<string, any> = {};
    if (title !== undefined) update.title = title;
    if (content !== undefined) update.content = content;
    if (algorithmId !== undefined) update.algorithmId = algorithmId;
    if (tags !== undefined) update.tags = tags;

    const note = await Note.findOneAndUpdate(
      { _id: id, userId: req.user?.userId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!note) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.json(note);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notes/:id — Delete note owned by authenticated user
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const result = await Note.deleteOne({ _id: id, userId: req.user?.userId });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.json({ message: 'Note deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

export default router;
