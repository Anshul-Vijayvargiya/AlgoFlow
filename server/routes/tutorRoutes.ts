import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { releaseTutorGlobalSlot, takeTutorGlobalSlot, tutorRateLimiter } from '../middleware/rateLimiter';
import { getTutorProvider } from '../services/tutor';
import { buildTutorContext, tutorSystemInstruction } from '../services/tutor/context';
import { TutorProviderError } from '../services/tutor/types';
import { tutorQuotaDay } from '../services/tutor/quotaDay';
// the daily counters share the execution quota store under their own keys (tutor:*) and their own day (Pacific Time,
// when Google's daily limits reset); Judge0's keys and UTC days are untouched
import { consumeQuota, quotaUsed, refundQuota } from '../services/execution/quota';

const router = Router();

export const QUESTION_MAX_CHARS = 500;
export const HISTORY_MAX_TURNS = 6;
export const HISTORY_TURN_MAX_CHARS = 1000;
// the visualizer's own limits are enforced by validateAlgorithmInput; these only bound the request size
const INPUT_MAX_VALUES = 64;
const VALUE_LIMIT = 1_000_000;

const intValue = z.number().int().min(-VALUE_LIMIT).max(VALUE_LIMIT);

/**
 * The conversation so far, as the browser kept it: question/answer pairs, oldest first, so it starts with a question
 * ('user') and alternates, ending with an answer ('model') before the new question. Any other order is refused before
 * any allowance is used (Gemini rejects it, and a rejected request would still cost the question). The browser can
 * still send answers the tutor never gave: the turns are only ever sent as conversation, never as instructions, and
 * the system instruction says so.
 */
const historySchema = z
  .array(
    z
      .object({
        role: z.enum(['user', 'model']),
        text: z.string().min(1).max(HISTORY_TURN_MAX_CHARS).refine(t => t.trim().length > 0, 'History turns cannot be blank.'),
      })
      .strict()
  )
  .max(HISTORY_MAX_TURNS)
  .superRefine((turns, ctx) => {
    const misplaced = turns.findIndex((t, i) => t.role !== (i % 2 === 0 ? 'user' : 'model'));
    if (misplaced !== -1) {
      ctx.addIssue({ code: 'custom', path: [misplaced, 'role'], message: 'History must alternate question and answer, starting with a question.' });
    } else if (turns.length % 2 !== 0) {
      ctx.addIssue({ code: 'custom', message: 'History must end with an answer.' });
    }
  });
const messageSchema = z
  .object({
    algorithmId: z.string().trim().min(1).max(100),
    input: z
      .object({
        array: z.array(intValue).max(INPUT_MAX_VALUES),
        target: intValue.nullable(),
        index: z.number().int().min(0).max(INPUT_MAX_VALUES).nullable(),
      })
      .strict(),
    stepIndex: z.number().int().min(0).max(100_000),
    language: z.enum(['c', 'cpp', 'java', 'python']),
    question: z.string().trim().min(1, 'Ask a question.').max(QUESTION_MAX_CHARS, `Questions are limited to ${QUESTION_MAX_CHARS} characters.`),
    history: historySchema.default([]),
  })
  .strict();

// one question at a time per user (a second one is refused, not queued); separate from code execution's guard.
// Process-local, like the per-minute limits: each server instance has its own.
const asking = new Set<string>();

const ERROR_STATUS = { unavailable: 503, busy: 503, misconfigured: 503, timeout: 504, blocked: 422 } as const;
const ERROR_MESSAGE = {
  unavailable: 'The AI Tutor could not get an answer right now. Please try again.',
  busy: 'The AI Tutor is busy right now (its free daily limit may be used up). Please try again later.',
  misconfigured: 'The AI Tutor is temporarily unavailable.',
  timeout: 'The AI Tutor did not answer in time. Please try again.',
  blocked: 'The AI Tutor could not answer that question. Try asking about the algorithm in a different way.',
} as const;

// GET /api/tutor/status — whether the tutor is available on this server, its limits and today's usage
router.get('/status', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const provider = getTutorProvider();
    res.json({
      available: Boolean(provider),
      provider: provider?.name ?? null,
      model: provider?.model ?? null,
      limits: { questionMaxChars: QUESTION_MAX_CHARS, dailyPerUser: env.TUTOR_DAILY_LIMIT_PER_USER },
      usedToday: provider ? await quotaUsed(`tutor:user:${req.user!.userId}`, tutorQuotaDay()) : 0,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tutor/messages — one question about the visualizer's current state; nothing is stored
router.post('/messages', requireAuth, tutorRateLimiter, validateBody(messageSchema), async (req: AuthRequest, res, next) => {
  const provider = getTutorProvider();
  if (!provider) {
    res.status(503).json({ error: 'The AI Tutor is not available on this server.', code: 'tutor_disabled' });
    return;
  }
  const userId = req.user!.userId;
  const body = req.body as z.infer<typeof messageSchema>;

  // the context comes from the server's own run of the algorithm; an invalid state costs no allowance
  const built = buildTutorContext({ algorithmId: body.algorithmId, ...body.input, stepIndex: body.stepIndex, language: body.language });
  if (!built.ok) {
    res.status(400).json({ error: built.message, code: 'invalid_context' });
    return;
  }

  if (asking.has(userId)) {
    res.status(429).json({ error: 'Your previous question is still being answered.', code: 'tutor_in_progress' });
    return;
  }
  // all users together, this minute: refused before any daily allowance is used
  const slot = takeTutorGlobalSlot();
  if (!slot.ok) {
    res.status(503).json({
      error: 'The AI Tutor is answering many questions right now. Please try again in a minute.',
      code: 'tutor_global_rate_limited',
      retryAfterSeconds: slot.retryAfterSeconds,
    });
    return;
  }
  asking.add(userId);
  const day = tutorQuotaDay();
  const userKey = `tutor:user:${userId}`;
  let charged = false;
  try {
    const used = await consumeQuota(userKey, env.TUTOR_DAILY_LIMIT_PER_USER, day);
    if (used === null) {
      releaseTutorGlobalSlot(slot.window);
      res.status(429).json({ error: `You have asked today's ${env.TUTOR_DAILY_LIMIT_PER_USER} questions. The limit resets at midnight Pacific Time.`, code: 'tutor_daily_limit' });
      return;
    }
    if ((await consumeQuota('tutor:global', env.TUTOR_DAILY_LIMIT_GLOBAL, day)) === null) {
      releaseTutorGlobalSlot(slot.window);
      await refundQuota(userKey, day);
      res.status(503).json({ error: 'The AI Tutor has reached its daily capacity. Please try again tomorrow.', code: 'tutor_global_limit' });
      return;
    }
    charged = true;

    const answer = await provider.ask({
      system: tutorSystemInstruction(built.context),
      turns: [...body.history, { role: 'user', text: body.question }],
    });
    res.json({ answer: answer.text, truncated: answer.truncated, model: provider.model, usedToday: used, dailyLimit: env.TUTOR_DAILY_LIMIT_PER_USER });
  } catch (err) {
    if (err instanceof TutorProviderError) {
      // never reached the provider: give the question back
      if (charged && !err.sent) {
        releaseTutorGlobalSlot(slot.window);
        await Promise.all([refundQuota(userKey, day), refundQuota('tutor:global', day)]);
      }
      // the kind only: provider messages and request contents are never logged
      if (err.kind === 'misconfigured' || err.kind === 'unavailable') console.error(`[tutor] ${provider.name}: ${err.kind}`);
      res.status(ERROR_STATUS[err.kind]).json({ error: ERROR_MESSAGE[err.kind], code: `tutor_${err.kind}` });
      return;
    }
    next(err);
  } finally {
    asking.delete(userId);
  }
});

export default router;
