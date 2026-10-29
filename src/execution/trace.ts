import { z } from 'zod';

/**
 * The execution trace of one Playground program: what a real run did, step by step (the line about to run, the call
 * stack with each frame's variables, the objects they refer to, and the output so far). Shared by the server, which
 * validates every trace before returning it, and the Playground, which only displays traces that pass the same
 * checks. A trace is never invented: `provenance` says whether it comes from a run of the submitted program
 * ('runtime') or is a recorded sample trace shown in test mode ('fixture').
 *
 * Values are encoded, never raw runtime objects: primitives as their repr, collections and objects as references
 * into a heap. The heap is sent as changes — each step lists only the objects created or changed since the step
 * before — so a step's full heap is the accumulation of every change up to it (heapsByStep, traceHeap.ts). Every size is
 * bounded (TRACE_LIMITS); whatever did not fit is reported in `truncated`, never silently dropped.
 */

export const TRACE_LIMITS = {
  /** steps recorded; a program still running then is stopped ('step_limit') */
  maxSteps: 1500,
  /** frames kept per step (the innermost ones; `framesOmitted` counts the rest) */
  maxFrames: 32,
  /** variables per frame, and fields per object */
  maxNames: 40,
  /** items per list, tuple, set or dict */
  maxItems: 100,
  /** distinct objects in the whole trace */
  maxHeapObjects: 500,
  /** characters of a value's repr (strings are cut, with their real length kept) */
  maxReprChars: 200,
  maxNameChars: 100,
  maxTypeChars: 100,
  /** captured stdout / stderr characters */
  maxOutputChars: 64_000,
  maxMessageChars: 2_000,
  /** the serialized trace; the tracer stops ('size_limit') before exceeding it */
  maxTraceChars: 900_000,
} as const;

const name = z.string().min(1).max(TRACE_LIMITS.maxNameChars);
const typeName = z.string().min(1).max(TRACE_LIMITS.maxTypeChars);
const repr = z.string().max(TRACE_LIMITS.maxReprChars + 1); // + the '…' a cut repr ends with
const heapId = z.string().regex(/^h[0-9]{1,6}$/);
const count = z.number().int().min(0);
const lineNo = z.number().int().min(1);

const PrimitiveValue = z
  .object({
    kind: z.enum(['int', 'float', 'bool', 'str', 'none']),
    repr,
    /** a string's real length, when its repr was cut */
    length: count.optional(),
  })
  .strict();
const RefValue = z.object({ kind: z.literal('ref'), id: heapId }).strict();
/** anything not traced in detail (a function, a range, an object past the heap limit…): its type and a short text */
const OtherValue = z.object({ kind: z.literal('other'), type: typeName, repr }).strict();
export const TraceValueSchema = z.union([PrimitiveValue, RefValue, OtherValue]);
export type TraceValue = z.infer<typeof TraceValueSchema>;

const boundedRecord = <T extends z.ZodType>(value: T, max: number) =>
  z.record(name, value).refine(r => Object.keys(r).length <= max, { message: `more than ${max} names` });

const Sequence = z
  .object({
    kind: z.enum(['list', 'tuple', 'set']),
    type: typeName,
    /** the real length; `items` holds at most maxItems of them */
    length: count,
    items: z.array(TraceValueSchema).max(TRACE_LIMITS.maxItems),
  })
  .strict();
const Dict = z
  .object({
    kind: z.literal('dict'),
    type: typeName,
    length: count,
    entries: z.array(z.tuple([TraceValueSchema, TraceValueSchema])).max(TRACE_LIMITS.maxItems),
  })
  .strict();
const Instance = z
  .object({ kind: z.literal('object'), type: typeName, fields: boundedRecord(TraceValueSchema, TRACE_LIMITS.maxNames) })
  .strict();
export const HeapObjectSchema = z.union([Sequence, Dict, Instance]);
export type HeapObject = z.infer<typeof HeapObjectSchema>;

const Frame = z
  .object({
    /** stable for the frame's lifetime, so a view can follow one call across steps */
    id: z.string().regex(/^f[0-9]{1,7}$/),
    name,
    line: lineNo,
    locals: boundedRecord(TraceValueSchema, TRACE_LIMITS.maxNames),
  })
  .strict();
export type TraceFrame = z.infer<typeof Frame>;

const ExceptionInfo = z
  .object({ type: typeName, message: z.string().max(TRACE_LIMITS.maxMessageChars) })
  .strict();

const Step = z
  .object({
    index: count,
    /** the line about to run ('line'), being entered ('call'), returning ('return') or raising ('exception') */
    line: lineNo,
    event: z.enum(['line', 'call', 'return', 'exception']),
    /** outermost first; the last frame is the one executing */
    frames: z.array(Frame).min(1).max(TRACE_LIMITS.maxFrames),
    framesOmitted: count.optional(),
    /** objects created or changed since the previous step */
    heap: boundedRecord(HeapObjectSchema, TRACE_LIMITS.maxHeapObjects).optional(),
    /** stdout written before this step: stdout.slice(0, stdoutLength) */
    stdoutLength: count,
    /** characters of stdin read before this step */
    stdinConsumed: count,
    returnValue: TraceValueSchema.optional(),
    exception: ExceptionInfo.optional(),
  })
  .strict();
export type TraceStep = z.infer<typeof Step>;

export const TRACE_STATUSES = ['completed', 'exception', 'syntax_error', 'step_limit', 'time_limit', 'size_limit'] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

export const ExecutionTraceSchema = z
  .object({
    version: z.literal(1),
    language: z.literal('python'),
    provenance: z.enum(['runtime', 'fixture']),
    /** the interpreter that produced it, e.g. "Python 3.8.1" */
    runtime: z.string().min(1).max(60),
    status: z.enum(TRACE_STATUSES),
    /** the program's exit code when it finished (0, or what it passed to sys.exit) */
    exitCode: z.number().int().nullable(),
    error: ExceptionInfo.extend({ line: lineNo.nullable() }).strict().nullable(),
    steps: z.array(Step).max(TRACE_LIMITS.maxSteps),
    stdout: z.string().max(TRACE_LIMITS.maxOutputChars),
    stderr: z.string().max(TRACE_LIMITS.maxOutputChars),
    truncated: z.array(z.enum(['stdout', 'stderr', 'items', 'names', 'frames', 'heap', 'values'])).max(7),
  })
  .strict();
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

export type TraceValidation = { ok: true; trace: ExecutionTrace } | { ok: false; reason: string };

const refsIn = (v: TraceValue | undefined, out: string[]) => {
  if (v?.kind === 'ref') out.push(v.id);
};
function refsOfObject(o: HeapObject, out: string[]) {
  if (o.kind === 'dict') {
    for (const [k, v] of o.entries) {
      refsIn(k, out);
      refsIn(v, out);
    }
  }
  else if (o.kind === 'object') for (const v of Object.values(o.fields)) refsIn(v, out);
  else for (const v of o.items) refsIn(v, out);
}

/**
 * Parses and checks a trace: the schema (types, sizes) and what the schema cannot express — steps numbered in order,
 * every line inside the program, the executing frame on the step's line, every reference to an object already sent,
 * output and input only ever growing and within what was produced or given.
 */
export function validateTrace(raw: unknown, context: { source: string; stdin: string }): TraceValidation {
  const parsed = ExecutionTraceSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `schema: ${issue.path.join('.') || '(root)'}: ${issue.message}` };
  }
  const trace = parsed.data;
  const lineCount = Math.max(1, context.source.split('\n').length);
  const inProgram = (line: number) => line >= 1 && line <= lineCount;

  if (trace.status === 'syntax_error' && (trace.steps.length > 0 || !trace.error)) return { ok: false, reason: 'a syntax error has no steps and names the error' };
  if (trace.status === 'exception' && !trace.error) return { ok: false, reason: 'an exception names the error' };
  if (trace.error?.line != null && !inProgram(trace.error.line)) return { ok: false, reason: 'error line outside the program' };

  const known = new Set<string>();
  let heapSize = 0;
  let stdout = 0;
  let stdin = 0;
  for (const [i, step] of trace.steps.entries()) {
    if (step.index !== i) return { ok: false, reason: `step ${i}: index ${step.index}` };
    if (!inProgram(step.line)) return { ok: false, reason: `step ${i}: line ${step.line} outside the program` };
    if (step.frames.some(f => !inProgram(f.line))) return { ok: false, reason: `step ${i}: frame line outside the program` };
    if (step.frames[step.frames.length - 1].line !== step.line) return { ok: false, reason: `step ${i}: the executing frame is not on the step's line` };
    if (step.stdoutLength < stdout || step.stdoutLength > trace.stdout.length) return { ok: false, reason: `step ${i}: stdout length` };
    if (step.stdinConsumed < stdin || step.stdinConsumed > context.stdin.length) return { ok: false, reason: `step ${i}: stdin consumed` };
    stdout = step.stdoutLength;
    stdin = step.stdinConsumed;

    const changed = Object.keys(step.heap ?? {});
    if (changed.some(id => !/^h[0-9]{1,6}$/.test(id))) return { ok: false, reason: `step ${i}: malformed object id` };
    for (const id of changed) {
      if (known.has(id)) continue;
      known.add(id);
      heapSize++;
    }
    if (heapSize > TRACE_LIMITS.maxHeapObjects) return { ok: false, reason: 'too many objects' };
    const refs: string[] = [];
    for (const o of Object.values(step.heap ?? {})) refsOfObject(o, refs);
    for (const f of step.frames) for (const v of Object.values(f.locals)) refsIn(v, refs);
    refsIn(step.returnValue, refs);
    const missing = refs.find(id => !known.has(id));
    if (missing) return { ok: false, reason: `step ${i}: reference to unknown object ${missing}` };
  }
  return { ok: true, trace };
}
