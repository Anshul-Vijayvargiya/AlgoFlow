import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider, GEMINI_API_BASE, GEMINI_MAX_OUTPUT_TOKENS } from '../services/tutor/geminiProvider';
import { TutorProviderError, describeProviderFailure } from '../services/tutor/types';

// The Gemini provider against a scripted fetch: no network, no key, no request ever reaches Google.
const KEY = 'test-key-not-real-0123456789';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const answer = (text: string, finishReason = 'STOP') => json(200, { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }] });

function setup(response: Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
  return { provider: new GeminiProvider({ apiKey: KEY, model: 'gemini-3.5-flash-lite', fetchImpl }), calls };
}
const request = { system: 'You are the AlgoFlow tutor.\nAlgorithm: Bubble Sort', turns: [{ role: 'user' as const, text: 'Why swap?' }] };

describe('Gemini provider — request', () => {
  it('posts to generateContent with the key in the x-goog-api-key header only (never in the URL)', async () => {
    const { provider, calls } = setup(answer('Because they are out of order.'));
    await provider.ask(request);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${GEMINI_API_BASE}/models/gemini-3.5-flash-lite:generateContent`);
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({ 'x-goog-api-key': KEY, 'Content-Type': 'application/json' });
  });

  it('sends the system instruction, the turns and an output limit', async () => {
    const { provider, calls } = setup(answer('ok'));
    await provider.ask({ system: 'SYS', turns: [{ role: 'user', text: 'q1' }, { role: 'model', text: 'a1' }, { role: 'user', text: 'q2' }] });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [
        { role: 'user', parts: [{ text: 'q1' }] },
        { role: 'model', parts: [{ text: 'a1' }] },
        { role: 'user', parts: [{ text: 'q2' }] },
      ],
      generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, temperature: 0.3 },
    });
  });

  it('sets a timeout on the request', async () => {
    const { provider, calls } = setup(answer('ok'));
    await provider.ask(request);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('Gemini provider — answers', () => {
  it('returns the text of the first candidate (all its parts)', async () => {
    const res = json(200, { candidates: [{ content: { parts: [{ text: 'Part one. ' }, { text: 'Part two.' }] }, finishReason: 'STOP' }] });
    expect(await setup(res).provider.ask(request)).toEqual({ text: 'Part one. Part two.', truncated: false });
  });

  it('an answer cut at the length limit is returned and marked truncated', async () => {
    expect(await setup(answer('Half an answer', 'MAX_TOKENS')).provider.ask(request)).toEqual({ text: 'Half an answer', truncated: true });
  });

  it('no text (empty candidates, empty parts, or cut before any text) is an error, never an empty or invented answer', async () => {
    for (const body of [{}, { candidates: [] }, { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }, { candidates: [{ finishReason: 'MAX_TOKENS' }] }]) {
      await expect(setup(json(200, body)).provider.ask(request), JSON.stringify(body)).rejects.toMatchObject({ kind: 'unavailable' });
    }
  });

  it('a blocked prompt or a withheld answer is "blocked"', async () => {
    await expect(setup(json(200, { promptFeedback: { blockReason: 'SAFETY' } })).provider.ask(request)).rejects.toMatchObject({ kind: 'blocked' });
    for (const reason of ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']) {
      await expect(setup(answer('x', reason)).provider.ask(request), reason).rejects.toMatchObject({ kind: 'blocked' });
    }
  });
});

describe('Gemini provider — output limit, thinking and usage', () => {
  const withParts = (parts: unknown[], finishReason = 'STOP', extra: object = {}) =>
    json(200, { candidates: [{ content: { role: 'model', parts }, finishReason }], ...extra });

  it('asks for at most 1024 output tokens (thinking included), with the same temperature', async () => {
    expect(GEMINI_MAX_OUTPUT_TOKENS).toBe(1024);
    const { provider, calls } = setup(answer('ok'));
    await provider.ask(request);
    expect(JSON.parse(String(calls[0].init.body)).generationConfig).toEqual({ maxOutputTokens: 1024, temperature: 0.3 });
  });

  it('parts marked thought: true are left out of the answer; the answer parts stay intact and in order', async () => {
    const res = withParts([
      { text: 'REASONING_TOKEN: first compare the two values', thought: true },
      { text: 'Bubble sort compares neighbours. ' },
      { text: 'MORE_REASONING_TOKEN', thought: true },
      { text: 'It swaps them when they are out of order.', thoughtSignature: 'c2lnbmF0dXJl' },
      { text: ' Not a thought.', thought: false },
    ]);
    const result = await setup(res).provider.ask(request);
    expect(result).toEqual({ text: 'Bubble sort compares neighbours. It swaps them when they are out of order. Not a thought.', truncated: false });
    expect(result.text).not.toContain('REASONING_TOKEN');
  });

  it('only thought parts (no answer text) is an error, never an answer made of reasoning', async () => {
    for (const finish of ['STOP', 'MAX_TOKENS']) {
      const res = withParts([{ text: 'REASONING_TOKEN', thought: true }, { thoughtSignature: 'c2ln' }], finish);
      await expect(setup(res).provider.ask(request), finish).rejects.toMatchObject({ kind: 'unavailable', sent: true });
    }
  });

  it('an answer cut at the limit after thinking keeps its answer text and is marked truncated', async () => {
    const res = withParts([{ text: 'REASONING_TOKEN', thought: true }, { text: 'Bubble sort compares neigh' }], 'MAX_TOKENS');
    expect(await setup(res).provider.ask(request)).toEqual({ text: 'Bubble sort compares neigh', truncated: true });
  });

  it("reports Google's token counts (thinking included) when they are whole numbers", async () => {
    const usageMetadata = { promptTokenCount: 812, candidatesTokenCount: 143, thoughtsTokenCount: 57, totalTokenCount: 1012 };
    const res = withParts([{ text: 'Answer.' }], 'STOP', { usageMetadata });
    expect(await setup(res).provider.ask(request)).toEqual({
      text: 'Answer.',
      truncated: false,
      usage: { promptTokens: 812, answerTokens: 143, thinkingTokens: 57, totalTokens: 1012 },
    });
  });

  it('missing or malformed token counts are left out, never guessed', async () => {
    const partial = withParts([{ text: 'Answer.' }], 'STOP', { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: '5', thoughtsTokenCount: -1, totalTokenCount: 1.5 } });
    expect((await setup(partial).provider.ask(request)).usage).toEqual({ promptTokens: 10 });
    for (const usageMetadata of [undefined, null, 'lots', { promptTokenCount: 'x' }]) {
      const res = withParts([{ text: 'Answer.' }], 'STOP', { usageMetadata });
      expect(await setup(res).provider.ask(request), JSON.stringify(usageMetadata)).not.toHaveProperty('usage');
    }
  });
});

describe('Gemini provider — failures (one attempt, no retries)', () => {
  it.each([
    [429, 'busy'],
    [400, 'misconfigured'],
    [401, 'misconfigured'],
    [403, 'misconfigured'],
    [404, 'misconfigured'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ] as const)('HTTP %i → %s, sent', async (status, kind) => {
    const { provider, calls } = setup(json(status, { error: { message: `bad key ${KEY}` } }));
    await expect(provider.ask(request)).rejects.toMatchObject({ kind, sent: true });
    expect(calls).toHaveLength(1);
  });

  it('network failure → unavailable, not sent; timeout → timeout', async () => {
    await expect(setup(new TypeError('fetch failed')).provider.ask(request)).rejects.toMatchObject({ kind: 'unavailable', sent: false });
    await expect(setup(Object.assign(new Error('t'), { name: 'TimeoutError' })).provider.ask(request)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('an unreadable response is an error', async () => {
    await expect(setup(new Response('<html>', { status: 200 })).provider.ask(request)).rejects.toBeInstanceOf(TutorProviderError);
  });

  it('error messages never contain the key, the question or the provider\'s response body', async () => {
    for (const res of [json(403, { error: { message: `key ${KEY} PROVIDER_BODY_TOKEN` } }), json(500, { detail: 'Why swap? PROVIDER_BODY_TOKEN' })]) {
      const err = (await setup(res).provider.ask(request).then(() => null, (e: Error) => e))!;
      expect(err.message).not.toContain(KEY);
      expect(err.message).not.toContain('Why swap?');
      expect(err.message).not.toContain('PROVIDER_BODY_TOKEN');
    }
  });
});

describe('Gemini provider — rejected requests report safe diagnostics', () => {
  // Google's error format, with the key, the question and free text where a careless parser might pick them up
  const googleError = (code: number, status: unknown, details: unknown) =>
    json(code, { error: { code, message: `API key ${KEY} rejected. Why swap? FREE_TEXT_TOKEN`, status, details } });
  const errorInfo = (reason: unknown) => ({ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com', metadata: { key: KEY, note: 'FREE_TEXT_TOKEN' } });
  const fail = async (res: Response | Error) => (await setup(res).provider.ask(request).then(() => null, (e: unknown) => e)) as TutorProviderError;

  // no failure output may contain these, whatever the response
  function expectSafe(err: TutorProviderError) {
    const shown = JSON.stringify({ message: err.message, diagnostics: err.diagnostics, described: describeProviderFailure(err) });
    // booleans, so a failure here cannot print the values it checks
    expect(shown.includes(KEY), 'the key is never reported').toBe(false);
    expect(shown.includes('FREE_TEXT_TOKEN'), "Google's free-text message is never reported").toBe(false);
    expect(shown.includes('Why swap?'), 'the prompt is never reported').toBe(false);
  }

  it.each([
    [400, 'INVALID_ARGUMENT', 'API_KEY_INVALID'],
    [401, 'UNAUTHENTICATED', 'CREDENTIALS_MISSING'],
    [403, 'PERMISSION_DENIED', 'SERVICE_DISABLED'],
    [404, 'NOT_FOUND', undefined],
  ] as const)('HTTP %i: misconfigured, with the status code %s and reason %s', async (code, status, reason) => {
    const err = await fail(googleError(code, status, reason ? [{ '@type': 'type.googleapis.com/google.rpc.Help' }, errorInfo(reason)] : undefined));
    expect(err).toBeInstanceOf(TutorProviderError);
    expect(err).toMatchObject({ kind: 'misconfigured', sent: true });
    expect(err.diagnostics).toEqual(reason ? { httpStatus: code, status, reason } : { httpStatus: code, status });
    expect(describeProviderFailure(err)).toBe(`misconfigured (HTTP ${code}, ${status}${reason ? `, ${reason}` : ''})`);
    expectSafe(err);
  });

  const malformed: [string, () => Response][] = [
    ['no body', () => new Response(null, { status: 403 })],
    ['an HTML page', () => new Response('<html><body>Forbidden FREE_TEXT_TOKEN</body></html>', { status: 403 })],
    ['JSON null', () => json(403, null)],
    ['an error that is a string', () => json(403, { error: `Forbidden ${KEY} FREE_TEXT_TOKEN` })],
    ['an error with a message only (no codes)', () => json(403, { error: { code: 403, message: 'FREE_TEXT_TOKEN' } })],
    ['a lower-case status', () => googleError(403, 'permission_denied', undefined)],
    ['a status with spaces (free text)', () => googleError(403, 'PERMISSION DENIED FREE_TEXT_TOKEN', undefined)],
    ['a numeric status', () => googleError(403, 403, undefined)],
    ['an over-long status', () => googleError(403, 'A'.repeat(65), undefined)],
    ['the key as the status', () => googleError(403, KEY, undefined)],
    ['details that are not a list', () => googleError(403, undefined, errorInfo('SERVICE_DISABLED'))],
    ['details without a usable reason', () => googleError(403, undefined, [null, 'SERVICE_DISABLED', errorInfo(42), errorInfo('has spaces'), errorInfo(KEY), errorInfo('')])],
  ];

  it.each(malformed)('%s: the HTTP status only, nothing from the body', async (_label, response) => {
    const err = await fail(response());
    expect(err).toMatchObject({ kind: 'misconfigured', sent: true });
    expect(err.diagnostics).toEqual({ httpStatus: 403 });
    expect(describeProviderFailure(err)).toBe('misconfigured (HTTP 403)');
    expectSafe(err);
  });

  it.each([400, 401, 404])('HTTP %i with a missing or malformed code: the HTTP status only', async code => {
    for (const res of [new Response('', { status: code }), json(code, { error: { message: 'FREE_TEXT_TOKEN', status: 'not valid' } })]) {
      const err = await fail(res);
      expect(err.diagnostics).toEqual({ httpStatus: code });
      expectSafe(err);
    }
  });

  it('a valid status with a malformed reason keeps the status only', async () => {
    const err = await fail(googleError(403, 'PERMISSION_DENIED', [errorInfo('bad reason')]));
    expect(err.diagnostics).toEqual({ httpStatus: 403, status: 'PERMISSION_DENIED' });
  });

  it('busy (429) and unavailable (5xx) carry the same diagnostics', async () => {
    const busy = await fail(googleError(429, 'RESOURCE_EXHAUSTED', [errorInfo('RATE_LIMIT_EXCEEDED')]));
    expect(busy).toMatchObject({ kind: 'busy', diagnostics: { httpStatus: 429, status: 'RESOURCE_EXHAUSTED', reason: 'RATE_LIMIT_EXCEEDED' } });
    const down = await fail(new Response('upstream error', { status: 503 }));
    expect(down).toMatchObject({ kind: 'unavailable', diagnostics: { httpStatus: 503 } });
    expectSafe(busy);
    expectSafe(down);
  });

  it('failures before any response (network, timeout) have no diagnostics', async () => {
    const network = await fail(new TypeError('fetch failed'));
    expect(network.diagnostics).toBeUndefined();
    expect(describeProviderFailure(network)).toBe('unavailable');
  });
});
