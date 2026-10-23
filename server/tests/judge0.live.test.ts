import { describe, it, expect, beforeAll } from 'vitest';
import { Judge0Provider, parseLanguageOverrides } from '../services/execution/judge0Provider';
import { judgeSubmission } from '../services/judging/judge';
import { STARTER_PROGRAMS } from '../../src/pages/playground/starterPrograms';
import { PRACTICE_PROBLEMS } from '../../src/data/practiceProblems';
import { HIDDEN_TESTS } from '../config/practiceProblemTests';
import { REFERENCE_SOLUTIONS } from './fixtures/practiceReferenceSolutions';
import type { ExecutionLanguage } from '../services/execution/types';

/**
 * OPT-IN: runs real programs on a real Judge0 service. Skipped unless JUDGE0_LIVE=1, so `npm test` never spends quota.
 *
 *   JUDGE0_LIVE=1 JUDGE0_LIVE_URL=https://judge0-ce.p.rapidapi.com JUDGE0_LIVE_API_KEY=… \
 *   JUDGE0_LIVE_ALLOWANCE=<submissions you can still spend today> \
 *     npx vitest run server/tests/judge0.live.test.ts
 *
 * Cost: 13 submissions (4 languages × success, compilation failure and runtime failure, plus one time-limit case)
 * and 4 language lookups. With JUDGE0_LIVE_PRACTICE=1, also 27 more: Two Sum (6 tests) judged with the reference
 * solution in each language (24), and one Wrong Answer, Compilation Error and Time Limit Exceeded verdict through the
 * real judge (1 each: judging stops at the first failing test). The run refuses to start unless JUDGE0_LIVE_ALLOWANCE covers its submissions (the free
 * RapidAPI plan allows 50 a day). Optional: JUDGE0_LIVE_AUTH (rapidapi | x-auth-token | none, default rapidapi),
 * JUDGE0_LIVE_LANGUAGES (JSON, as JUDGE0_LANGUAGES). The key is read from the environment only and never printed.
 */
const LIVE = process.env.JUDGE0_LIVE === '1';
const PRACTICE = process.env.JUDGE0_LIVE_PRACTICE === '1';
const LANGUAGES: ExecutionLanguage[] = ['c', 'cpp', 'java', 'python'];
export const LIVE_SUBMISSIONS = 13 + (PRACTICE ? 27 : 0);

/** one program per language and outcome; Python is interpreted, so its syntax error is a runtime error on Judge0 */
const FAILURES: Record<ExecutionLanguage, { compile: string; runtime: string; compileStatus: 'compile_error' | 'runtime_error' }> = {
  c: { compile: 'int main(void) { return 0 }\n', runtime: 'int main(void) { volatile int *p = 0; *p = 1; return 0; }\n', compileStatus: 'compile_error' },
  cpp: { compile: 'int main() { return 0 }\n', runtime: '#include <stdexcept>\nint main() { throw std::runtime_error("boom"); }\n', compileStatus: 'compile_error' },
  java: {
    compile: 'public class Main { public static void main(String[] a) { int x = ; } }\n',
    runtime: 'public class Main { public static void main(String[] a) { System.out.println("before"); throw new RuntimeException("boom"); } }\n',
    compileStatus: 'compile_error',
  },
  python: { compile: 'def broken(:\n    pass\n', runtime: 'import sys\nprint("before")\nsys.exit(3)\n', compileStatus: 'runtime_error' },
};

describe.skipIf(!LIVE)('Judge0 (live, opt-in)', () => {
  const config = {
    apiUrl: process.env.JUDGE0_LIVE_URL ?? '',
    apiKey: process.env.JUDGE0_LIVE_API_KEY,
    auth: (process.env.JUDGE0_LIVE_AUTH as 'rapidapi' | 'x-auth-token' | 'none') ?? 'rapidapi',
    languages: parseLanguageOverrides(process.env.JUDGE0_LIVE_LANGUAGES),
  };
  const provider = new Judge0Provider({ ...config, resultDeadlineMs: 30_000 });

  beforeAll(() => {
    const allowance = Number(process.env.JUDGE0_LIVE_ALLOWANCE);
    if (!Number.isFinite(allowance) || allowance < LIVE_SUBMISSIONS) {
      throw new Error(`This run uses ${LIVE_SUBMISSIONS} submissions: set JUDGE0_LIVE_ALLOWANCE to the number you can still spend today (at least ${LIVE_SUBMISSIONS}).`);
    }
  });

  it.each(LANGUAGES)("the provider's %s version is the one the Playground shows", async language => {
    const { id, label } = config.languages[language];
    const headers: Record<string, string> = config.auth === 'rapidapi'
      ? { 'X-RapidAPI-Key': config.apiKey ?? '', 'X-RapidAPI-Host': new URL(config.apiUrl).host }
      : config.auth === 'x-auth-token' ? { 'X-Auth-Token': config.apiKey ?? '' } : {};
    const res = await fetch(`${config.apiUrl.replace(/\/+$/, '')}/languages/${id}`, { headers });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe(label);
  }, 30_000);

  it.each(LANGUAGES)('%s: the starter program compiles and runs with stdin', async language => {
    const r = await provider.execute({ language, source: STARTER_PROGRAMS[language], stdin: '8, 3, 5' });
    expect(r).toMatchObject({ status: 'success', exitCode: 0, stdout: 'Element [0] = 8\nElement [1] = 3\nElement [2] = 5\n' });
    expect(r.timeMs).not.toBeNull();
  }, 60_000);

  it.each(LANGUAGES)('%s: a syntax error is reported with the compiler (or interpreter) output', async language => {
    const r = await provider.execute({ language, source: FAILURES[language].compile, stdin: '' });
    expect(r.status).toBe(FAILURES[language].compileStatus);
    expect(`${r.compileOutput}\n${r.stderr}`).toMatch(/error/i);
  }, 60_000);

  it.each(LANGUAGES)('%s: a runtime failure is reported as a runtime error', async language => {
    const r = await provider.execute({ language, source: FAILURES[language].runtime, stdin: '' });
    expect(r.status).toBe('runtime_error');
    if (language === 'python') expect(r).toMatchObject({ stdout: 'before\n', exitCode: 3 });
    if (language === 'java') expect(r.stderr).toMatch(/boom/);
  }, 60_000);

  it('an endless loop is stopped at the time limit', async () => {
    const r = await provider.execute({ language: 'python', source: 'while True:\n    pass\n', stdin: '' });
    expect(r.status).toBe('timeout');
  }, 60_000);

  describe.skipIf(!PRACTICE)('practice judging (JUDGE0_LIVE_PRACTICE=1)', () => {
    const p1 = PRACTICE_PROBLEMS.find(p => p.problemId === 'p1')!;
    const tests = [...p1.visibleTests.map(t => ({ ...t, isHidden: false })), ...HIDDEN_TESTS.p1.map(t => ({ ...t, isHidden: true }))];

    it.each(LANGUAGES)('%s: the Two Sum reference solution is ACCEPTED on every visible and hidden test', async language => {
      const { stub, solution } = REFERENCE_SOLUTIONS.p1[language];
      const r = await judgeSubmission(provider, { language, source: p1.starterCode[language].replace(stub, solution) }, tests, { budgetMs: 300_000 });
      expect(r).toMatchObject({ verdict: 'ACCEPTED', testsPassed: tests.length, testsTotal: tests.length });
    }, 360_000);

    it('the untouched starter is a Wrong Answer on the first test (and only that test runs)', async () => {
      const r = await judgeSubmission(provider, { language: 'python', source: p1.starterCode.python }, tests, { budgetMs: 120_000 });
      expect(r).toMatchObject({ verdict: 'WRONG_ANSWER', testsPassed: 0, runsUsed: 1, failedTest: { number: 1, hidden: false, actual: '-1 -1\n' } });
    }, 120_000);

    it('a program that does not compile is a Compilation Error, with no test run after it', async () => {
      const r = await judgeSubmission(provider, { language: 'java', source: FAILURES.java.compile }, tests, { budgetMs: 120_000 });
      expect(r).toMatchObject({ verdict: 'COMPILATION_ERROR', runsUsed: 1 });
      expect(r.compileOutput).toMatch(/error/i);
    }, 120_000);

    it('an endless loop is a Time Limit Exceeded verdict, not a judging error', async () => {
      const r = await judgeSubmission(provider, { language: 'cpp', source: 'int main() { for (;;) {} }\n' }, tests, { budgetMs: 120_000 });
      expect(r).toMatchObject({ verdict: 'TIME_LIMIT_EXCEEDED', runsUsed: 1, failedTest: { number: 1 } });
    }, 120_000);
  });
});
