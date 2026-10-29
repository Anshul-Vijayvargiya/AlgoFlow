import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';
import { ExecutionProviderError, type ExecutionProvider, type ExecutionResult } from '../services/execution/types';
import { env } from '../config/env';

// POST /api/problems/:id/submit and the history route, with the models, provider and quota store scripted.
const m = vi.hoisted(() => ({
  Problem: { findOne: vi.fn(), find: vi.fn(), countDocuments: vi.fn() },
  Submission: { create: vi.fn(), find: vi.fn(), findOne: vi.fn(), distinct: vi.fn() },
  ActivityLog: { findOneAndUpdate: vi.fn() },
  quota: { consumeQuota: vi.fn(), refundQuota: vi.fn(), quotaUsed: vi.fn(), utcDay: () => '2026-10-21' },
  state: { provider: null as ExecutionProvider | null },
}));
vi.mock('../models/Problem', () => ({ Problem: m.Problem }));
vi.mock('../models/Submission', async importOriginal => ({ ...(await importOriginal<object>()), Submission: m.Submission }));
vi.mock('../models/ActivityLog', () => ({ ActivityLog: m.ActivityLog }));
vi.mock('../services/execution', () => ({ getExecutionProvider: () => m.state.provider }));
vi.mock('../services/execution/quota', () => m.quota);
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const cookie = (id = USER) => [`algoflow_token=${tokenFor(id, 'USER')}`];
const submit = (body: object, id = USER, problem = 'p1') => request(app).post(`/api/problems/${problem}/submit`).set('Cookie', cookie(id)).send(body);
const valid = { language: 'python', code: 'print(3)' };

const judged = {
  problemId: 'p1',
  judgeMode: 'stdio',
  publicationStatus: 'published',
  testCases: [
    { input: '1 2\n', expected: '3', isHidden: false },
    { input: '4 4\n', expected: '8', isHidden: false },
    { input: 'HIDDEN_IN\n', expected: 'HIDDEN_OUT', isHidden: true },
  ],
};
const ok = (stdout: string, extra: Partial<ExecutionResult> = {}): ExecutionResult => ({
  status: 'success', stdout, stderr: '', compileOutput: '', exitCode: 0, exitSignal: null, timeMs: 12, memoryKb: 2048, ...extra,
});
function provider(...results: Array<ExecutionResult | Error>): ExecutionProvider {
  return {
    name: 'judge0',
    languages: () => (['c', 'cpp', 'java', 'python'] as const).map(id => ({ id, label: id })),
    execute: vi.fn(async () => {
      const next = results.shift();
      if (!next) throw new Error('unexpected run');
      if (next instanceof Error) throw next;
      return next;
    }),
  };
}
const created = () => m.Submission.create.mock.calls[0]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  m.Problem.findOne.mockResolvedValue(judged);
  m.Submission.create.mockImplementation(async (doc: object) => ({ _id: new mongoose.Types.ObjectId(), ...doc }));
  m.ActivityLog.findOneAndUpdate.mockResolvedValue({});
  m.quota.consumeQuota.mockResolvedValue(3);
  m.quota.refundQuota.mockResolvedValue(undefined);
  m.state.provider = provider(ok('3'), ok('8'), ok('HIDDEN_OUT'));
});

describe('submit — access and input', () => {
  it('requires a signed-in user; nothing runs or is recorded', async () => {
    const res = await request(app).post('/api/problems/p1/submit').send(valid);
    expect(res.status).toBe(401);
    expect(m.Submission.create).not.toHaveBeenCalled();
  });

  it('a client cannot send a verdict, tests or limits (strict body)', async () => {
    for (const extra of [{ passed: true }, { status: 'ACCEPTED' }, { testCases: [] }, { timeLimit: 99 }, { userId: OTHER }]) {
      expect((await submit({ ...valid, ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    expect(m.state.provider!.execute).not.toHaveBeenCalled();
  });

  it('unknown or unpublished problem: 404, nothing runs', async () => {
    m.Problem.findOne.mockResolvedValue(null);
    expect((await submit(valid)).status).toBe(404);
    expect(m.quota.consumeQuota).not.toHaveBeenCalled();
  });
});

describe('submit — verdicts are recorded as judged', () => {
  it('ACCEPTED: every test passed; recorded with passed = true and the counts', async () => {
    const res = await submit(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ACCEPTED', judged: true, passed: true, testsPassed: 3, testsTotal: 3, runtimeMs: 12, memoryMb: 2 });
    expect(res.body.message).toBe('Accepted: all 3 tests passed.');
    expect(created()).toMatchObject({ userId: USER, problemId: 'p1', language: 'python', status: 'ACCEPTED', passed: true, testsPassed: 3, testsTotal: 3 });
    // the tests the server holds, hidden one included, were run in order
    expect((m.state.provider!.execute as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].stdin)).toEqual(['1 2\n', '4 4\n', 'HIDDEN_IN\n']);
  });

  it('WRONG_ANSWER on a hidden test: only its number is returned or stored', async () => {
    m.state.provider = provider(ok('3'), ok('8'), ok('HIDDEN_IN echoed'));
    const res = await submit(valid);
    expect(res.body).toMatchObject({ status: 'WRONG_ANSWER', passed: false, testsPassed: 2, failedTest: { number: 3, hidden: true } });
    expect(JSON.stringify(res.body)).not.toMatch(/HIDDEN_/);
    expect(created()).toMatchObject({ status: 'WRONG_ANSWER', passed: false, failedTestNumber: 3, failedTestHidden: true });
    expect(JSON.stringify(created())).not.toMatch(/HIDDEN_/);
  });

  it('WRONG_ANSWER on a visible test shows input, expected and actual output', async () => {
    m.state.provider = provider(ok('4'));
    const res = await submit(valid);
    expect(res.body.failedTest).toEqual({ number: 1, hidden: false, input: '1 2\n', expected: '3', actual: '4' });
    expect(res.body.message).toBe('Wrong answer on test 1 (0 of 3 tests passed).');
  });

  it.each([
    ['COMPILATION_ERROR', ok('', { status: 'compile_error', compileOutput: 'SyntaxError' }), 'Compilation failed: no tests were run.'],
    ['RUNTIME_ERROR', ok('', { status: 'runtime_error', stderr: 'boom', exitCode: 1 }), 'Runtime error on test 1 (0 of 3 tests passed).'],
    ['TIME_LIMIT_EXCEEDED', ok('', { status: 'timeout' }), 'Time limit exceeded on test 1 (0 of 3 tests passed).'],
  ] as const)('%s', async (verdict, result, message) => {
    m.state.provider = provider(result);
    const res = await submit(valid);
    expect(res.body).toMatchObject({ status: verdict, passed: false, message });
    expect(created()).toMatchObject({ status: verdict, passed: false });
  });

  it('JUDGING_ERROR when the provider fails: recorded as not judged, never accepted, unused runs refunded', async () => {
    m.state.provider = provider(ok('3'), new ExecutionProviderError('unavailable', 'x', false));
    const res = await submit(valid);
    expect(res.body).toMatchObject({ status: 'JUDGING_ERROR', passed: false, testsPassed: 1, errorCode: 'provider_unavailable' });
    expect(res.body.message).toMatch(/^Judging error: .*not judged; please try again\.$/);
    expect(created()).toMatchObject({ status: 'JUDGING_ERROR', passed: false });
    // reserved 3, the provider accepted 1: 2 go back to the user and to the global allowance
    expect(m.quota.refundQuota).toHaveBeenCalledWith(`user:${USER}`, '2026-10-21', 2);
    expect(m.quota.refundQuota).toHaveBeenCalledWith('global', '2026-10-21', 2);
    // the judge could not finish: the submission is kept, but it earns no practice activity
    expect(m.ActivityLog.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a judging error earns no activity credit; every real verdict does (once per submission)', async () => {
    m.state.provider = provider(new ExecutionProviderError('timeout', 'x', true));
    expect((await submit(valid)).body.status).toBe('JUDGING_ERROR');
    expect(m.ActivityLog.findOneAndUpdate).not.toHaveBeenCalled();

    // a real verdict, even a failing one, is the learner's practice
    m.state.provider = provider(ok('3'), ok('wrong'));
    expect((await submit(valid, OTHER)).body.status).toBe('WRONG_ANSWER');
    expect(m.ActivityLog.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = m.ActivityLog.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ userId: OTHER, activityType: 'problem_submitted', targetId: 'p1' });
    expect(update).toMatchObject({ $inc: { minutes: 5 } });
  });

  it('a provider timeout while judging is a judging error, not a time limit verdict', async () => {
    m.state.provider = provider(new ExecutionProviderError('timeout', 'x', true));
    expect((await submit(valid)).body).toMatchObject({ status: 'JUDGING_ERROR', errorCode: 'provider_timeout', passed: false });
  });

  it('an unexpected failure is a 500 and records nothing (no fabricated verdict)', async () => {
    m.state.provider = provider(new Error('bug'));
    const res = await submit(valid);
    expect(res.status).toBe(500);
    expect(m.Submission.create).not.toHaveBeenCalled();
  });
});

describe('submit — quotas, limits and duplicates', () => {
  it('a language the provider does not offer (the local provider: Python only) is refused before anything is charged or recorded', async () => {
    const pythonOnly = provider(ok('3'));
    m.state.provider = { ...pythonOnly, name: 'local', languages: () => [{ id: 'python', label: 'Python 3.13.9 (local)' }] };
    const res = await submit({ language: 'cpp', code: 'int main(){}' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('language_unavailable');
    expect(m.quota.consumeQuota).not.toHaveBeenCalled();
    expect(m.Submission.create).not.toHaveBeenCalled();
    expect(pythonOnly.execute).not.toHaveBeenCalled();
  });

  it('reserves one run per test (user, then global); a compile error gives the unused runs back', async () => {
    m.state.provider = provider(ok('', { status: 'compile_error', compileOutput: 'e' }));
    await submit(valid);
    expect(m.quota.consumeQuota).toHaveBeenNthCalledWith(1, `user:${USER}`, env.EXECUTION_DAILY_LIMIT_PER_USER, '2026-10-21', 3);
    expect(m.quota.consumeQuota).toHaveBeenNthCalledWith(2, 'global', env.EXECUTION_DAILY_LIMIT_GLOBAL, '2026-10-21', 3);
    expect(m.quota.refundQuota).toHaveBeenCalledWith(`user:${USER}`, '2026-10-21', 2);
  });

  it('not enough runs left today: 429, nothing runs or is recorded', async () => {
    m.quota.consumeQuota.mockResolvedValueOnce(null);
    const res = await submit(valid);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('daily_quota_exceeded');
    expect(res.body.error).toMatch(/needs 3 code runs/);
    expect(m.state.provider!.execute).not.toHaveBeenCalled();
    expect(m.Submission.create).not.toHaveBeenCalled();
  });

  it('global capacity reached: 503, the user is refunded, nothing runs', async () => {
    m.quota.consumeQuota.mockResolvedValueOnce(3).mockResolvedValueOnce(null);
    const res = await submit(valid);
    expect(res.status).toBe(503);
    expect(m.quota.refundQuota).toHaveBeenCalledWith(`user:${USER}`, '2026-10-21', 3);
    expect(m.state.provider!.execute).not.toHaveBeenCalled();
  });

  it('execution disabled: 503 and the solution is not recorded', async () => {
    m.state.provider = null;
    const res = await submit(valid);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('execution_disabled');
    expect(m.Submission.create).not.toHaveBeenCalled();
  });

  it('a duplicate submission while the first is judging is refused', async () => {
    let release!: () => void;
    let calls = 0;
    m.state.provider = {
      name: 'judge0',
      languages: () => (['c', 'cpp', 'java', 'python'] as const).map(id => ({ id, label: id })),
      execute: vi.fn(() => (calls++ === 0 ? new Promise<ExecutionResult>(r => (release = () => r(ok('3')))) : Promise.resolve(ok(calls === 2 ? '8' : 'HIDDEN_OUT')))),
    };
    const first = submit(valid).then(r => r);
    await vi.waitFor(() => expect(m.state.provider!.execute).toHaveBeenCalledTimes(1));
    const second = await submit(valid);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('execution_in_progress');
    release();
    expect((await first).body.status).toBe('ACCEPTED');
    expect(m.Submission.create).toHaveBeenCalledTimes(1);
  });

  it('submissions share the per-minute limit with Playground runs', async () => {
    for (let i = 0; i < env.EXECUTION_RATE_LIMIT_PER_MINUTE; i++) {
      m.state.provider = provider(ok('', { status: 'compile_error', compileOutput: 'e' }));
      expect((await submit(valid)).status).toBe(201);
    }
    expect((await request(app).post('/api/run').set('Cookie', cookie()).send({ language: 'c', source: 'x', stdin: '' })).status).toBe(429);
  });
});

describe('submit — problems not set up for judging (legacy behaviour kept)', () => {
  it('records the attempt without a verdict and runs nothing', async () => {
    m.Problem.findOne.mockResolvedValue({ problemId: 'legacy', publicationStatus: 'published', testCases: [{ input: 'nums = [1]', expected: '[0]' }] });
    const res = await submit(valid, USER, 'legacy');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'SUBMITTED', judged: false, passed: false });
    expect(m.state.provider!.execute).not.toHaveBeenCalled();
    expect(m.quota.consumeQuota).not.toHaveBeenCalled();
    // an attempt that was recorded is practice activity, as before
    expect(m.ActivityLog.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('submission history', () => {
  const query = (rows: object[]) => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) });

  it("only the signed-in user's own submissions, with judged details and legacy records intact", async () => {
    m.Problem.findOne.mockResolvedValue({ problemId: 'p1' });
    m.Submission.find.mockReturnValue(query([
      { _id: new mongoose.Types.ObjectId(), problemId: 'p1', language: 'cpp', code: 'a', status: 'WRONG_ANSWER', passed: false, runtimeMs: 3, memoryMb: 1, message: 'm', testsPassed: 2, testsTotal: 5, failedTestNumber: 3, failedTestHidden: true, createdAt: new Date() },
      { _id: new mongoose.Types.ObjectId(), problemId: 'p1', language: 'c', code: 'b', status: 'SUBMITTED', passed: false, runtimeMs: 0, memoryMb: 0, message: 'old', createdAt: new Date() },
    ]));
    const res = await request(app).get('/api/problems/p1/submissions').set('Cookie', cookie(OTHER));
    expect(res.status).toBe(200);
    expect(String(m.Submission.find.mock.calls[0][0].userId)).toBe(OTHER);
    expect(res.body.submissions[0]).toMatchObject({ status: 'WRONG_ANSWER', testsPassed: 2, testsTotal: 5, failedTestNumber: 3, failedTestHidden: true });
    expect(res.body.submissions[1]).toMatchObject({ status: 'SUBMITTED', message: 'old' });
    expect(res.body.submissions[1].testsPassed).toBeUndefined();
  });

  it('requires a signed-in user', async () => {
    expect((await request(app).get('/api/problems/p1/submissions')).status).toBe(401);
  });
});
