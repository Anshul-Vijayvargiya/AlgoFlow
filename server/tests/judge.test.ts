import { describe, it, expect, vi } from 'vitest';
import { judgeSubmission, DETAIL_MAX_CHARS, type JudgeTest } from '../services/judging/judge';
import { ExecutionProviderError, type ExecutionProvider, type ExecutionResult } from '../services/execution/types';
import { normalizeOutput, outputsMatch } from '../../src/execution/judgeCore';
import mongoose from 'mongoose';
import { Submission, SUBMISSION_STATUSES } from '../models/Submission';

// The judge with a scripted provider: every verdict, every provider failure, and what may and may not be revealed.
const ok = (stdout: string, extra: Partial<ExecutionResult> = {}): ExecutionResult => ({
  status: 'success', stdout, stderr: '', compileOutput: '', exitCode: 0, exitSignal: null, timeMs: 10, memoryKb: 1000, ...extra,
});

/** a provider that answers each run with the next scripted result (or throws it) */
function scripted(...results: Array<ExecutionResult | Error>) {
  const execute = vi.fn(async () => {
    const next = results.shift();
    if (!next) throw new Error('more runs than scripted');
    if (next instanceof Error) throw next;
    return next;
  });
  return { provider: { name: 'fake', languages: () => [], execute } as ExecutionProvider, execute };
}

const TESTS: JudgeTest[] = [
  { input: '1 2\n', expected: '3' },
  { input: '5 5\n', expected: '10' },
  { input: 'SECRET_INPUT 7 8\n', expected: 'SECRET_EXPECTED 15', isHidden: true },
];
const judge = (provider: ExecutionProvider, tests = TESTS) => judgeSubmission(provider, { language: 'cpp', source: 'int main(){}' }, tests);

describe('verdicts', () => {
  it('ACCEPTED only when every test, hidden ones included, ran and matched', async () => {
    const { provider, execute } = scripted(ok('3\n'), ok('10\n', { timeMs: 25, memoryKb: 3000 }), ok('SECRET_EXPECTED 15\n'));
    const r = await judge(provider);
    expect(r).toMatchObject({ verdict: 'ACCEPTED', testsPassed: 3, testsTotal: 3, runsUsed: 3, maxTimeMs: 25, maxMemoryKb: 3000 });
    expect(r.failedTest).toBeUndefined();
    // each test's own input, from the server's list
    expect(execute.mock.calls.map(c => (c as unknown as [{ stdin: string }])[0].stdin)).toEqual(TESTS.map(t => t.input));
  });

  it('WRONG_ANSWER on a visible test: its input, expected and actual output; judging stops there', async () => {
    const { provider, execute } = scripted(ok('3\n'), ok('11\n'));
    const r = await judge(provider);
    expect(r).toMatchObject({ verdict: 'WRONG_ANSWER', testsPassed: 1, runsUsed: 2, failedTest: { number: 2, hidden: false, input: '5 5\n', expected: '10', actual: '11\n' } });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('a failure on a HIDDEN test reveals only its number: no input, expected output, stdout or stderr', async () => {
    for (const result of [ok('SECRET_INPUT echoed\n'), ok('', { status: 'runtime_error', stderr: 'SECRET_INPUT in stderr', exitCode: 1 }), ok('', { status: 'timeout' })]) {
      const { provider } = scripted(ok('3\n'), ok('10\n'), result);
      const r = await judge(provider);
      expect(r.failedTest).toEqual({ number: 3, hidden: true });
      expect(JSON.stringify(r)).not.toMatch(/SECRET_/);
    }
  });

  it('COMPILATION_ERROR: the compiler output, no further runs, no tests passed', async () => {
    const { provider, execute } = scripted(ok('', { status: 'compile_error', compileOutput: "main.cpp:1: error: expected ';'", exitCode: null }));
    const r = await judge(provider);
    expect(r).toMatchObject({ verdict: 'COMPILATION_ERROR', testsPassed: 0, runsUsed: 1, compileOutput: "main.cpp:1: error: expected ';'" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('RUNTIME_ERROR on a visible test: stderr and output so far', async () => {
    const { provider } = scripted(ok('', { status: 'runtime_error', stderr: 'Segmentation fault', stdout: 'partial', exitCode: 139 }));
    const r = await judge(provider);
    expect(r).toMatchObject({ verdict: 'RUNTIME_ERROR', failedTest: { number: 1, hidden: false, stderr: 'Segmentation fault', actual: 'partial' } });
  });

  it('TIME_LIMIT_EXCEEDED', async () => {
    const { provider } = scripted(ok('3'), ok('', { status: 'timeout', timeMs: 2000 }));
    expect(await judge(provider)).toMatchObject({ verdict: 'TIME_LIMIT_EXCEEDED', testsPassed: 1, failedTest: { number: 2 }, maxTimeMs: 2000 });
  });
});

describe('judging errors are never a pass', () => {
  it.each(['unavailable', 'busy', 'misconfigured', 'timeout'] as const)('a provider failure (%s) after passing tests is JUDGING_ERROR', async kind => {
    const { provider } = scripted(ok('3'), ok('10'), new ExecutionProviderError(kind, 'detail', true));
    const r = await judge(provider);
    expect(r.verdict).toBe('JUDGING_ERROR');
    expect(r).toMatchObject({ testsPassed: 2, testsTotal: 3, runsUsed: 3, error: { kind } });
    expect(r.error!.message).not.toContain('detail');
  });

  it('a failure the provider never accepted is not counted as a used run (it is refunded)', async () => {
    const { provider } = scripted(ok('3'), new ExecutionProviderError('unavailable', 'x', false));
    expect(await judge(provider)).toMatchObject({ verdict: 'JUDGING_ERROR', runsUsed: 1 });
  });

  it('a problem without tests cannot be judged (not an empty pass)', async () => {
    const { provider, execute } = scripted();
    expect(await judge(provider, [])).toMatchObject({ verdict: 'JUDGING_ERROR', testsTotal: 0, runsUsed: 0, error: { kind: 'no_tests' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('no new test starts once the judging budget is spent: JUDGING_ERROR, never a pass, the rest not run', async () => {
    let clock = 0;
    const { provider, execute } = scripted(ok('3'), ok('10'), ok('SECRET_EXPECTED 15'));
    (execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      clock += 40_000; // each run takes 40 s
      return [ok('3'), ok('10'), ok('SECRET_EXPECTED 15')][execute.mock.calls.length - 1];
    });
    const r = await judgeSubmission(provider, { language: 'cpp', source: 'x' }, TESTS, { budgetMs: 60_000, now: () => clock });
    expect(r).toMatchObject({ verdict: 'JUDGING_ERROR', testsPassed: 2, runsUsed: 2, error: { kind: 'timeout' } });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('the first test always runs, even with a spent budget', async () => {
    const { provider } = scripted(ok('3'));
    const r = await judgeSubmission(provider, { language: 'cpp', source: 'x' }, [TESTS[0]], { budgetMs: 0 });
    expect(r.verdict).toBe('ACCEPTED');
  });

  it('an unexpected error is thrown, not turned into a verdict', async () => {
    const { provider } = scripted(new Error('bug'));
    await expect(judge(provider)).rejects.toThrow('bug');
  });
});

describe('inputs and outputs', () => {
  it('empty input and empty expected output: a program printing nothing passes, one printing something does not', async () => {
    const tests = [{ input: '', expected: '' }];
    expect((await judge(scripted(ok('')).provider, tests)).verdict).toBe('ACCEPTED');
    expect((await judge(scripted(ok('\n\n')).provider, tests)).verdict).toBe('ACCEPTED');
    expect((await judge(scripted(ok('0\n')).provider, tests)).verdict).toBe('WRONG_ANSWER');
  });

  it('malformed or unexpected output is simply a wrong answer', async () => {
    for (const out of ['three', '3 extra', '\u0000\u0001', '3\n4', '-3']) {
      expect((await judge(scripted(ok(out)).provider, [{ input: '1 2', expected: '3' }])).verdict, JSON.stringify(out)).toBe('WRONG_ANSWER');
    }
  });

  it('long visible output in a failure is clipped', async () => {
    const r = await judge(scripted(ok('9'.repeat(DETAIL_MAX_CHARS + 100))).provider, [{ input: '1', expected: '1' }]);
    expect(r.failedTest!.actual!.length).toBe(DETAIL_MAX_CHARS + 1);
  });
});

describe('stored verdicts', () => {
  it('every verdict, and legacy statuses, are values the Submission model accepts; others are rejected', () => {
    const doc = (status: string) => new Submission({ userId: new mongoose.Types.ObjectId(), problemId: 'p1', language: 'c', code: 'x', status });
    for (const status of ['ACCEPTED', 'WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'JUDGING_ERROR', 'SUBMITTED', 'PENDING']) {
      expect(SUBMISSION_STATUSES).toContain(status);
      expect(doc(status).validateSync(), status).toBeUndefined();
    }
    expect(doc('PASSED').validateSync()).toBeDefined();
  });
});

describe('output comparison', () => {
  it('ignores line endings, trailing spaces and trailing blank lines', () => {
    expect(outputsMatch('1 2\r\n3  \r\n\r\n', '1 2\n3')).toBe(true);
    expect(outputsMatch('true\n', 'true')).toBe(true);
    expect(normalizeOutput('a \t\nb\n\n\n')).toBe('a\nb');
  });

  it('is otherwise exact: spaces between values, leading spaces, case, extra lines', () => {
    expect(outputsMatch('1  2', '1 2')).toBe(false);
    expect(outputsMatch(' 1 2', '1 2')).toBe(false);
    expect(outputsMatch('True', 'true')).toBe(false);
    expect(outputsMatch('1\n\n2', '1\n2')).toBe(false);
    expect(outputsMatch('', '0')).toBe(false);
  });
});
