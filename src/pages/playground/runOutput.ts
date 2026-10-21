import type { RunResult } from '../../api';

export type RunTone = 'success' | 'error' | 'warning';

/** a one-line summary of what the program really did (from the server's result, never assumed) */
export function runHeadline(result: RunResult): { text: string; tone: RunTone } {
  switch (result.status) {
    case 'success':
      return { text: `Finished with exit code ${result.exitCode ?? 0}`, tone: 'success' };
    case 'compile_error':
      return { text: 'Compilation failed', tone: 'error' };
    case 'runtime_error':
      return {
        text: `Runtime error${result.exitCode !== null ? ` (exit code ${result.exitCode})` : ''}${result.exitSignal !== null ? ` (signal ${result.exitSignal})` : ''}`,
        tone: 'error',
      };
    case 'timeout':
      return { text: 'Time limit exceeded: the program was stopped', tone: 'warning' };
  }
}

/** time and memory as reported by the provider; omitted when it did not report them */
export function runMetrics(result: RunResult): string {
  const parts: string[] = [];
  if (result.timeMs !== null) parts.push(`Time: ${result.timeMs} ms`);
  if (result.memoryKb !== null) parts.push(`Memory: ${(result.memoryKb / 1024).toFixed(1)} MB`);
  return parts.join(' · ');
}
