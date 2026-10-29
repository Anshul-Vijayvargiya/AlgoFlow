import { RECORDED_TRACES } from './recordedTraces.generated';
import { findTraceSample, type TraceSample } from './traceSamples';
import type { ExecutionTrace } from './trace';

/**
 * Test mode only (the fake provider and the mock API, which never run code): the recorded trace of an example
 * program, when the program and its input are exactly an example's. Anything else has no trace in test mode.
 */
export function recordedTraceFor(source: string, stdin: string): { sample: TraceSample; trace: ExecutionTrace } | undefined {
  const sample = findTraceSample(source, stdin);
  const trace = sample && RECORDED_TRACES[sample.id];
  return sample && trace ? { sample, trace } : undefined;
}

export const NOT_RECORDED_MESSAGE =
  'Test mode: this server does not run code, so only the example programs, with their example input, can be visualized.';
