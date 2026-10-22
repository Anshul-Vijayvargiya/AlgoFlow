import { describe, it, expect, vi } from 'vitest';
import { Judge0Provider, JUDGE0_CE_LANGUAGES, JUDGE0_LIMITS, parseLanguageOverrides } from '../services/execution/judge0Provider';
import { ExecutionProviderError } from '../services/execution/types';

// The provider against a scripted fetch: no network, no key, no charges.
const b64 = (s: string) => Buffer.from(s).toString('base64');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const KEY = 'secret-key-123';

function setup(responses: Array<Response | Error>, options: { deadlineMs?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let clock = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const provider = new Judge0Provider({
    apiUrl: 'https://judge0-ce.p.rapidapi.com/',
    apiKey: KEY,
    auth: 'rapidapi',
    fetchImpl,
    sleep: async ms => void (clock += ms),
    now: () => clock,
    resultDeadlineMs: options.deadlineMs,
  });
  return { provider, calls };
}

const done = (status: { id: number; description: string }, extra: Record<string, unknown> = {}) =>
  json(200, { status, stdout: null, stderr: null, compile_output: null, message: null, exit_code: null, exit_signal: null, time: null, memory: null, ...extra });
const run = (provider: Judge0Provider, source = 'int main(){}', stdin = '') => provider.execute({ language: 'cpp', source, stdin });

describe('Judge0 provider — request', () => {
  it('submits base64 source and stdin with the language id and limits (no wait), with the key only in headers', async () => {
    const { provider, calls } = setup([json(201, { token: 'tok-1' }), done({ id: 3, description: 'Accepted' }, { stdout: b64('hi\n'), exit_code: 0 })]);
    await run(provider, 'int main(){ puts("hi"); }', '1 2');
    const [submit, poll] = calls;
    expect(submit.url).toBe('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=false');
    expect(submit.init.method).toBe('POST');
    expect(JSON.parse(String(submit.init.body))).toEqual({
      source_code: b64('int main(){ puts("hi"); }'),
      language_id: JUDGE0_CE_LANGUAGES.cpp.id,
      stdin: b64('1 2'),
      ...JUDGE0_LIMITS,
    });
    expect(submit.init.headers).toMatchObject({ 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com' });
    expect(poll.url).toMatch(/^https:\/\/judge0-ce\.p\.rapidapi\.com\/submissions\/tok-1\?base64_encoded=true&fields=/);
    expect(submit.url + poll.url).not.toContain(KEY);
  });

  it('x-auth-token and no-auth modes send the matching header only', async () => {
    for (const auth of ['x-auth-token', 'none'] as const) {
      const calls: RequestInit[] = [];
      const p = new Judge0Provider({
        apiUrl: 'http://127.0.0.1:2358',
        apiKey: KEY,
        auth,
        sleep: async () => {},
        fetchImpl: (async (_u: unknown, init: RequestInit) => {
          calls.push(init);
          return calls.length === 1 ? json(201, { token: 't' }) : done({ id: 3, description: 'Accepted' });
        }) as unknown as typeof fetch,
      });
      await p.execute({ language: 'python', source: 'print(1)', stdin: '' });
      const headers = calls[0].headers as Record<string, string>;
      expect(headers['X-RapidAPI-Key']).toBeUndefined();
      expect(headers['X-Auth-Token']).toBe(auth === 'x-auth-token' ? KEY : undefined);
    }
  });
});

describe('Judge0 provider — results (decoded, never invented)', () => {
  it('polls while queued or processing, then returns real stdout, exit code, time and memory', async () => {
    const { provider, calls } = setup([
      json(201, { token: 't' }),
      done({ id: 1, description: 'In Queue' }),
      done({ id: 2, description: 'Processing' }),
      done({ id: 3, description: 'Accepted' }, { stdout: b64('Element [0] = 8\n'), exit_code: 0, time: '0.012', memory: 3456 }),
    ]);
    const r = await run(provider);
    expect(calls).toHaveLength(4);
    expect(r).toEqual({ status: 'success', stdout: 'Element [0] = 8\n', stderr: '', compileOutput: '', exitCode: 0, exitSignal: null, timeMs: 12, memoryKb: 3456 });
  });

  it('compilation error: the compiler output, no run', async () => {
    const { provider } = setup([json(201, { token: 't' }), done({ id: 6, description: 'Compilation Error' }, { compile_output: b64("main.cpp:1: error: expected ';'") })]);
    expect(await run(provider)).toMatchObject({ status: 'compile_error', compileOutput: "main.cpp:1: error: expected ';'", stdout: '' });
  });

  it('runtime errors (7–12): stderr, exit code and signal; the provider message when there is no stderr', async () => {
    for (const id of [7, 8, 9, 10, 11, 12]) {
      const { provider } = setup([json(201, { token: 't' }), done({ id, description: 'Runtime Error' }, { message: b64('Exited with error status 1'), exit_code: 1, exit_signal: id === 7 ? 11 : null })]);
      const r = await run(provider);
      expect(r.status, String(id)).toBe('runtime_error');
      expect(r.stderr).toBe('Exited with error status 1');
      expect(r.exitCode).toBe(1);
    }
  });

  it('time limit exceeded', async () => {
    const { provider } = setup([json(201, { token: 't' }), done({ id: 5, description: 'Time Limit Exceeded' }, { time: '2.001' })]);
    expect(await run(provider)).toMatchObject({ status: 'timeout', timeMs: 2001 });
  });

  it("the provider's own failures (13 Internal Error, 14 Exec Format Error, unknown) are errors, not results", async () => {
    for (const id of [13, 14, 99]) {
      const { provider } = setup([json(201, { token: 't' }), done({ id, description: 'Internal Error' })]);
      await expect(run(provider)).rejects.toMatchObject({ kind: 'unavailable', submitted: true });
    }
  });
});

describe('Judge0 provider — failures', () => {
  it('network failure before submission: unavailable, not submitted (the caller refunds the quota)', async () => {
    const { provider } = setup([new TypeError('fetch failed')]);
    await expect(run(provider)).rejects.toMatchObject({ kind: 'unavailable', submitted: false });
  });

  it('HTTP 429 → busy; 401/403 → misconfigured; 5xx → unavailable; other 4xx → misconfigured', async () => {
    for (const [status, kind] of [[429, 'busy'], [401, 'misconfigured'], [403, 'misconfigured'], [500, 'unavailable'], [503, 'unavailable'], [422, 'misconfigured']] as const) {
      const { provider } = setup([json(status, { error: 'x' })]);
      await expect(run(provider), String(status)).rejects.toMatchObject({ kind, submitted: false });
    }
  });

  it('a failure while polling is reported as submitted (the provider may have counted it)', async () => {
    const { provider } = setup([json(201, { token: 't' }), json(502, {})]);
    await expect(run(provider)).rejects.toMatchObject({ kind: 'unavailable', submitted: true });
  });

  it('no token, or an unreadable response, is a failure', async () => {
    const a = setup([json(201, {})]);
    await expect(run(a.provider)).rejects.toBeInstanceOf(ExecutionProviderError);
    const b = setup([new Response('<html>', { status: 200 })]);
    await expect(run(b.provider)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('still queued at the deadline: timeout, with no fabricated result', async () => {
    const queued = Array.from({ length: 30 }, () => done({ id: 1, description: 'In Queue' }));
    const { provider } = setup([json(201, { token: 't' }), ...queued], { deadlineMs: 3000 });
    await expect(run(provider)).rejects.toMatchObject({ kind: 'timeout', submitted: true });
  });

  it('error messages never contain the key or the program', async () => {
    const { provider } = setup([json(401, { message: `bad key ${KEY}` })]);
    const err = (await run(provider, 'SECRET_PROGRAM_TEXT').then(() => null, (e: Error) => e))!;
    expect(err).toBeInstanceOf(ExecutionProviderError);
    expect(err.message).not.toContain(KEY);
    expect(err.message).not.toContain('SECRET_PROGRAM_TEXT');
  });
});

describe('language configuration', () => {
  it('defaults to the Judge0 CE ids and versions; overrides must be complete and valid', () => {
    expect(parseLanguageOverrides(undefined)).toEqual(JUDGE0_CE_LANGUAGES);
    expect(parseLanguageOverrides('{"python":{"id":92,"label":"Python (3.11.2)"}}').python).toEqual({ id: 92, label: 'Python (3.11.2)' });
    expect(() => parseLanguageOverrides('{"ruby":{"id":72,"label":"Ruby"}}')).toThrow(/ruby/);
    expect(() => parseLanguageOverrides('{"cpp":{"id":"54"}}')).toThrow();
    expect(() => parseLanguageOverrides('not json')).toThrow();
  });
});
