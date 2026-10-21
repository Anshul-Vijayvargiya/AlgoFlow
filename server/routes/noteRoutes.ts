import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Note, type INote } from '../models/Note';
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

/**
 * Query parameters of the note list. Strict: a malformed value is a 400 instead of being silently replaced, so a
 * client never shows the wrong page as if it were the one asked for. A page past the last one is valid (it is empty).
 */
const positiveInt = (max: number) => z.string().regex(/^[0-9]+$/, 'must be a positive whole number').transform(Number).pipe(z.number().int().min(1).max(max));
const listQuerySchema = z.object({
  page: positiveInt(10_000).optional(),
  limit: positiveInt(50).optional(),
  search: z.string().trim().max(100, 'Search is limited to 100 characters').optional(),
  tag: z.string().trim().max(30).optional(),
  algorithmId: z.string().trim().max(100).optional(),
});

// GET /api/notes — the current user's notes, newest first: one page, filtered on the server across ALL their notes
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query parameters.',
        details: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      });
      return;
    }
    const { page = 1, limit = 20, search, tag, algorithmId } = parsed.data;
    const userId = req.user?.userId;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { userId };
    if (tag && tag !== 'All') filter.tags = tag;
    if (algorithmId) filter.algorithmId = algorithmId;
    if (search) {
      const sanitized = escapeRegex(search);
      filter.$or = [
        { title: { $regex: sanitized, $options: 'i' } },
        { content: { $regex: sanitized, $options: 'i' } },
        { tags: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const [total, notes] = await Promise.all([
      Note.countDocuments(filter),
      Note.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit),
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

// GET /api/notes/tags — every tag the current user has used (for the tag filter), not only those on one page
router.get('/tags', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    // the session's user id, typed as the model declares it (Mongoose casts the string at runtime)
    const tags: string[] = await Note.distinct('tags', { userId: req.user?.userId as unknown as INote['userId'] });
    res.json({ tags: tags.filter(Boolean).sort((a, b) => a.localeCompare(b)) });
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
