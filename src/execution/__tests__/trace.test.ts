import { describe, it, expect } from 'vitest';
import { TRACE_LIMITS, validateTrace, type ExecutionTrace } from '../trace';
import { heapsByStep } from '../traceHeap';
import { RECORDED_TRACES } from '../recordedTraces.generated';
import { NOT_RECORDED_MESSAGE, recordedTraceFor } from '../recordedTraces';
import { TRACE_SAMPLES, findTraceSample } from '../traceSamples';

// The trace contract's checks (shared by the server and the Playground) and the recorded example traces.
const source = 'a = [1]\na.append(2)\nprint(a)\n';
const base = (): ExecutionTrace => ({
  version: 1,
  language: 'python',
  provenance: 'runtime',
  runtime: 'Python 3.8.1',
  status: 'completed',
  exitCode: 0,
  error: null,
  stdout: '[1, 2]\n',
  stderr: '',
  truncated: [],
  steps: [
    { index: 0, line: 1, event: 'line', frames: [{ id: 'f1', name: '<module>', line: 1, locals: {} }], stdoutLength: 0, stdinConsumed: 0 },
    {
      index: 1, line: 2, event: 'line', stdoutLength: 0, stdinConsumed: 0,
      frames: [{ id: 'f1', name: '<module>', line: 2, locals: { a: { kind: 'ref', id: 'h1' } } }],
      heap: { h1: { kind: 'list', type: 'list', length: 1, items: [{ kind: 'int', repr: '1' }] } },
    },
    {
      index: 2, line: 3, event: 'line', stdoutLength: 0, stdinConsumed: 0,
      frames: [{ id: 'f1', name: '<module>', line: 3, locals: { a: { kind: 'ref', id: 'h1' } } }],
      heap: { h1: { kind: 'list', type: 'list', length: 2, items: [{ kind: 'int', repr: '1' }, { kind: 'int', repr: '2' }] } },
    },
  ],
});
const check = (t: unknown, ctx = { source, stdin: '' }) => validateTrace(t, ctx);
const reason = (t: unknown, ctx?: { source: string; stdin: string }) => {
  const r = check(t, ctx);
  return r.ok ? 'ok' : r.reason;
};

describe('validateTrace', () => {
  it('accepts a well-formed trace', () => {
    expect(check(base())).toEqual({ ok: true, trace: base() });
  });

  it('rejects anything outside the schema: unknown keys, wrong kinds, raw values, oversized parts', () => {
    const cases: [string, (t: ExecutionTrace & Record<string, unknown>) => void][] = [
      ['extra top-level key', t => (t.secret = 'x')],
      ['raw value instead of an encoded one', t => ((t.steps[1].frames[0].locals as Record<string, unknown>).a = [1, 2])],
      ['unknown value kind', t => ((t.steps[1].frames[0].locals as Record<string, unknown>).a = { kind: 'function', repr: 'f' })],
      ['extra key in a value', t => ((t.steps[0].frames[0].locals as Record<string, unknown>).x = { kind: 'int', repr: '1', evil: true })],
      ['unknown status', t => ((t as Record<string, unknown>).status = 'hacked')],
      ['ai provenance', t => ((t as Record<string, unknown>).provenance = 'ai')],
      ['a repr too long', t => ((t.steps[0].frames[0].locals as Record<string, unknown>).s = { kind: 'str', repr: 'x'.repeat(TRACE_LIMITS.maxReprChars + 2) })],
      ['too much output', t => (t.stdout = 'x'.repeat(TRACE_LIMITS.maxOutputChars + 1))],
      ['a step without frames', t => (t.steps[0].frames = [])],
      ['too many items', t => ((t.steps[1].heap!.h1 as { items: unknown[] }).items = Array.from({ length: TRACE_LIMITS.maxItems + 1 }, () => ({ kind: 'int', repr: '0' })))],
      ['too many steps', t => (t.steps = Array.from({ length: TRACE_LIMITS.maxSteps + 1 }, (_, i) => ({ ...t.steps[0], index: i })))],
    ];
    for (const [name, mutate] of cases) {
      const t = base() as ExecutionTrace & Record<string, unknown>;
      mutate(t);
      expect(reason(t), name).toMatch(/^schema:/);
    }
    expect(reason(null)).toMatch(/^schema:/);
    expect(reason('{"version":1}')).toMatch(/^schema:/);
  });

  it('rejects inconsistent traces: step order, lines outside the program, the executing frame elsewhere, unknown objects', () => {
    const t1 = base();
    t1.steps[1].index = 5;
    expect(reason(t1)).toBe('step 1: index 5');
    const t2 = base();
    t2.steps[2].line = 9;
    t2.steps[2].frames[0].line = 9;
    expect(reason(t2)).toBe('step 2: line 9 outside the program');
    const t3 = base();
    t3.steps[2].frames[0].line = 1;
    expect(reason(t3)).toBe("step 2: the executing frame is not on the step's line");
    const t4 = base();
    delete t4.steps[1].heap;
    expect(reason(t4)).toBe('step 1: reference to unknown object h1');
    const t5 = base();
    t5.steps[1].heap = { x9: t5.steps[1].heap!.h1 };
    expect(reason(t5)).toMatch(/malformed object id|schema/);
  });

  it('rejects output or input that shrinks or goes beyond what was produced or given', () => {
    const t1 = base();
    t1.steps[2].stdoutLength = 99;
    expect(reason(t1)).toBe('step 2: stdout length');
    const t2 = base();
    t2.steps[1].stdoutLength = 3;
    expect(reason(t2)).toBe('step 2: stdout length');
    const t3 = base();
    t3.steps[2].stdinConsumed = 1;
    expect(reason(t3)).toBe('step 2: stdin consumed');
    expect(reason(t3, { source, stdin: 'x' })).toBe('ok');
  });

  it('a syntax error has no steps and names the error; an exception names it too', () => {
    const t1 = base();
    t1.status = 'syntax_error';
    expect(reason(t1)).toBe('a syntax error has no steps and names the error');
    t1.steps = [];
    t1.error = { type: 'SyntaxError', message: 'invalid syntax', line: 2 };
    expect(reason(t1)).toBe('ok');
    t1.error.line = 40;
    expect(reason(t1)).toBe('error line outside the program');
    const t2 = base();
    t2.status = 'exception';
    expect(reason(t2)).toBe('an exception names the error');
  });

  it('heapsByStep: each step carries every object sent so far, with its latest version', () => {
    const heaps = heapsByStep(base());
    expect(heaps[0]).toEqual({});
    expect(heaps[1].h1).toMatchObject({ length: 1 });
    expect(heaps[2].h1).toMatchObject({ length: 2 });
  });
});

describe('recorded example traces (test mode)', () => {
  it('there is one for every example, recorded by the real tracer, marked fixture, and each passes validation', () => {
    expect(Object.keys(RECORDED_TRACES).sort()).toEqual(TRACE_SAMPLES.map(s => s.id).sort());
    for (const sample of TRACE_SAMPLES) {
      const trace = RECORDED_TRACES[sample.id];
      expect(trace.provenance, sample.id).toBe('fixture');
      expect(trace.runtime, sample.id).toMatch(/^Python 3\./);
      expect(validateTrace(trace, sample).ok, sample.id).toBe(true);
    }
  });

  it('they show what each example really does', () => {
    expect(RECORDED_TRACES['read-and-print'].stdout).toBe('Element [0] = 8\nElement [1] = 3\nElement [2] = 5\nElement [3] = 1\n');
    expect(RECORDED_TRACES.factorial.stdout).toBe('4! = 24\n');
    expect(RECORDED_TRACES['bubble-sort'].stdout).toBe('[1, 2, 4, 5]\n');
    expect(RECORDED_TRACES['linked-list'].stdout).toBe('sum: 6\n');
    expect(RECORDED_TRACES['runtime-error']).toMatchObject({ status: 'exception', error: { type: 'ZeroDivisionError', line: 2 } });
  });

  it('a recorded trace is found only for exactly an example and its input (line endings and trailing space aside)', () => {
    const s = TRACE_SAMPLES[0];
    expect(recordedTraceFor(s.source.replace(/\n/g, '\r\n') + '\n\n', s.stdin + ' ')?.sample.id).toBe(s.id);
    expect(recordedTraceFor(s.source + 'print(1)\n', s.stdin)).toBeUndefined();
    expect(recordedTraceFor(s.source, '9, 9')).toBeUndefined();
    expect(findTraceSample('print(1)', '')).toBeUndefined();
    expect(NOT_RECORDED_MESSAGE).toMatch(/^Test mode:/);
  });
});
