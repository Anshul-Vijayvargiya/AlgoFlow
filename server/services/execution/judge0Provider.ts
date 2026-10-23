/**
 * Judge0 (hosted via RapidAPI, or self-hosted) behind the ExecutionProvider interface. User code runs only on the
 * provider, never in this process. The flow follows the Judge0 CE API (https://ce.judge0.com):
 *  1. POST /submissions?base64_encoded=true&wait=false → { token }   (the hosted service does not allow wait=true)
 *  2. GET  /submissions/{token}?base64_encoded=true&fields=…         polled until the status is final
 * Status ids: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer, 5 Time Limit Exceeded, 6 Compilation Error,
 * 7–12 Runtime Error (SIGSEGV, SIGXFSZ, SIGFPE, SIGABRT, NZEC, Other), 13 Internal Error, 14 Exec Format Error.
 */
import {
  ExecutionProviderError,
  type ExecutionLanguage,
  type ExecutionProvider,
  type ExecutionRequest,
  type ExecutionResult,
  type LanguageInfo,
} from './types';

/** Judge0 CE's active ids and versions, from its API documentation */
export const JUDGE0_CE_LANGUAGES: Record<ExecutionLanguage, { id: number; label: string }> = {
  c: { id: 50, label: 'C (GCC 9.2.0)' },
  cpp: { id: 54, label: 'C++ (GCC 9.2.0)' },
  java: { id: 62, label: 'Java (OpenJDK 13.0.1)' },
  python: { id: 71, label: 'Python (3.8.1)' },
};

/** limits sent with every submission (Judge0 CE maximums: CPU 15 s, wall 20 s, memory 256 000 KB) */
export const JUDGE0_LIMITS = { cpu_time_limit: 2, wall_time_limit: 5, memory_limit: 128_000 };

export interface Judge0Config {
  apiUrl: string;
  apiKey?: string;
  auth: 'rapidapi' | 'x-auth-token' | 'none';
  languages?: Record<ExecutionLanguage, { id: number; label: string }>;
  /** per HTTP request */
  requestTimeoutMs?: number;
  /** from submission to final result */
  resultDeadlineMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const FIELDS = 'stdout,stderr,compile_output,message,status,exit_code,exit_signal,time,memory';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: unknown) => (typeof s === 'string' && s ? Buffer.from(s, 'base64').toString('utf8') : '');

interface Judge0Submission {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: { id: number; description: string };
  exit_code?: number | null;
  exit_signal?: number | null;
  time?: string | number | null;
  memory?: number | null;
}

/** parses JUDGE0_LANGUAGES (JSON); throws on anything malformed so a bad deployment fails at startup */
export function parseLanguageOverrides(json: string | undefined): Record<ExecutionLanguage, { id: number; label: string }> {
  if (!json) return JUDGE0_CE_LANGUAGES;
  const parsed = JSON.parse(json) as Record<string, { id: unknown; label: unknown }>;
  const out = { ...JUDGE0_CE_LANGUAGES };
  for (const [lang, v] of Object.entries(parsed)) {
    if (!(lang in out) || !Number.isInteger(v?.id) || typeof v?.label !== 'string' || !v.label) {
      throw new Error(`JUDGE0_LANGUAGES: invalid entry for "${lang}".`);
    }
    out[lang as ExecutionLanguage] = { id: v.id as number, label: v.label };
  }
  return out;
}

export class Judge0Provider implements ExecutionProvider {
  readonly name = 'judge0' as const;
  private readonly baseUrl: string;
  private readonly langs: Record<ExecutionLanguage, { id: number; label: string }>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly config: Judge0Config) {
    this.baseUrl = config.apiUrl.replace(/\/+$/, '');
    this.langs = config.languages ?? JUDGE0_CE_LANGUAGES;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleep = config.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    this.now = config.now ?? Date.now;
  }

  languages(): LanguageInfo[] {
    return (Object.keys(this.langs) as ExecutionLanguage[]).map(id => ({ id, label: this.langs[id].label }));
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.config.auth === 'rapidapi') {
      h['X-RapidAPI-Key'] = this.config.apiKey ?? '';
      h['X-RapidAPI-Host'] = new URL(this.baseUrl).host;
    } else if (this.config.auth === 'x-auth-token') {
      h['X-Auth-Token'] = this.config.apiKey ?? '';
    }
    return h;
  }

  /** one HTTP call; every failure becomes an ExecutionProviderError (the key and code are never in its message) */
  private async call(path: string, init: RequestInit, submitted: boolean): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.headers(),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 10_000),
      });
    } catch (err) {
      const timedOut = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
      throw new ExecutionProviderError('unavailable', timedOut ? 'The execution service did not respond in time.' : 'The execution service could not be reached.', submitted);
    }
    if (res.status === 429) throw new ExecutionProviderError('busy', 'The execution service is busy (rate limit or plan quota reached).', submitted);
    if (res.status === 401 || res.status === 403) throw new ExecutionProviderError('misconfigured', `The execution service rejected our credentials (HTTP ${res.status}).`, submitted);
    if (res.status >= 500) throw new ExecutionProviderError('unavailable', `The execution service failed (HTTP ${res.status}).`, submitted);
    if (!res.ok) throw new ExecutionProviderError('misconfigured', `The execution service rejected the request (HTTP ${res.status}).`, submitted);
    try {
      return await res.json();
    } catch {
      throw new ExecutionProviderError('unavailable', 'The execution service returned an unreadable response.', submitted);
    }
  }

  async execute({ language, source, stdin }: ExecutionRequest): Promise<ExecutionResult> {
    const lang = this.langs[language];
    const created = (await this.call(
      '/submissions?base64_encoded=true&wait=false',
      { method: 'POST', body: JSON.stringify({ source_code: b64(source), language_id: lang.id, stdin: b64(stdin), ...JUDGE0_LIMITS }) },
      false
    )) as { token?: unknown };
    if (typeof created?.token !== 'string' || !created.token) {
      throw new ExecutionProviderError('unavailable', 'The execution service did not accept the program.', false);
    }

    const deadline = this.now() + (this.config.resultDeadlineMs ?? 20_000);
    let delay = 300;
    for (;;) {
      await this.sleep(delay);
      const sub = (await this.call(`/submissions/${encodeURIComponent(created.token)}?base64_encoded=true&fields=${FIELDS}`, { method: 'GET' }, true)) as Judge0Submission;
      const id = sub?.status?.id;
      if (id === 1 || id === 2) {
        if (this.now() >= deadline) throw new ExecutionProviderError('timeout', 'The execution service did not finish in time.', true);
        delay = Math.min(delay * 2, 1500);
        continue;
      }
      return this.toResult(sub);
    }
  }

  private toResult(sub: Judge0Submission): ExecutionResult {
    const id = sub.status?.id;
    const timeSec = sub.time === null || sub.time === undefined ? NaN : Number(sub.time);
    const base = {
      stdout: unb64(sub.stdout),
      stderr: unb64(sub.stderr),
      compileOutput: unb64(sub.compile_output),
      exitCode: typeof sub.exit_code === 'number' ? sub.exit_code : null,
      exitSignal: typeof sub.exit_signal === 'number' ? sub.exit_signal : null,
      timeMs: Number.isFinite(timeSec) ? Math.round(timeSec * 1000) : null,
      memoryKb: typeof sub.memory === 'number' ? sub.memory : null,
    };
    if (id === 3 || id === 4) return { ...base, status: 'success' };
    if (id === 5) return { ...base, status: 'timeout' };
    if (id === 6) return { ...base, status: 'compile_error' };
    if (id !== undefined && id >= 7 && id <= 12) {
      // Judge0 puts the signal or NZEC description in `message`; keep it visible when there is no stderr
      return { ...base, status: 'runtime_error', stderr: base.stderr || unb64(sub.message) || sub.status?.description || '' };
    }
    // 13 Internal Error, 14 Exec Format Error or anything unknown: the provider failed, the program did not run
    throw new ExecutionProviderError('unavailable', `The execution service could not run the program (${sub.status?.description ?? 'unknown status'}).`, true);
  }
}
