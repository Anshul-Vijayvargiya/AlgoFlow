import type { ExecutionLanguage, ExecutionStatus } from '../../../src/execution/fakeExecution';

export type { ExecutionLanguage, ExecutionStatus };
export const EXECUTION_LANGUAGES: readonly ExecutionLanguage[] = ['c', 'cpp', 'java', 'python'];

export interface ExecutionRequest {
  language: ExecutionLanguage;
  source: string;
  stdin: string;
}

/** what the program actually did, as reported by the provider (never invented) */
export interface ExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  exitSignal: number | null;
  timeMs: number | null;
  memoryKb: number | null;
}

export interface LanguageInfo {
  id: ExecutionLanguage;
  label: string;
}

export interface ExecutionProvider {
  readonly name: 'judge0' | 'fake';
  languages(): LanguageInfo[];
  /** runs the program; throws ExecutionProviderError when there is no genuine result */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}

/**
 * The provider could not produce a result. `submitted` tells whether the provider accepted the program (and so may
 * have counted it against the plan), which decides whether the user's quota is refunded.
 *  - unavailable: network failure, 5xx, or the provider's own internal error
 *  - busy: the provider rate-limited us or our plan's quota is used up (429)
 *  - misconfigured: the provider rejected our credentials or request (401/403/4xx)
 *  - timeout: no final result within the polling deadline
 */
export class ExecutionProviderError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'busy' | 'misconfigured' | 'timeout',
    message: string,
    readonly submitted: boolean
  ) {
    super(message);
    this.name = 'ExecutionProviderError';
  }
}
