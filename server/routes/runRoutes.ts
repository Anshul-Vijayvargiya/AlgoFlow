import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { executionRateLimiter } from '../middleware/rateLimiter';
import { getExecutionProvider } from '../services/execution';
import { ExecutionProviderError, EXECUTION_LANGUAGES } from '../services/execution/types';
import { consumeQuota, quotaUsed, refundQuota, utcDay } from '../services/execution/quota';
import { finishExecution, tryStartExecution } from '../services/execution/concurrency';

const router = Router();

export const SOURCE_MAX_CHARS = 50_000; // the same cap as a stored practice submission
export const STDIN_MAX_CHARS = 10_000;
/** returned output is capped so a program printing in a loop cannot produce a huge response */
export const OUTPUT_MAX_CHARS = 64_000;

const runSchema = z
  .object({
    language: z.enum(EXECUTION_LANGUAGES as [string, ...string[]]),
    source: z.string().min(1, 'The program is empty.').max(SOURCE_MAX_CHARS, `Programs are limited to ${SOURCE_MAX_CHARS} characters.`),
    stdin: z.string().max(STDIN_MAX_CHARS, `Input is limited to ${STDIN_MAX_CHARS} characters.`).default(''),
  })
  .strict();

const cap = (s: string) => (s.length > OUTPUT_MAX_CHARS ? { text: s.slice(0, OUTPUT_MAX_CHARS), truncated: true } : { text: s, truncated: false });

const PROVIDER_ERROR_STATUS = { unavailable: 503, busy: 503, misconfigured: 503, timeout: 504 } as const;
const PROVIDER_ERROR_MESSAGE = {
  unavailable: 'The code execution service is unavailable right now. Your program was not run; please try again later.',
  busy: 'The code execution service is busy right now. Please try again in a minute.',
  misconfigured: 'Code execution is temporarily unavailable. Your program was not run.',
  timeout: 'The code execution service did not return a result in time. The result is unknown; please try again.',
} as const;

// GET /api/run/languages — what the Playground can run, with the provider's real versions, and today's usage
router.get('/languages', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const provider = getExecutionProvider();
    res.json({
      available: Boolean(provider),
      provider: provider?.name ?? null,
      languages: provider?.languages() ?? [],
      limits: { sourceMaxChars: SOURCE_MAX_CHARS, stdinMaxChars: STDIN_MAX_CHARS, dailyPerUser: env.EXECUTION_DAILY_LIMIT_PER_USER },
      usedToday: provider ? await quotaUsed(`user:${req.user!.userId}`) : 0,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/run — runs the signed-in user's program on the execution provider and returns what it really did
router.post('/', requireAuth, executionRateLimiter, validateBody(runSchema), async (req: AuthRequest, res, next) => {
  const provider = getExecutionProvider();
  if (!provider) {
    res.status(503).json({ error: 'Code execution is not available on this server.', code: 'execution_disabled' });
    return;
  }
  const userId = req.user!.userId;
  // one execution at a time per user, Playground and Practice together (a second one is refused, not queued)
  if (!tryStartExecution(userId)) {
    res.status(429).json({ error: 'Your previous program is still running. Wait for it to finish.', code: 'execution_in_progress' });
    return;
  }
  const userKey = `user:${userId}`;
  const day = utcDay();
  let charged = false;
  try {
    const used = await consumeQuota(userKey, env.EXECUTION_DAILY_LIMIT_PER_USER, day);
    if (used === null) {
      res.status(429).json({ error: `You have used today's ${env.EXECUTION_DAILY_LIMIT_PER_USER} code runs. The limit resets at 00:00 UTC.`, code: 'daily_quota_exceeded' });
      return;
    }
    if ((await consumeQuota('global', env.EXECUTION_DAILY_LIMIT_GLOBAL, day)) === null) {
      await refundQuota(userKey, day);
      res.status(503).json({ error: 'Code execution has reached its daily capacity. Please try again tomorrow.', code: 'global_quota_exceeded' });
      return;
    }
    charged = true;

    const { language, source, stdin } = req.body as z.infer<typeof runSchema>;
    const result = await provider.execute({ language: language as (typeof EXECUTION_LANGUAGES)[number], source, stdin });
    const stdout = cap(result.stdout);
    const stderr = cap(result.stderr);
    const compileOutput = cap(result.compileOutput);
    res.json({
      status: result.status,
      stdout: stdout.text,
      stderr: stderr.text,
      compileOutput: compileOutput.text,
      truncated: stdout.truncated || stderr.truncated || compileOutput.truncated,
      exitCode: result.exitCode,
      exitSignal: result.exitSignal,
      timeMs: result.timeMs,
      memoryKb: result.memoryKb,
      language: provider.languages().find(l => l.id === language),
      provider: provider.name,
      usedToday: used,
      dailyLimit: env.EXECUTION_DAILY_LIMIT_PER_USER,
    });
  } catch (err) {
    if (err instanceof ExecutionProviderError) {
      // the program was not run by the provider: give the user's and the global allowance back
      if (charged && !err.submitted) await Promise.all([refundQuota(userKey, day), refundQuota('global', day)]);
      if (err.kind === 'misconfigured') console.error(`[execution] ${provider.name}: ${err.message}`);
      res.status(PROVIDER_ERROR_STATUS[err.kind]).json({ error: PROVIDER_ERROR_MESSAGE[err.kind], code: `provider_${err.kind}` });
      return;
    }
    next(err);
  } finally {
    finishExecution(userId);
  }
});

export default router;
