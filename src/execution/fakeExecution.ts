/**
 * A deterministic stand-in for a code-execution service, for automated tests only (EXECUTION_PROVIDER=fake on the
 * server, and the front end's mock API). It never runs the code. What it returns is driven by directives in the
 * source, so tests can produce every outcome on purpose:
 *
 *   FAKE:COMPILE_ERROR   → compilation error
 *   FAKE:RUNTIME_ERROR   → runtime error (exit code 1)
 *   FAKE:TIMEOUT         → time limit exceeded
 *   FAKE:UNAVAILABLE     → the service is unavailable (the caller must report an error, never a result)
 *   FAKE:PRINT <text>    → prints <text> and a newline (repeatable, in order)
 *
 * Without PRINT lines it echoes stdin, so a program that reads input and prints it behaves plausibly. Every result
 * says it came from the fake provider (`fake: true`); the server and UI show that.
 */

export type ExecutionLanguage = 'c' | 'cpp' | 'java' | 'python';
export type ExecutionStatus = 'success' | 'compile_error' | 'runtime_error' | 'timeout';

export interface FakeExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  exitSignal: number | null;
  timeMs: number | null;
  memoryKb: number | null;
}

export class FakeProviderUnavailableError extends Error {
  constructor() {
    super('The fake execution provider was asked to be unavailable (FAKE:UNAVAILABLE).');
    this.name = 'FakeProviderUnavailableError';
  }
}

export const FAKE_LANGUAGE_LABELS: Record<ExecutionLanguage, string> = {
  c: 'C (fake provider)',
  cpp: 'C++ (fake provider)',
  java: 'Java (fake provider)',
  python: 'Python (fake provider)',
};

export function fakeExecute(source: string, stdin: string): FakeExecutionResult {
  const base = { stderr: '', compileOutput: '', exitSignal: null, timeMs: 1, memoryKb: 1024 };
  if (source.includes('FAKE:UNAVAILABLE')) throw new FakeProviderUnavailableError();
  if (source.includes('FAKE:COMPILE_ERROR')) {
    return { ...base, status: 'compile_error', stdout: '', compileOutput: 'main: error: FAKE:COMPILE_ERROR requested', exitCode: null, timeMs: null, memoryKb: null };
  }
  if (source.includes('FAKE:TIMEOUT')) return { ...base, status: 'timeout', stdout: '', exitCode: null, timeMs: 2000 };
  if (source.includes('FAKE:RUNTIME_ERROR')) return { ...base, status: 'runtime_error', stdout: '', stderr: 'FAKE:RUNTIME_ERROR requested', exitCode: 1 };
  const printed = [...source.matchAll(/FAKE:PRINT ([^\r\n]*)/g)].map(m => `${m[1]}\n`);
  return { ...base, status: 'success', stdout: printed.length ? printed.join('') : stdin, exitCode: 0 };
}
