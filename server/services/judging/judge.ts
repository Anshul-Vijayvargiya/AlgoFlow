/**
 * Judges a submission against a problem's test cases on the execution provider (never in this process). Tests run
 * in order and judging stops at the first failure. ACCEPTED requires every test to have run and matched; anything the
 * judge could not finish (a provider failure, an empty test list) is JUDGING_ERROR, never a pass.
 *
 * Hidden tests stay hidden: for a failure on a hidden test only its number is reported, never its input, expected
 * output, or the program's output or stderr (which could echo the input).
 */
import { outputsMatch, type Verdict } from '../../../src/execution/judgeCore';
import { ExecutionProviderError, type ExecutionLanguage, type ExecutionProvider } from '../execution/types';

export interface JudgeTest {
  input: string;
  expected: string;
  isHidden?: boolean;
}

export interface FailedTest {
  /** 1-based, in the problem's test order */
  number: number;
  hidden: boolean;
  /** visible tests only */
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}

export interface JudgeOutcome {
  verdict: Verdict;
  testsPassed: number;
  testsTotal: number;
  /** programs the provider accepted (and so may have counted against the plan) */
  runsUsed: number;
  failedTest?: FailedTest;
  compileOutput?: string;
  /** the slowest test and the most memory, as reported by the provider */
  maxTimeMs: number | null;
  maxMemoryKb: number | null;
  /** JUDGING_ERROR only: why judging could not finish (safe to show) */
  error?: { kind: ExecutionProviderError['kind'] | 'no_tests'; message: string };
}

/** text returned for a visible test is capped: enough to compare by eye, never a huge response */
export const DETAIL_MAX_CHARS = 2000;
const clip = (s: string) => (s.length > DETAIL_MAX_CHARS ? `${s.slice(0, DETAIL_MAX_CHARS)}…` : s);

/**
 * No new test starts after this long: one test can still take up to ~30 s at the provider (its result deadline plus a
 * request timeout), so a submission finishes within ~90 s, inside the browser's 120 s request timeout. Without a
 * budget, a slow provider could keep judging long after the browser gave up, recording and charging an answer the
 * user never saw.
 */
export const JUDGING_BUDGET_MS = 60_000;

const JUDGING_ERROR_MESSAGES: Record<ExecutionProviderError['kind'], string> = {
  unavailable: 'The code execution service is unavailable, so judging could not finish.',
  busy: 'The code execution service is busy, so judging could not finish.',
  misconfigured: 'Code execution is temporarily unavailable, so judging could not finish.',
  timeout: 'The code execution service did not return a result in time, so judging could not finish.',
};

export async function judgeSubmission(
  provider: ExecutionProvider,
  submission: { language: ExecutionLanguage; source: string },
  tests: readonly JudgeTest[],
  { budgetMs = JUDGING_BUDGET_MS, now = Date.now }: { budgetMs?: number; now?: () => number } = {}
): Promise<JudgeOutcome> {
  const deadline = now() + budgetMs;
  const outcome: JudgeOutcome = { verdict: 'JUDGING_ERROR', testsPassed: 0, testsTotal: tests.length, runsUsed: 0, maxTimeMs: null, maxMemoryKb: null };
  if (tests.length === 0) {
    return { ...outcome, error: { kind: 'no_tests', message: 'This problem has no test cases, so it cannot be judged.' } };
  }

  for (let i = 0; i < tests.length; i++) {
    if (i > 0 && now() >= deadline) {
      return { ...outcome, verdict: 'JUDGING_ERROR', error: { kind: 'timeout', message: 'Judging took too long on the code execution service, so it could not finish.' } };
    }
    const test = tests[i];
    const hidden = Boolean(test.isHidden);
    let result;
    try {
      result = await provider.execute({ language: submission.language, source: submission.source, stdin: test.input });
      outcome.runsUsed++;
    } catch (err) {
      if (!(err instanceof ExecutionProviderError)) throw err;
      if (err.submitted) outcome.runsUsed++;
      return { ...outcome, verdict: 'JUDGING_ERROR', error: { kind: err.kind, message: JUDGING_ERROR_MESSAGES[err.kind] } };
    }
    if (result.timeMs !== null) outcome.maxTimeMs = Math.max(outcome.maxTimeMs ?? 0, result.timeMs);
    if (result.memoryKb !== null) outcome.maxMemoryKb = Math.max(outcome.maxMemoryKb ?? 0, result.memoryKb);

    const failed = (verdict: Verdict, details: Omit<FailedTest, 'number' | 'hidden'> = {}): JudgeOutcome => ({
      ...outcome,
      verdict,
      failedTest: hidden ? { number: i + 1, hidden } : { number: i + 1, hidden, input: clip(test.input), expected: clip(test.expected), ...details },
    });

    if (result.status === 'compile_error') {
      // the compiler output depends only on the program, not on any test input
      return { ...outcome, verdict: 'COMPILATION_ERROR', compileOutput: clip(result.compileOutput) };
    }
    if (result.status === 'timeout') return failed('TIME_LIMIT_EXCEEDED');
    if (result.status === 'runtime_error') return failed('RUNTIME_ERROR', { stderr: clip(result.stderr), actual: clip(result.stdout) });
    if (!outputsMatch(result.stdout, test.expected)) return failed('WRONG_ANSWER', { actual: clip(result.stdout) });
    outcome.testsPassed++;
  }

  return outcome.testsPassed === tests.length ? { ...outcome, verdict: 'ACCEPTED' } : { ...outcome, verdict: 'JUDGING_ERROR' };
}
