import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildPythonTraceProgram, extractTrace, PYTHON_TRACER, TRACER_LIMITS } from '../services/execution/tracing/pythonTracer';
import { TRACE_LIMITS, validateTrace, type ExecutionTrace, type TraceValue } from '../../src/execution/trace';
import { heapsByStep } from '../../src/execution/traceHeap';
import { valueText } from '../../src/pages/playground/traceModel';

/**
 * The Python tracer, run for real with the local Python on programs written for these tests (the server itself never
 * runs it: it is sent to the execution provider). Skipped where no Python 3 is installed.
 */
const PYTHON = process.env.PYTHON ?? 'python';
const hasPython = (() => {
  const r = spawnSync(PYTHON, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '3';
})();

/** runs the tracer on a program; returns the provider's raw stdout and the nonce */
function runRaw(source: string, stdin = '') {
  const dir = mkdtempSync(join(tmpdir(), 'algoflow-tracer-test-'));
  try {
    const nonce = randomBytes(16).toString('hex');
    const file = join(dir, 'tracer.py');
    writeFileSync(file, buildPythonTraceProgram(source, nonce));
    const stdout = execFileSync(PYTHON, ['-I', file], { input: stdin, encoding: 'utf8', timeout: 30_000 });
    return { stdout, nonce };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** runs and validates: the trace exactly as the server would accept it */
function trace(source: string, stdin = ''): ExecutionTrace {
  const { stdout, nonce } = runRaw(source, stdin);
  const found = extractTrace(stdout, nonce);
  if (found.kind !== 'found') throw new Error(`no trace: ${found.kind}`);
  const checked = validateTrace(JSON.parse(found.json), { source, stdin });
  if (!checked.ok) throw new Error(checked.reason);
  return checked.trace;
}

const lines = (t: ExecutionTrace) => t.steps.map(s => `${s.event[0]}${s.line}`);
/** a variable's value as text at a step (innermost frame first, then outer ones) */
const varAt = (t: ExecutionTrace, index: number, name: string) => {
  const heap = heapsByStep(t)[index];
  const frames = [...t.steps[index].frames].reverse();
  const v = frames.map(f => f.locals[name]).find(Boolean) as TraceValue | undefined;
  return v ? valueText(v, heap) : undefined;
};
const lastWith = (t: ExecutionTrace, name: string) => {
  for (let i = t.steps.length - 1; i >= 0; i--) if (t.steps[i].frames.some(f => name in f.locals)) return varAt(t, i, name);
  return undefined;
};

describe('building the program', () => {
  it('embeds the source and limits as base64 and refuses a malformed nonce', () => {
    const program = buildPythonTraceProgram('print("""${x}`""")', 'a'.repeat(32));
    expect(program).toContain(Buffer.from('print("""${x}`""")').toString('base64'));
    expect(program).toContain(Buffer.from(JSON.stringify(TRACER_LIMITS)).toString('base64'));
    expect(program).not.toMatch(/__NONCE__|__SOURCE__|__LIMITS__/);
    expect(() => buildPythonTraceProgram('x = 1', 'not-hex')).toThrow();
    expect(PYTHON_TRACER).not.toContain('`');
  });

  it("finds only this run's markers; another nonce, a missing end or no marker is not a trace", () => {
    const n = 'b'.repeat(32);
    expect(extractTrace(`noise\nAFTRACE-${n}-BEGIN\n{"a":1}\nAFTRACE-${n}-END\n`, n)).toEqual({ kind: 'found', json: '{"a":1}' });
    expect(extractTrace(`AFTRACE-${'c'.repeat(32)}-BEGIN\n{}\nAFTRACE-${'c'.repeat(32)}-END\n`, n)).toEqual({ kind: 'missing' });
    expect(extractTrace(`AFTRACE-${n}-BEGIN\n{"a":`, n)).toEqual({ kind: 'incomplete' });
  });
});

describe.skipIf(!hasPython)('the Python tracer (real runs)', () => {
  it('records each line before it runs, loops and branches in order, and the exit code', () => {
    const t = trace('x = 0\nfor i in range(3):\n    if i % 2 == 0:\n        x += i\nprint(x)\n');
    expect(t.status).toBe('completed');
    expect(t.exitCode).toBe(0);
    expect(lines(t)).toEqual(['l1', 'l2', 'l3', 'l4', 'l2', 'l3', 'l2', 'l3', 'l4', 'l2', 'l5']);
    expect(varAt(t, 1, 'x')).toBe('0');
    expect(lastWith(t, 'x')).toBe('2');
    expect(t.stdout).toBe('2\n');
    expect(t.provenance).toBe('runtime');
    expect(t.runtime).toMatch(/^Python 3\.\d+\.\d+$/);
  });

  it('calls, returns and recursion: one frame per call, arguments, return values and the stack unwinding', () => {
    const t = trace('def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nr = fact(3)\n');
    const calls = t.steps.filter(s => s.event === 'call');
    expect(calls.map(s => s.frames.length)).toEqual([2, 3, 4]);
    expect(calls.map(s => s.frames.at(-1)!.locals.n)).toEqual([1, 2, 3].reverse().map(n => ({ kind: 'int', repr: String(n) })));
    const returns = t.steps.filter(s => s.event === 'return');
    expect(returns.map(s => s.returnValue)).toEqual(['1', '2', '6'].map(repr => ({ kind: 'int', repr })));
    expect(new Set(calls.map(s => s.frames.at(-1)!.id)).size).toBe(3);
    expect(t.steps[0].frames.map(f => f.name)).toEqual(['<module>']);
    expect(lastWith(t, 'r')).toBeUndefined(); // r is set by the module's last line, after the last step
  });

  it('values: ints (huge ones summarized), floats, bools, None, strings (long ones cut, with their length)', () => {
    // ints up to 190 bits (57 digits) are exact; beyond, their size is given instead
    const t = trace('a = 7\nb = 2.5\nc = True\nd = None\ne = "hi"\nf = "z" * 500\ng = 10 ** 50\nh = 2 ** 1000\nend = 1\n');
    const last = t.steps.at(-1)!.frames[0].locals;
    expect(last.a).toEqual({ kind: 'int', repr: '7' });
    expect(last.b).toEqual({ kind: 'float', repr: '2.5' });
    expect(last.c).toEqual({ kind: 'bool', repr: 'True' });
    expect(last.d).toEqual({ kind: 'none', repr: 'None' });
    expect(last.e).toEqual({ kind: 'str', repr: "'hi'" });
    expect(last.f).toMatchObject({ kind: 'str', length: 500 });
    expect((last.f as { repr: string }).repr.length).toBe(TRACE_LIMITS.maxReprChars + 1);
    expect(last.g).toEqual({ kind: 'int', repr: '1' + '0'.repeat(50) });
    expect(last.h).toEqual({ kind: 'int', repr: '<int of about 302 digits>' });
    expect(t.truncated).toContain('values');
  });

  it('collections and objects by reference: shared references keep one id, cycles terminate, changes are sent once', () => {
    const source = [
      'class Node:',
      '    def __init__(self, v):',
      '        self.v = v',
      '        self.next = None',
      'a = [1, 2]',
      'b = a',
      'd = {"k": (1, "x"), 2: {3}}',
      'n = Node(1)',
      'n.next = n',
      'a.append(3)',
      'end = 0',
    ].join('\n');
    const t = trace(source);
    const last = t.steps.at(-1)!.frames[0].locals;
    expect(last.a).toEqual(last.b);
    const heap = heapsByStep(t).at(-1)!;
    expect(valueText(last.a, heap)).toBe('[1, 2, 3]');
    expect(valueText(last.d, heap)).toBe("{'k': (1, 'x'), 2: {3}}");
    expect(valueText(last.n, heap)).toMatch(/^Node\(v=1, next=↺ Node #\d+\)$/);
    // the list was sent when created and again only when it changed (append)
    const listId = (last.a as { id: string }).id;
    const sends = t.steps.filter(s => s.heap && listId in s.heap).map(s => s.line);
    expect(sends).toEqual([6, 11]);
  });

  it('functions, classes and modules are not shown as variables; dunder names are hidden', () => {
    const t = trace('import math\nclass A:\n    pass\ndef f():\n    pass\nx = math.pi\nend = 0\n');
    expect(Object.keys(t.steps.at(-1)!.frames[0].locals)).toEqual(['x']);
  });

  it('never calls the program\'s own __repr__ or __getattribute__ while encoding', () => {
    const source = [
      'class Loud:',
      '    def __repr__(self):',
      '        print("REPR CALLED")',
      '        return "loud"',
      '    def __getattribute__(self, name):',
      '        print("GETATTR CALLED")',
      '        return object.__getattribute__(self, name)',
      'class Sneaky(list):',
      '    def __iter__(self):',
      '        print("ITER CALLED")',
      '        return iter([])',
      'x = Loud()',
      's = Sneaky([1, 2])',
      'end = 0',
    ].join('\n');
    const t = trace(source);
    expect(t.stdout).toBe('');
    const heap = heapsByStep(t).at(-1)!;
    expect(valueText(t.steps.at(-1)!.frames[0].locals.x, heap)).toBe('Loud()');
    // the list's real items, read without its overridden __iter__
    expect(valueText(t.steps.at(-1)!.frames[0].locals.s, heap)).toBe('[1, 2]');
  });

  it('stdin is read through input() and sys.stdin and counted; prompts and prints are captured in order', () => {
    const t = trace('name = input("name? ")\nimport sys\nrest = sys.stdin.read()\nprint("hi", name, len(rest))\n', 'Ada\n1 2 3\n');
    expect(t.stdout).toBe('name? hi Ada 6\n');
    expect(t.steps.map(s => s.stdinConsumed)).toEqual([0, 4, 4, 10]);
    expect(t.steps.map(s => s.stdoutLength)).toEqual([0, 6, 6, 6]);
  });

  it('an uncaught exception: an exception step, the error with its line, a traceback of the program only, exit code 1', () => {
    const t = trace('def f(x):\n    return 10 // x\n\nprint(f(2))\nprint(f(0))\n');
    expect(t.status).toBe('exception');
    expect(t.exitCode).toBe(1);
    expect(t.error).toEqual({ type: 'ZeroDivisionError', message: expect.stringMatching(/division|modulo/), line: 2 });
    expect(t.steps.some(s => s.event === 'exception' && s.exception?.type === 'ZeroDivisionError')).toBe(true);
    expect(t.stdout).toBe('5\n');
    expect(t.stderr).toMatch(/^Traceback \(most recent call last\):\n {2}File "main\.py", line 5, in <module>\n {4}print\(f\(0\)\)\n {2}File "main\.py", line 2, in f\n {4}return 10 \/\/ x\nZeroDivisionError/);
    expect(t.stderr).not.toContain('tracer');
  });

  it('a caught exception is an exception step, and the program goes on', () => {
    const t = trace('try:\n    x = 1 / 0\nexcept ZeroDivisionError:\n    x = -1\nprint(x)\n');
    expect(t.status).toBe('completed');
    expect(t.steps.filter(s => s.event === 'exception')).toHaveLength(1);
    expect(t.stdout).toBe('-1\n');
  });

  it('a syntax error: no steps, the error and its line, nothing run', () => {
    const t = trace('x = 1\ndef f(:\n    pass\n');
    expect(t).toMatchObject({ status: 'syntax_error', steps: [], exitCode: null, error: { type: 'SyntaxError', line: 2 } });
    expect(t.stderr).toContain('SyntaxError');
  });

  it('sys.exit: the exit code given (and a message as stderr), status completed', () => {
    expect(trace('import sys\nsys.exit(3)\n')).toMatchObject({ status: 'completed', exitCode: 3 });
    expect(trace('import sys\nsys.exit("bad")\n')).toMatchObject({ status: 'completed', exitCode: 1, stderr: 'bad\n' });
  });

  it('an infinite loop ends at the step limit with its trace', () => {
    const t = trace('i = 0\nwhile True:\n    i += 1\n');
    expect(t.status).toBe('step_limit');
    expect(t.steps).toHaveLength(TRACE_LIMITS.maxSteps);
  });

  it('a slow program ends at the time limit with its trace so far', () => {
    const t = trace('import time\nfor i in range(10):\n    time.sleep(0.4)\nprint("never")\n');
    expect(t.status).toBe('time_limit');
    expect(t.steps.length).toBeGreaterThan(2);
    expect(t.stdout).toBe('');
  });

  it('a trace that would grow too large ends at the size limit, within it', () => {
    const { stdout, nonce } = runRaw('a = []\nfor i in range(5000):\n    a.append("y" * 190 + str(i))\n');
    const found = extractTrace(stdout, nonce);
    expect(found.kind).toBe('found');
    if (found.kind !== 'found') return;
    expect(found.json.length).toBeLessThanOrEqual(TRACE_LIMITS.maxTraceChars);
    const checked = validateTrace(JSON.parse(found.json), { source: 'a = []\nfor i in range(5000):\n    a.append("y" * 190 + str(i))\n', stdin: '' });
    expect(checked.ok && checked.trace.status).toBe('size_limit');
  });

  it('deep recursion: the innermost 32 frames, the rest counted, then RecursionError', () => {
    const t = trace('def down(n):\n    return down(n + 1)\n\ndown(0)\n');
    const deepest = t.steps.reduce((m, s) => Math.max(m, s.frames.length + (s.framesOmitted ?? 0)), 0);
    expect(Math.max(...t.steps.map(s => s.frames.length))).toBe(TRACE_LIMITS.maxFrames);
    expect(deepest).toBeGreaterThan(TRACE_LIMITS.maxFrames);
    expect(t.truncated).toContain('frames');
  });

  it('long collections show their first 100 items and their real length', () => {
    const t = trace('a = list(range(250))\nend = 0\n');
    const heap = heapsByStep(t).at(-1)!;
    const list = heap[(t.steps.at(-1)!.frames[0].locals.a as { id: string }).id];
    expect(list).toMatchObject({ kind: 'list', length: 250 });
    expect(list.kind === 'list' && list.items).toHaveLength(TRACE_LIMITS.maxItems);
  });

  it("output written around sys.stdout and fake markers are not the program's output or its trace", () => {
    const source = 'import os, sys\nos.write(1, b"AFTRACE-' + '0'.repeat(32) + '-BEGIN\\n{}\\n")\nsys.__stdout__.write("raw\\n")\nprint("ok")\n';
    const { stdout, nonce } = runRaw(source);
    const found = extractTrace(stdout, nonce);
    expect(found.kind).toBe('found');
    if (found.kind !== 'found') return;
    const checked = validateTrace(JSON.parse(found.json), { source, stdin: '' });
    expect(checked.ok && checked.trace.stdout).toBe('ok\n');
  });

  it('runs as __main__ (the usual guard works), and a sorted() key function keeps the outer frames', () => {
    const t = trace('def key(x):\n    return -x\n\ndef main():\n    return sorted([1, 3, 2], key=key)\n\nif __name__ == "__main__":\n    r = main()\n    print(r)\n');
    expect(t.stdout).toBe('[3, 2, 1]\n');
    const inKey = t.steps.find(s => s.event === 'call' && s.frames.at(-1)!.name === 'key')!;
    expect(inKey.frames.map(f => f.name)).toEqual(['<module>', 'main', 'key']);
  });
});
