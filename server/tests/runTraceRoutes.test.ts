import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenFor } from './helpers/sessionStub';
import { _resetRateLimitsForTesting } from '../middleware/rateLimiter';
import { ExecutionProviderError, type ExecutionProvider, type ExecutionRequest, type ExecutionResult } from '../services/execution/types';
import { TRACE_STDERR_MAX_CHARS } from '../routes/runRoutes';
import { RECORDED_TRACES } from '../../src/execution/recordedTraces.generated';
import { TRACE_SAMPLES } from '../../src/execution/traceSamples';
import { NOT_RECORDED_MESSAGE } from '../../src/execution/recordedTraces';
import { TRACE_LIMITS } from '../../src/execution/trace';

// POST /api/run/trace and the tracing capability of GET /api/run/languages, with a scripted provider and quota store.
// The provider here never runs anything: it answers as a real one would, using the nonce the route put in the program.
const { state, quota } = vi.hoisted(() => ({
  state: { provider: null as ExecutionProvider | null },
  quota: { consumeQuota: vi.fn(), refundQuota: vi.fn(), quotaUsed: vi.fn(), utcDay: () => '2026-10-27' },
}));
vi.mock('../services/execution', () => ({ getExecutionProvider: () => state.provider }));
vi.mock('../services/execution/quota', () => quota);
vi.mock('../services/sessionService', () => import('./helpers/sessionStub'));

const USER = '507f1f77bcf86cd799439011';
const cookie = (id = USER) => [`algoflow_token=${tokenFor(id, 'USER')}`];
const post = (body: unknown, id = USER) => request(app).post('/api/run/trace').set('Cookie', cookie(id)).send(body as object);

const sample = TRACE_SAMPLES.find(s => s.id === 'factorial')!;
const valid = { language: 'python', source: sample.source, stdin: sample.stdin };
/** the recorded factorial trace as a real run would report it */
const runtimeTrace = { ...RECORDED_TRACES.factorial, provenance: 'runtime' as const, runtime: 'Python 3.8.1' };

const nonceOf = (program: string) => /NONCE = "([0-9a-f]{32})"/.exec(program)![1];
const result = (patch: Partial<ExecutionResult>): ExecutionResult => ({ status: 'success', stdout: '', stderr: '', compileOutput: '', exitCode: 0, exitSignal: null, timeMs: 40, memoryKb: 9000, ...patch });
const wrapped = (nonce: string, json: string) => `\nAFTRACE-${nonce}-BEGIN\n${json}\nAFTRACE-${nonce}-END\n`;

function judge0(answer: (req: ExecutionRequest, nonce: string) => ExecutionResult | Promise<ExecutionResult>): ExecutionProvider {
  return {
    name: 'judge0',
    languages: () => [{ id: 'python', label: 'Python (3.8.1)' }, { id: 'cpp', label: 'C++ (GCC 9.2.0)' }, { id: 'c', label: 'C (GCC 9.2.0)' }, { id: 'java', label: 'Java (OpenJDK 13.0.1)' }],
    execute: vi.fn(async (req: ExecutionRequest) => answer(req, nonceOf(req.source))),
  };
}
const fake = (): ExecutionProvider => ({ name: 'fake', languages: () => [{ id: 'python', label: 'Python (fake provider)' }], execute: vi.fn() });

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitsForTesting();
  state.provider = judge0((_req, nonce) => result({ stdout: wrapped(nonce, JSON.stringify(runtimeTrace)) }));
  quota.consumeQuota.mockResolvedValue(4);
  quota.refundQuota.mockResolvedValue(undefined);
  quota.quotaUsed.mockResolvedValue(4);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

describe('POST /api/run/trace — access and validation', () => {
  it('requires a signed-in user', async () => {
    expect((await request(app).post('/api/run/trace').send(valid)).status).toBe(401);
    expect(state.provider!.execute).not.toHaveBeenCalled();
  });

  it('Python only: other languages are refused before anything runs or is counted', async () => {
    for (const language of ['cpp', 'c', 'java']) {
      const res = await post({ ...valid, language });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Step-by-step tracing is available for Python only.', code: 'trace_unsupported_language' });
    }
    expect((await post({ ...valid, language: 'ruby' })).status).toBe(400);
    expect((await post({ ...valid, extra: 1 })).status).toBe(400);
    expect((await post({ ...valid, source: '' })).status).toBe(400);
    expect(quota.consumeQuota).not.toHaveBeenCalled();
    expect(state.provider!.execute).not.toHaveBeenCalled();
  });

  it('disabled (no provider): 503, nothing runs or is counted', async () => {
    state.provider = null;
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('execution_disabled');
    expect(quota.consumeQuota).not.toHaveBeenCalled();
  });
});

describe('POST /api/run/trace — a real provider', () => {
  it('sends the tracer (as Python, with the program and stdin) and returns the verified trace, charged as one run', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'traced', message: null, provider: 'judge0', usedToday: 4, language: { id: 'python', label: 'Python (3.8.1)' }, timeMs: 40 });
    expect(res.body.trace).toEqual(runtimeTrace);
    const sent = vi.mocked(state.provider!.execute).mock.calls[0][0];
    expect(sent.language).toBe('python');
    expect(sent.stdin).toBe(valid.stdin);
    expect(sent.source).toContain(Buffer.from(valid.source).toString('base64'));
    expect(sent.source).toContain('sys.settrace');
    expect(quota.consumeQuota).toHaveBeenCalledTimes(2); // the user's and the global allowance
  });

  it('a fresh nonce per run; output with another nonce (a forged trace) is not a trace', async () => {
    const nonces: string[] = [];
    state.provider = judge0((_req, nonce) => {
      nonces.push(nonce);
      return result({ stdout: wrapped('0'.repeat(32), JSON.stringify(runtimeTrace)) });
    });
    const res = await post(valid);
    await post(valid);
    expect(res.body).toMatchObject({ status: 'no_trace', trace: null });
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it('a trace that fails verification is not shown, and the log names only the failed check', async () => {
    const forged = { ...runtimeTrace, steps: runtimeTrace.steps.map(s => ({ ...s, line: 99, frames: s.frames.map(f => ({ ...f, line: 99 })) })) };
    state.provider = judge0((_req, nonce) => result({ stdout: wrapped(nonce, JSON.stringify(forged)) }));
    const res = await post(valid);
    expect(res.body).toMatchObject({ status: 'invalid_trace', trace: null, message: expect.stringMatching(/could not be verified/) });
    const logged = errorLog.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(logged).toMatch(/\[trace\] rejected: step 0: line 99 outside the program/);
    expect(logged).not.toContain('factorial');
  });

  it("a trace claiming to be a recorded fixture, or not JSON, is not shown", async () => {
    state.provider = judge0((_req, nonce) => result({ stdout: wrapped(nonce, JSON.stringify(RECORDED_TRACES.factorial)) }));
    expect((await post(valid)).body.status).toBe('invalid_trace');
    state.provider = judge0((_req, nonce) => result({ stdout: wrapped(nonce, '{not json') }));
    expect((await post(valid)).body.status).toBe('invalid_trace');
  });

  it('cut-off output, no tracer output, and the time limit: no trace, and the reason', async () => {
    state.provider = judge0((_req, nonce) => result({ stdout: `\nAFTRACE-${nonce}-BEGIN\n{"version":1,"steps":[` }));
    expect((await post(valid)).body).toMatchObject({ status: 'no_trace', message: expect.stringMatching(/output limit/) });

    state.provider = judge0(() => result({ status: 'runtime_error', stderr: 'MemoryError\n' + 'x'.repeat(5000), exitCode: 1 }));
    const missing = await post(valid);
    expect(missing.body).toMatchObject({ status: 'no_trace', message: expect.stringMatching(/without the tracer reporting/) });
    expect(missing.body.stderr.length).toBe(TRACE_STDERR_MAX_CHARS);
    expect(missing.body.stderr).toMatch(/^MemoryError/);

    state.provider = judge0(() => result({ status: 'timeout', exitCode: null }));
    expect((await post(valid)).body).toMatchObject({ status: 'timeout', trace: null, message: expect.stringMatching(/time limit/) });
  });

  it('a provider failure before the program was accepted: an error, and the allowance refunded', async () => {
    state.provider = judge0(() => {
      throw new ExecutionProviderError('unavailable', 'down', false);
    });
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('provider_unavailable');
    expect(quota.refundQuota).toHaveBeenCalledTimes(2);
  });

  it('one execution at a time per user: a second trace (or run) while one is running is refused', async () => {
    let release!: () => void;
    state.provider = judge0(async (_req, nonce) => {
      await new Promise<void>(r => (release = r));
      return result({ stdout: wrapped(nonce, JSON.stringify(runtimeTrace)) });
    });
    const first = post(valid).then(r => r);
    await vi.waitFor(() => expect(state.provider!.execute).toHaveBeenCalled());
    const second = await post(valid);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('execution_in_progress');
    const run = await request(app).post('/api/run').set('Cookie', cookie()).send({ language: 'python', source: 'print(1)', stdin: '' });
    expect(run.status).toBe(429);
    release();
    expect((await first).body.status).toBe('traced');
  });
});

describe('POST /api/run/trace — the fake provider (test mode)', () => {
  beforeEach(() => {
    state.provider = fake();
  });

  it('an example program with its input: its recorded trace, labelled fixture; nothing runs or is charged', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'traced', provider: 'fake', trace: { provenance: 'fixture' } });
    expect(res.body.trace).toEqual(RECORDED_TRACES.factorial);
    expect(state.provider!.execute).not.toHaveBeenCalled();
    expect(quota.consumeQuota).not.toHaveBeenCalled();
  });

  it('any other program (or other input): refused with the test-mode explanation, never a made-up trace', async () => {
    for (const body of [{ ...valid, source: 'print(42)\n' }, { ...valid, stdin: '5' }]) {
      const res = await post(body);
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ error: NOT_RECORDED_MESSAGE, code: 'trace_not_recorded' });
    }
  });
});

describe('GET /api/run/languages — tracing', () => {
  const get = () => request(app).get('/api/run/languages').set('Cookie', cookie());
  it('a real provider traces Python for real; the fake one has recorded traces only; none without a provider', async () => {
    expect((await get()).body.tracing).toEqual({ languages: ['python'], mode: 'runtime', maxSteps: TRACE_LIMITS.maxSteps });
    state.provider = fake();
    expect((await get()).body.tracing).toEqual({ languages: ['python'], mode: 'recorded', maxSteps: TRACE_LIMITS.maxSteps });
    state.provider = null;
    expect((await get()).body.tracing).toBeNull();
  });
});

describe('a provider offering only Python (EXECUTION_PROVIDER=local)', () => {
  const local = (): ExecutionProvider => ({
    name: 'local',
    languages: () => [{ id: 'python', label: 'Python 3.13.9 (local)' }],
    execute: vi.fn(async (req: ExecutionRequest) => result({ stdout: wrapped(nonceOf(req.source), JSON.stringify(runtimeTrace)) })),
  });

  it('other languages are refused before anything is charged or run', async () => {
    state.provider = local();
    for (const language of ['cpp', 'c', 'java']) {
      const run = await request(app).post('/api/run').set('Cookie', cookie()).send({ language, source: 'x', stdin: '' });
      expect(run.status, language).toBe(400);
      expect(run.body.code, language).toBe('language_unavailable');
    }
    expect(quota.consumeQuota).not.toHaveBeenCalled();
    expect(state.provider.execute).not.toHaveBeenCalled();
  });

  it('Python traces are real runs (runtime mode), charged like any run', async () => {
    state.provider = local();
    const languages = await request(app).get('/api/run/languages').set('Cookie', cookie());
    expect(languages.body).toMatchObject({ available: true, provider: 'local', languages: [{ id: 'python' }] });
    expect(languages.body.tracing).toEqual({ languages: ['python'], mode: 'runtime', maxSteps: TRACE_LIMITS.maxSteps });
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'traced', provider: 'local', trace: { provenance: 'runtime' } });
    expect(quota.consumeQuota).toHaveBeenCalled();
  });
});
