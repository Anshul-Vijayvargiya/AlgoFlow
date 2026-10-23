import { describe, it, expect, beforeAll } from 'vitest';
import { GeminiProvider, GEMINI_API_BASE, GEMINI_MAX_OUTPUT_TOKENS } from '../services/tutor/geminiProvider';
import { TutorProviderError, describeProviderFailure, type TutorAnswer, type TutorRequest } from '../services/tutor/types';
import { buildTutorContext, tutorSystemInstruction } from '../services/tutor/context';
import { GEMINI_MODEL_PATTERN } from '../config/env';
import { useVisualizerStore } from '../../src/store/useVisualizerStore';

/**
 * OPT-IN: asks the real Gemini API about a visualizer step. Skipped unless GEMINI_LIVE=1, so `npm test` never sends
 * anything to Google.
 *
 *   GEMINI_LIVE=1 GEMINI_LIVE_API_KEY=… GEMINI_LIVE_MODEL=<the model you will set as GEMINI_MODEL> \
 *     npx vitest run server/tests/gemini.live.test.ts
 *
 * Cost: at most 2 generateContent requests (a question, then a follow-up with the first answer as history, as the
 * drawer sends it); a guard refuses any further request. Each counts against the project's daily request limit.
 * Both answers must be complete (not cut at the output limit, which thinking tokens count against too); the token
 * counts Google reports are printed as numbers, e.g. "answer 1: prompt 812, answer 143, thinking 57, total 1012".
 * The key is read from GEMINI_LIVE_API_KEY only (the Vitest setup keeps .env's GEMINI_API_KEY out of test processes)
 * and is never printed. Failure messages are fixed strings, error kinds, the HTTP status and Google's fixed error
 * identifiers (e.g. "misconfigured (HTTP 403, PERMISSION_DENIED, API_KEY_INVALID)"): they never contain the key, the
 * prompt, the model's answer or Google's free-text error message.
 */
const LIVE = process.env.GEMINI_LIVE === '1';
export const LIVE_GEMINI_MAX_REQUESTS = 2;

describe.skipIf(!LIVE)('Gemini (live, opt-in)', () => {
  const apiKey = process.env.GEMINI_LIVE_API_KEY ?? '';
  const model = process.env.GEMINI_LIVE_MODEL ?? '';
  const sent: string[] = [];
  let keyInHeaderOnly = true;

  // the only way out of this test: counts requests, refuses a third, and records where each one went
  const guardedFetch: typeof fetch = async (url, init) => {
    if (sent.length >= LIVE_GEMINI_MAX_REQUESTS) throw new Error(`refused: this test may send at most ${LIVE_GEMINI_MAX_REQUESTS} requests`);
    sent.push(String(url));
    if (String(url).includes(apiKey) || (init?.headers as Record<string, string>)?.['x-goog-api-key'] !== apiKey) keyInHeaderOnly = false;
    return fetch(url, init);
  };
  const provider = new GeminiProvider({ apiKey, model, fetchImpl: guardedFetch });

  // numbers only: never any text of the answer
  const usageLine = (label: string, answer: TutorAnswer | null) => {
    const u = answer?.usage;
    if (!u) return `${label}: no token counts reported`;
    const parts = [['prompt', u.promptTokens], ['answer', u.answerTokens], ['thinking', u.thinkingTokens], ['total', u.totalTokens]];
    return `${label}: ${parts.filter(([, n]) => typeof n === 'number').map(([name, n]) => `${name} ${n}`).join(', ')}`;
  };

  // the provider's error kind and diagnostics only: never its message, the request or a response body
  const attempt = (request: TutorRequest): Promise<{ answer: TutorAnswer | null; failure: string }> =>
    provider.ask(request).then(
      answer => ({ answer, failure: '' }),
      (err: unknown) => ({ answer: null, failure: err instanceof TutorProviderError ? describeProviderFailure(err) : 'an unexpected error' })
    );

  beforeAll(() => {
    if (!apiKey) throw new Error('Set GEMINI_LIVE_API_KEY to run this test.');
    if (!GEMINI_MODEL_PATTERN.test(model)) throw new Error('Set GEMINI_LIVE_MODEL to the model id chosen in AI Studio (e.g. gemini-3.5-flash-lite).');
  });

  it('answers a question about a visualizer step, then a follow-up, using only the configured model', async () => {
    useVisualizerStore.getState().setAlgorithm('bubble-sort');
    const s = useVisualizerStore.getState();
    const built = buildTutorContext({ algorithmId: 'bubble-sort', array: s.array, target: null, index: null, stepIndex: 1, language: 'python' });
    expect(built.ok, 'the server builds the visualizer context').toBe(true);
    const system = tutorSystemInstruction(built.ok ? built.context : '');

    const question = 'Why are these two values compared at this step?';
    const first = await attempt({ system, turns: [{ role: 'user', text: question }] });
    expect(first.failure, 'the first request failed with this kind').toBe('');
    expect(Boolean(first.answer?.text.trim()), 'the first answer has text').toBe(true);

    const second = await attempt({
      system,
      turns: [{ role: 'user', text: question }, { role: 'model', text: first.answer!.text }, { role: 'user', text: 'What happens next?' }],
    });
    expect(second.failure, 'the follow-up request failed with this kind').toBe('');
    expect(Boolean(second.answer?.text.trim()), 'the follow-up answer has text').toBe(true);

    // checked after both requests, so a run reports both answers
    const usage = `${usageLine('answer 1', first.answer)}; ${usageLine('answer 2', second.answer)} (output limit ${GEMINI_MAX_OUTPUT_TOKENS})`;
    console.log(`[gemini live] token counts: ${usage}`);
    expect(first.answer!.truncated, `the first answer was cut at the output limit. ${usage}`).toBe(false);
    expect(second.answer!.truncated, `the follow-up answer was cut at the output limit. ${usage}`).toBe(false);

    expect(sent.length, 'requests sent').toBeLessThanOrEqual(LIVE_GEMINI_MAX_REQUESTS);
    const expected = `${GEMINI_API_BASE}/models/${model}:generateContent`;
    expect(sent.every(url => url === expected), 'every request went to the configured model only').toBe(true);
    expect(keyInHeaderOnly, 'the key was sent in the x-goog-api-key header only, never in the URL').toBe(true);
  }, 60_000);
});
