import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { Revision, type IRevision } from '../models/Revision';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { isListedAlgorithm } from '../../src/data/algorithmCatalog';
import { REVISION_REASON_IDS, REVISION_STATUSES } from '../../src/data/revisions';

/**
 * The signed-in user's Revision List. The owner is always the session's user, never anything the client sends, and every
 * query is scoped to that user, so another user's record is simply not found.
 */
const router = Router();

/** a reason, or null to clear it; left out, an existing record keeps its reason */
const markSchema = z.object({ reason: z.enum(REVISION_REASON_IDS).nullable().optional() });
const statusSchema = z.object({ status: z.enum(REVISION_STATUSES) });

/** the session's user id, typed as the model declares it (Mongoose casts the string at runtime) */
const ownerOf = (req: AuthRequest) => req.user?.userId as unknown as IRevision['userId'];
const algorithmIdOf = (req: AuthRequest) => String(req.params.algorithmId);

/** only algorithms the app lists can be marked */
function requireListedAlgorithm(req: AuthRequest, res: Response, next: NextFunction): void {
  if (isListedAlgorithm(algorithmIdOf(req))) next();
  else res.status(400).json({ error: 'Unknown algorithm.' });
}

/** what the client receives: no owner id, no internal fields */
function toResponse(doc: Pick<IRevision, 'algorithmId' | 'status' | 'reason' | 'revisedAt' | 'createdAt' | 'updatedAt'>) {
  return {
    algorithmId: doc.algorithmId,
    status: doc.status,
    reason: doc.reason,
    revisedAt: doc.revisedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const isDuplicateKey = (err: unknown) => (err as { code?: number } | null)?.code === 11000;

// GET /api/revisions — the whole list, most recently marked first. Not paged: it holds at most one record per listed
// algorithm, and the page's counts, filters and search all need every record.
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const rows = await Revision.find({ userId: ownerOf(req) }).sort({ createdAt: -1, _id: -1 });
    // an algorithm no longer listed has nothing to open
    res.json({ revisions: rows.filter(r => isListedAlgorithm(r.algorithmId)).map(toResponse) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/revisions/:algorithmId — mark an algorithm, or change the reason of one already marked. Idempotent: the unique
// index allows one record per user and algorithm, so marking twice (or two tabs at once) never duplicates it, and a
// status is never changed here. 201 when created, 200 when it already existed.
router.put('/:algorithmId', requireAuth, requireListedAlgorithm, validateBody(markSchema), async (req: AuthRequest, res, next) => {
  try {
    const { reason } = req.body as z.infer<typeof markSchema>;
    const write = () =>
      Revision.findOneAndUpdate(
        { userId: ownerOf(req), algorithmId: algorithmIdOf(req) },
        {
          $setOnInsert: { status: 'pending' as const },
          ...(reason ? { $set: { reason } } : reason === null ? { $unset: { reason: 1 as const } } : {}),
        },
        { upsert: true, returnDocument: 'after', includeResultMetadata: true, runValidators: true }
      );
    // two simultaneous upserts of a new record: the loser hits the unique index, and retrying finds the winner's record
    const result = await write().catch(err => {
      if (isDuplicateKey(err)) return write();
      throw err;
    });
    res.status(result.lastErrorObject?.updatedExisting ? 200 : 201).json(toResponse(result.value!));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/revisions/:algorithmId — pending ↔ revised. Never removes the record.
router.patch('/:algorithmId', requireAuth, requireListedAlgorithm, validateBody(statusSchema), async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.body as z.infer<typeof statusSchema>;
    const doc = await Revision.findOneAndUpdate(
      { userId: ownerOf(req), algorithmId: algorithmIdOf(req) },
      status === 'revised' ? { $set: { status, revisedAt: new Date() } } : { $set: { status }, $unset: { revisedAt: 1 as const } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!doc) {
      res.status(404).json({ error: 'This algorithm is not on your Revision List.' });
      return;
    }
    res.json(toResponse(doc));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/revisions/:algorithmId — take it off the list
router.delete('/:algorithmId', requireAuth, requireListedAlgorithm, async (req: AuthRequest, res, next) => {
  try {
    const result = await Revision.deleteOne({ userId: ownerOf(req), algorithmId: algorithmIdOf(req) });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'This algorithm is not on your Revision List.' });
      return;
    }
    res.json({ message: 'Removed from your Revision List.' });
  } catch (err) {
    next(err);
  }
});

export default router;
