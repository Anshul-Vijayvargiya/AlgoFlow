import { describe, it, expect } from 'vitest';
import type { ExecutionTrace } from '../../../execution/trace';
import { heapsByStep } from '../../../execution/traceHeap';
import { RECORDED_TRACES } from '../../../execution/recordedTraces.generated';
import { changedNames, frameTitle, isEndPosition, outputAt, positionCount, traceHeadline, truncationNotes, valueText } from '../traceModel';

// The step-by-step view's pure helpers, on the recorded example traces (real tracer output).
const fact = RECORDED_TRACES.factorial;
const sort = RECORDED_TRACES['bubble-sort'];
const list = RECORDED_TRACES['linked-list'];
const read = RECORDED_TRACES['read-and-print'];

describe('positions', () => {
  it('one per step, then the end of the program', () => {
    expect(positionCount(fact)).toBe(fact.steps.length + 1);
    expect(isEndPosition(fact, fact.steps.length - 1)).toBe(false);
    expect(isEndPosition(fact, fact.steps.length)).toBe(true);
  });
});

describe('traceHeadline', () => {
  const t = (patch: Partial<ExecutionTrace>) => traceHeadline({ ...fact, ...patch });
  it('says how the program ended, from the trace', () => {
    expect(traceHeadline(fact)).toEqual({ text: `Finished with exit code 0 · ${fact.steps.length} steps`, tone: 'success' });
    expect(t({ exitCode: 3 })).toMatchObject({ text: expect.stringMatching(/^Finished with exit code 3/), tone: 'warning' });
    expect(traceHeadline(RECORDED_TRACES['runtime-error'])).toEqual({ text: 'Stopped by ZeroDivisionError on line 2 · 11 steps', tone: 'error' });
    expect(t({ status: 'syntax_error', steps: [], error: { type: 'SyntaxError', message: 'x', line: 4 } })).toEqual({ text: 'Syntax error on line 4: nothing ran', tone: 'error' });
    expect(t({ status: 'step_limit' }).text).toMatch(/^Stopped at the step limit/);
    expect(t({ status: 'time_limit' }).text).toMatch(/^Stopped at the time limit/);
    expect(t({ status: 'size_limit' }).text).toMatch(/size limit/);
  });

  it('lists the limits applied, in words', () => {
    expect(truncationNotes(fact)).toEqual([]);
    expect(truncationNotes({ ...fact, truncated: ['items', 'frames'] })).toEqual(['long lists and dicts show their first 100 items', 'deep call stacks show their innermost 32 frames']);
  });
});

describe('values', () => {
  it('lists, tuples, sets, dicts and objects as Python writes them; shared and cyclic references marked', () => {
    const heap = {
      h1: { kind: 'list' as const, type: 'list', length: 3, items: [{ kind: 'int' as const, repr: '1' }, { kind: 'ref' as const, id: 'h2' }] },
      h2: { kind: 'tuple' as const, type: 'tuple', length: 1, items: [{ kind: 'str' as const, repr: "'a'" }] },
      h3: { kind: 'set' as const, type: 'set', length: 0, items: [] },
      h4: { kind: 'dict' as const, type: 'dict', length: 1, entries: [[{ kind: 'str' as const, repr: "'k'" }, { kind: 'ref' as const, id: 'h5' }]] as [never, never][] },
      h5: { kind: 'object' as const, type: 'Node', fields: { next: { kind: 'ref' as const, id: 'h5' } } },
    };
    expect(valueText({ kind: 'ref', id: 'h1' }, heap)).toBe("[1, ('a',), … +1 more]");
    expect(valueText({ kind: 'ref', id: 'h3' }, heap)).toBe('set()');
    expect(valueText({ kind: 'ref', id: 'h4' }, heap)).toBe("{'k': Node(next=↺ Node #5)}");
    expect(valueText({ kind: 'ref', id: 'h9' }, heap)).toBe('<object #9>');
    expect(valueText({ kind: 'other', type: 'range', repr: 'range(0, 3)' }, heap)).toBe('range(0, 3)');
  });

  it('the linked list in the example: three nodes chained by next', () => {
    const heaps = heapsByStep(list);
    const i = list.steps.findIndex(s => s.line === 10);
    expect(valueText(list.steps[i].frames[0].locals.head, heaps[i], 4)).toBe('Node(value=1, next=Node(value=2, next=Node(value=3, next=None)))');
  });
});

describe('changedNames', () => {
  it('marks assigned variables and those whose object changed (a swap inside the list)', () => {
    const heaps = heapsByStep(sort);
    const swap = sort.steps.findIndex((_, i) => i > 0 && sort.steps[i - 1].line === 6);
    const inner = sort.steps[swap].frames.at(-1)!;
    expect(changedNames(sort, heaps, swap).get(inner.id)?.has('arr')).toBe(true);
    // the caller's `numbers` is the same list: it changed too
    expect(changedNames(sort, heaps, swap).get(sort.steps[swap].frames[0].id)?.has('numbers')).toBe(true);
    // a plain step of the loop changes only its loop variable
    const loopStep = sort.steps.findIndex((s, i) => i > 0 && s.line === 5 && sort.steps[i - 1].line === 4);
    expect([...(changedNames(sort, heaps, loopStep).get(inner.id) ?? [])]).toEqual(['j']);
  });

  it('every variable of the first step is new', () => {
    const heaps = heapsByStep(fact);
    const first = fact.steps.findIndex(s => Object.keys(s.frames.at(-1)!.locals).length > 0);
    expect(changedNames(fact, heaps, first).size).toBeGreaterThan(0);
  });
});

describe('outputAt', () => {
  it('the output written before each step, the newest part marked, and everything at the end', () => {
    const withOutput = read.steps.findIndex(s => s.stdoutLength > 0);
    expect(outputAt(read, 0)).toEqual({ text: '', fresh: 0 });
    expect(outputAt(read, withOutput)).toEqual({ text: 'Element [0] = 8\n', fresh: 'Element [0] = 8\n'.length });
    // the end shows all of it; what it marks as new is whatever the last step had not yet seen
    const end = outputAt(read, read.steps.length);
    expect(end.text).toBe(read.stdout);
    expect(end.fresh).toBe(read.stdout.length - read.steps.at(-1)!.stdoutLength);
    // the factorial prints on its last line, after its last step: only the end shows it
    expect(outputAt(fact, fact.steps.length - 1).text).toBe('');
    expect(outputAt(fact, fact.steps.length)).toEqual({ text: '4! = 24\n', fresh: '4! = 24\n'.length });
  });

  it('frame titles', () => {
    expect(frameTitle('<module>')).toBe('Global frame');
    expect(frameTitle('factorial')).toBe('factorial()');
  });
});
