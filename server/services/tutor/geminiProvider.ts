/**
 * Google Gemini behind the TutorProvider interface, with plain fetch (no SDK). Server-side only: the key is sent in
 * the x-goog-api-key header — never in the URL — and never appears in an error message or a log line.
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   { systemInstruction, contents[{ role, parts[{ text }] }], generationConfig { maxOutputTokens, temperature } }
 *   → candidates[0].content.parts[].text (parts marked thought: true are left out), candidates[0].finishReason,
 *     promptFeedback.blockReason, usageMetadata (token counts)
 *
 * One attempt per question (no automatic retries: each attempt counts against the free daily limit).
 */
import { TutorProviderError, type TutorAnswer, type TutorProvider, type TutorProviderDiagnostics, type TutorRequest, type TutorUsage } from './types';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * Answers are short explanations (the system instruction asks for about 200 words); this bounds the work done per
 * question. It covers thinking too: models that think by default (gemini-3.5-flash-lite, at a minimal level) spend
 * part of it before answering, so it leaves room above the answer itself.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 1024;
export const GEMINI_TIMEOUT_MS = 20_000;

/** finish reasons that mean the model withheld (part of) the answer for policy reasons */
const DECLINED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** a fixed error identifier such as PERMISSION_DENIED; free text, lower case (an API key) or anything longer is dropped */
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const errorCode = (v: unknown) => (typeof v === 'string' && ERROR_CODE.test(v) ? v : undefined);

/**
 * The HTTP status and, when the body is Google's error format { error: { status, details: [{ reason }] } }, its
 * status and reason identifiers. Nothing else is kept from the body (never error.message). A missing, unreadable or
 * unexpected body leaves the HTTP status only.
 */
async function readDiagnostics(res: Response): Promise<TutorProviderDiagnostics> {
  const diagnostics: TutorProviderDiagnostics = { httpStatus: res.status };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return diagnostics;
  }
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  if (!error || typeof error !== 'object') return diagnostics;
  const { status, details } = error as { status?: unknown; details?: unknown };
  const reason = Array.isArray(details)
    ? details.map(d => (d && typeof d === 'object' ? errorCode((d as { reason?: unknown }).reason) : undefined)).find(Boolean)
    : undefined;
  if (errorCode(status)) diagnostics.status = errorCode(status);
  if (reason) diagnostics.reason = reason;
  return diagnostics;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: Record<string, unknown>;
}

/** Google's token counts, kept only when they are whole non-negative numbers */
function readUsage(metadata: unknown): TutorUsage | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const m = metadata as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined);
  const usage: TutorUsage = {
    promptTokens: count(m.promptTokenCount),
    answerTokens: count(m.candidatesTokenCount),
    thinkingTokens: count(m.thoughtsTokenCount),
    totalTokens: count(m.totalTokenCount),
  };
  for (const key of Object.keys(usage) as (keyof TutorUsage)[]) if (usage[key] === undefined) delete usage[key];
  return Object.keys(usage).length ? usage : undefined;
}

export class GeminiProvider implements TutorProvider {
  readonly name = 'gemini' as const;
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: GeminiConfig) {
    this.model = config.model;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async ask({ system, turns }: TutorRequest): Promise<TutorAnswer> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${GEMINI_API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
          generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? GEMINI_TIMEOUT_MS),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new TutorProviderError('timeout', 'The AI service did not answer in time.', true);
      throw new TutorProviderError('unavailable', 'The AI service could not be reached.', false);
    }

    if (!res.ok) {
      const diagnostics = await readDiagnostics(res);
      if (res.status === 429) throw new TutorProviderError('busy', 'The AI service is busy or its daily free limit is used up (HTTP 429).', true, diagnostics);
      if ([400, 401, 403, 404].includes(res.status)) throw new TutorProviderError('misconfigured', `The AI service rejected the request (HTTP ${res.status}).`, true, diagnostics);
      throw new TutorProviderError('unavailable', `The AI service failed (HTTP ${res.status}).`, true, diagnostics);
    }

    let body: GeminiResponse;
    try {
      body = (await res.json()) as GeminiResponse;
    } catch {
      throw new TutorProviderError('unavailable', 'The AI service returned an unreadable response.', true);
    }

    if (body.promptFeedback?.blockReason) throw new TutorProviderError('blocked', 'The AI service declined the question.', true);
    const candidate = body.candidates?.[0];
    const finish = candidate?.finishReason ?? '';
    if (DECLINED_FINISH_REASONS.has(finish)) throw new TutorProviderError('blocked', 'The AI service declined to answer.', true);
    // the model's own reasoning (parts marked thought: true) is never part of the student's answer
    const text = (candidate?.content?.parts ?? [])
      .map(p => (p && p.thought !== true && typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
    if (!text) throw new TutorProviderError('unavailable', 'The AI service returned no answer.', true);
    const usage = readUsage(body.usageMetadata);
    return { text, truncated: finish === 'MAX_TOKENS', ...(usage && { usage }) };
  }
}
