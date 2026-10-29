import type { ExecutionTrace, HeapObject } from './trace';

/**
 * The full heap at every step of a trace (each step's changes applied to the one before). Kept apart from trace.ts so
 * the Playground's view does not load the validator (and zod) until a trace is requested.
 */
export function heapsByStep(trace: Pick<ExecutionTrace, 'steps'>): Record<string, HeapObject>[] {
  const out: Record<string, HeapObject>[] = [];
  let heap: Record<string, HeapObject> = {};
  for (const step of trace.steps) {
    if (step.heap && Object.keys(step.heap).length > 0) heap = { ...heap, ...step.heap };
    out.push(heap);
  }
  return out;
}
