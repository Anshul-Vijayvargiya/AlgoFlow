/** One turn of the conversation as sent to the model (the browser holds the history; nothing is stored). */
export interface TutorTurn {
  role: 'user' | 'model';
  text: string;
}

export interface TutorRequest {
  /** the system instruction, including the algorithm context the server built */
  system: string;
  /** earlier turns, then the new question as the last user turn */
  turns: TutorTurn[];
}

export interface TutorAnswer {
  text: string;
  /** the model stopped at the answer length limit */
  truncated: boolean;
  /** token counts the provider reported, when it did (for diagnostics only; never sent to the browser) */
  usage?: TutorUsage;
}

/** the provider's token counts for one answer: numbers only */
export interface TutorUsage {
  promptTokens?: number;
  /** tokens of the answer itself */
  answerTokens?: number;
  /** tokens the model spent thinking; they count against the output limit too */
  thinkingTokens?: number;
  totalTokens?: number;
}

export interface TutorProvider {
  readonly name: 'gemini' | 'fake';
  readonly model: string;
  /** asks the model; throws TutorProviderError when there is no genuine answer */
  ask(request: TutorRequest): Promise<TutorAnswer>;
}

/**
 * The provider produced no answer. `sent` tells whether the request reached the provider (and so may count against
 * its limits), which decides whether the user's allowance is given back.
 *  - unavailable: network failure, 5xx, or an empty answer
 *  - busy: the provider's rate limit or free quota was hit (429)
 *  - misconfigured: the provider rejected our key, model or request (400/401/403/404)
 *  - timeout: no answer in time
 *  - blocked: the provider declined the question or its answer (safety)
 */
export class TutorProviderError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'busy' | 'misconfigured' | 'timeout' | 'blocked',
    message: string,
    readonly sent: boolean,
    readonly diagnostics?: TutorProviderDiagnostics
  ) {
    super(message);
    this.name = 'TutorProviderError';
  }
}

/**
 * Why the provider rejected a request, safe to print: the HTTP status and the provider's fixed error identifiers
 * (e.g. PERMISSION_DENIED, API_KEY_INVALID). Never its free-text message or any other part of its response.
 */
export interface TutorProviderDiagnostics {
  httpStatus: number;
  /** the error's status, e.g. INVALID_ARGUMENT */
  status?: string;
  /** the error's reason, e.g. API_KEY_INVALID */
  reason?: string;
}

/** "misconfigured (HTTP 403, PERMISSION_DENIED, API_KEY_INVALID)": the kind and diagnostics only */
export function describeProviderFailure(err: TutorProviderError): string {
  const d = err.diagnostics;
  if (!d) return err.kind;
  return `${err.kind} (${[`HTTP ${d.httpStatus}`, d.status, d.reason].filter(Boolean).join(', ')})`;
}
