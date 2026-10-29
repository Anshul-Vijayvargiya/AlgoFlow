import { Router, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { executionRateLimiter } from '../middleware/rateLimiter';
import { getExecutionProvider } from '../services/execution';
import { ExecutionProviderError, EXECUTION_LANGUAGES, type ExecutionProvider } from '../services/execution/types';
import { consumeQuota, quotaUsed, refundQuota, utcDay } from '../services/execution/quota';
import { finishExecution, tryStartExecution } from '../services/execution/concurrency';
import { buildPythonTraceProgram, extractTrace } from '../services/execution/tracing/pythonTracer';
import { TRACE_LIMITS, validateTrace } from '../../src/execution/trace';
import { NOT_RECORDED_MESSAGE, recordedTraceFor } from '../../src/execution/recordedTraces';

const router = Router();

export const SOURCE_MAX_CHARS = 50_000; // the same cap as a stored practice submission
export const STDIN_MAX_CHARS = 10_000;
/** returned output is capped so a program printing in a loop cannot produce a huge response */
export const OUTPUT_MAX_CHARS = 64_000;
/** the provider's stderr shown when a trace could not be produced (the program's own stderr is in the trace) */
export const TRACE_STDERR_MAX_CHARS = 2_000;
/** languages the step-by-step view can trace */
export const TRACE_LANGUAGES = ['python'] as const;

const runSchema = z
  .object({
    language: z.enum(EXECUTION_LANGUAGES as [string, ...string[]]),
    source: z.string().min(1, 'The program is empty.').max(SOURCE_MAX_CHARS, `Programs are limited to ${SOURCE_MAX_CHARS} characters.`),
    stdin: z.string().max(STDIN_MAX_CHARS, `Input is limited to ${STDIN_MAX_CHARS} characters.`).default(''),
  })
  .strict();
type RunBody = z.infer<typeof runSchema>;

/** a provider may offer only some languages (the local one: Python only); nothing is charged for the others */
function refuseUnoffered(provider: ExecutionProvider, language: string, res: Response): boolean {
  if (provider.languages().some(l => l.id === language)) return false;
  res.status(400).json({ error: `Running ${language} is not available on this server.`, code: 'language_unavailable' });
  return true;
}

const cap = (s: string, max = OUTPUT_MAX_CHARS) => (s.length > max ? { text: s.slice(0, max), truncated: true } : { text: s, truncated: false });

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
      // step-by-step tracing: real runs on a real provider; recorded example traces only on the fake one
      tracing: provider ? { languages: [...TRACE_LANGUAGES], mode: provider.name === 'fake' ? 'recorded' : 'runtime', maxSteps: TRACE_LIMITS.maxSteps } : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Runs `work` as one charged execution: one execution at a time per user (Playground and Practice together; a second
 * is refused, not queued), the user's and the global daily allowance, and a refund when the provider never accepted
 * the program. `work` sends the response; it receives today's usage.
 */
async function chargedExecution(req: AuthRequest, res: Response, provider: ExecutionProvider, work: (usedToday: number) => Promise<void>): Promise<void> {
  const userId = req.user!.userId;
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
    await work(used);
  } catch (err) {
    if (err instanceof ExecutionProviderError) {
      // the program was not run by the provider: give the user's and the global allowance back
      if (charged && !err.submitted) await Promise.all([refundQuota(userKey, day), refundQuota('global', day)]);
      if (err.kind === 'misconfigured') console.error(`[execution] ${provider.name}: ${err.message}`);
      res.status(PROVIDER_ERROR_STATUS[err.kind]).json({ error: PROVIDER_ERROR_MESSAGE[err.kind], code: `provider_${err.kind}` });
      return;
    }
    throw err;
  } finally {
    finishExecution(userId);
  }
}

// POST /api/run — runs the signed-in user's program on the execution provider and returns what it really did
router.post('/', requireAuth, executionRateLimiter, validateBody(runSchema), async (req: AuthRequest, res, next) => {
  const provider = getExecutionProvider();
  if (!provider) {
    res.status(503).json({ error: 'Code execution is not available on this server.', code: 'execution_disabled' });
    return;
  }
  if (refuseUnoffered(provider, (req.body as RunBody).language, res)) return;
  try {
    await chargedExecution(req, res, provider, async used => {
      const { language, source, stdin } = req.body as RunBody;
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
    });
  } catch (err) {
    next(err);
  }
});

const TRACE_MESSAGES = {
  timeout: "The execution service stopped the program at its time limit before the tracer could report, so there is no trace. Programs that run a long time without executing lines of your code (for example, one huge library call) cannot be traced.",
  incomplete: "The trace was cut off by the execution service's output limit, so it cannot be shown. Try a smaller input or fewer steps.",
  missing: 'The program ended without the tracer reporting (for example: it ran out of memory, or ended the process directly with os._exit), so there is no trace.',
  invalid: 'The trace could not be verified, so it is not shown. Your program did run; use Run Code to see its output.',
} as const;

// POST /api/run/trace — runs the program under the step-by-step tracer and returns the verified trace, or why there is none
router.post('/trace', requireAuth, executionRateLimiter, validateBody(runSchema), async (req: AuthRequest, res, next) => {
  const { language, source, stdin } = req.body as RunBody;
  if (!(TRACE_LANGUAGES as readonly string[]).includes(language)) {
    res.status(400).json({ error: 'Step-by-step tracing is available for Python only.', code: 'trace_unsupported_language' });
    return;
  }
  const provider = getExecutionProvider();
  if (!provider) {
    res.status(503).json({ error: 'Code execution is not available on this server.', code: 'execution_disabled' });
    return;
  }
  if (refuseUnoffered(provider, language, res)) return;
  // the fake provider runs nothing: only the recorded example traces exist (and nothing is charged for them)
  if (provider.name === 'fake') {
    const recorded = recordedTraceFor(source, stdin);
    if (!recorded) {
      res.status(422).json({ error: NOT_RECORDED_MESSAGE, code: 'trace_not_recorded' });
      return;
    }
    res.json({ status: 'traced', trace: recorded.trace, message: null, stderr: '', timeMs: null, memoryKb: null, language: provider.languages().find(l => l.id === language), provider: provider.name, usedToday: await quotaUsed(`user:${req.user!.userId}`), dailyLimit: env.EXECUTION_DAILY_LIMIT_PER_USER });
    return;
  }
  try {
    await chargedExecution(req, res, provider, async used => {
      const nonce = randomBytes(16).toString('hex');
      const result = await provider.execute({ language: 'python', source: buildPythonTraceProgram(source, nonce), stdin });
      const base = { timeMs: result.timeMs, memoryKb: result.memoryKb, language: provider.languages().find(l => l.id === language), provider: provider.name, usedToday: used, dailyLimit: env.EXECUTION_DAILY_LIMIT_PER_USER };
      const none = (status: 'timeout' | 'no_trace' | 'invalid_trace', message: string, stderr = '') => res.json({ status, trace: null, message, stderr: cap(stderr, TRACE_STDERR_MAX_CHARS).text, ...base });

      const found = extractTrace(result.stdout, nonce);
      if (found.kind !== 'found') {
        if (result.status === 'timeout') return void none('timeout', TRACE_MESSAGES.timeout);
        return void none('no_trace', found.kind === 'incomplete' ? TRACE_MESSAGES.incomplete : TRACE_MESSAGES.missing, result.stderr || result.compileOutput);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(found.json);
      } catch {
        console.error('[trace] the tracer output is not JSON');
        return void none('invalid_trace', TRACE_MESSAGES.invalid);
      }
      const checked = validateTrace(raw, { source, stdin });
      if (!checked.ok || checked.trace.provenance !== 'runtime') {
        // never the program or its data in the log: only which check failed
        console.error(`[trace] rejected: ${checked.ok ? 'provenance' : checked.reason}`);
        return void none('invalid_trace', TRACE_MESSAGES.invalid);
      }
      res.json({ status: 'traced', trace: checked.trace, message: null, stderr: '', ...base });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
