import type { ExecutionTrace, HeapObject, TraceStep, TraceValue } from '../../execution/trace';

/**
 * Pure helpers for the Playground's step-by-step view. Playback positions are 0 … steps.length: one per recorded
 * step, then a final position for the program's end (output written by the last line, the exit code or error), which
 * no step shows.
 */

export const positionCount = (trace: Pick<ExecutionTrace, 'steps'>) => trace.steps.length + 1;
export const isEndPosition = (trace: Pick<ExecutionTrace, 'steps'>, position: number) => position >= trace.steps.length;

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

/** what happened to the program, in one line (from the trace, never assumed) */
export function traceHeadline(trace: ExecutionTrace): { text: string; tone: 'success' | 'error' | 'warning' } {
  const steps = plural(trace.steps.length, 'step');
  const at = trace.error?.line ? ` on line ${trace.error.line}` : '';
  switch (trace.status) {
    case 'completed':
      return { text: `Finished with exit code ${trace.exitCode ?? 0} · ${steps}`, tone: trace.exitCode ? 'warning' : 'success' };
    case 'exception':
      return { text: `Stopped by ${trace.error?.type ?? 'an exception'}${at} · ${steps}`, tone: 'error' };
    case 'syntax_error':
      return { text: `Syntax error${at}: nothing ran`, tone: 'error' };
    case 'step_limit':
      return { text: `Stopped at the step limit (${steps}): the program was ended there`, tone: 'warning' };
    case 'time_limit':
      return { text: `Stopped at the time limit after ${steps}`, tone: 'warning' };
    case 'size_limit':
      return { text: `Stopped when the trace reached its size limit after ${steps}`, tone: 'warning' };
  }
}

const TRUNCATION_TEXT: Record<ExecutionTrace['truncated'][number], string> = {
  stdout: 'output was cut short',
  stderr: 'error output was cut short',
  items: 'long lists and dicts show their first 100 items',
  names: 'frames and objects show their first 40 names',
  frames: 'deep call stacks show their innermost 32 frames',
  heap: 'objects past the first 500 are not shown in detail',
  values: 'long values are shortened',
};
export const truncationNotes = (trace: ExecutionTrace) => trace.truncated.map(t => TRUNCATION_TEXT[t]);

export const EVENT_TEXT: Record<TraceStep['event'], string> = {
  line: 'next line to run',
  call: 'function called',
  return: 'returning',
  exception: 'exception raised',
};

/** a frame's name for people: the module level is the global frame */
export const frameTitle = (name: string) => (name === '<module>' ? 'Global frame' : `${name}()`);

/** the object ids a value refers to, following references up to `depth` objects deep */
function refsReachable(v: TraceValue | undefined, heap: Record<string, HeapObject>, depth: number, out: Set<string>) {
  if (!v || v.kind !== 'ref' || out.has(v.id)) return;
  out.add(v.id);
  const o = heap[v.id];
  if (!o || depth <= 0) return;
  const next = (x: TraceValue) => refsReachable(x, heap, depth - 1, out);
  if (o.kind === 'dict') {
    for (const [k, x] of o.entries) {
      next(k);
      next(x);
    }
  }
  else if (o.kind === 'object') Object.values(o.fields).forEach(next);
  else o.items.forEach(next);
}

/**
 * The variables that changed at `index` (frame id → names): a new or different value than at the step before in the
 * same frame, or an object it refers to (up to three levels deep) that changed at this step.
 */
export function changedNames(trace: ExecutionTrace, heaps: Record<string, HeapObject>[], index: number): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const step = trace.steps[index];
  if (!step) return out;
  const before = index > 0 ? trace.steps[index - 1] : null;
  const changedObjects = new Set(Object.keys(step.heap ?? {}));
  for (const frame of step.frames) {
    const previous = before?.frames.find(f => f.id === frame.id);
    const names = new Set<string>();
    for (const [name, value] of Object.entries(frame.locals)) {
      const old = previous?.locals[name];
      if (!old || JSON.stringify(old) !== JSON.stringify(value)) {
        names.add(name);
        continue;
      }
      const reachable = new Set<string>();
      refsReachable(value, heaps[index], 3, reachable);
      if ([...reachable].some(id => changedObjects.has(id))) names.add(name);
    }
    if (names.size) out.set(frame.id, names);
  }
  return out;
}

/** a plain-text rendering of a value (for labels, titles and tests), bounded in depth */
export function valueText(v: TraceValue, heap: Record<string, HeapObject>, depth = 2, seen: ReadonlySet<string> = new Set()): string {
  if (v.kind === 'ref') {
    const o = heap[v.id];
    if (!o) return `<object #${v.id.slice(1)}>`;
    if (seen.has(v.id)) return `↺ ${o.type} #${v.id.slice(1)}`;
    if (depth < 0) return `${o.type} #${v.id.slice(1)}`;
    const inner = new Set(seen).add(v.id);
    const show = (x: TraceValue) => valueText(x, heap, depth - 1, inner);
    if (o.kind === 'dict') {
      const more = o.length - o.entries.length;
      return `{${o.entries.map(([k, x]) => `${show(k)}: ${show(x)}`).join(', ')}${more > 0 ? `, … +${more} more` : ''}}`;
    }
    if (o.kind === 'object') return `${o.type}(${Object.entries(o.fields).map(([k, x]) => `${k}=${show(x)}`).join(', ')})`;
    const more = o.length - o.items.length;
    const body = `${o.items.map(show).join(', ')}${more > 0 ? `, … +${more} more` : ''}`;
    if (o.kind === 'tuple') return `(${body}${o.items.length === 1 && more <= 0 ? ',' : ''})`;
    if (o.kind === 'set') return o.length === 0 ? 'set()' : `{${body}}`;
    return `[${body}]`;
  }
  if (v.kind === 'other') return v.repr;
  return v.repr;
}

/** the stdout written up to a position (all of it at the end) and the part written at that very step */
export function outputAt(trace: ExecutionTrace, position: number): { text: string; fresh: number } {
  if (isEndPosition(trace, position)) {
    const last = trace.steps[trace.steps.length - 1]?.stdoutLength ?? 0;
    return { text: trace.stdout, fresh: trace.stdout.length - last };
  }
  const step = trace.steps[position];
  const previous = position > 0 ? trace.steps[position - 1].stdoutLength : 0;
  return { text: trace.stdout.slice(0, step.stdoutLength), fresh: step.stdoutLength - previous };
}
