import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_PYTHON_LIMITS, LocalPythonProvider, findPython } from '../services/execution/localPythonProvider';
import { ExecutionProviderError } from '../services/execution/types';
import { buildPythonTraceProgram, extractTrace } from '../services/execution/tracing/pythonTracer';
import { validateTrace, type ExecutionTrace } from '../../src/execution/trace';

/**
 * The local Python provider (EXECUTION_PROVIDER=local, development only), run for real with this machine's Python.
 * Skipped where no Python 3.8+ is installed. The blocking checks show the guards work for ordinary programs; they do
 * not prove a sandbox (see localPythonProvider.ts: audit hooks can be bypassed by a determined program).
 */
const PYTHON = process.env.PYTHON ?? 'python';
const hasPython = !('error' in findPython(PYTHON));
const suite = hasPython ? describe : describe.skip;

const provider = new LocalPythonProvider(PYTHON);
const run = (source: string, stdin = '', p = provider) => p.execute({ language: 'python', source, stdin });

const scratch: string[] = [];
afterEach(() => {
  for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true });
});

suite('local Python provider: running programs', () => {
  it('offers Python only, labelled with the real version', () => {
    expect(provider.languages()).toEqual([{ id: 'python', label: expect.stringMatching(/^Python 3\.\d+\.\d+ \(local\)$/) }]);
  });

  it('runs a program with its input; output uses \\n line endings', async () => {
    const r = await run('n = int(input())\nprint("double:", n * 2)\nprint("done")\n', '21\n');
    expect(r).toMatchObject({ status: 'success', stdout: 'double: 42\ndone\n', stderr: '', exitCode: 0 });
    expect(r.timeMs).toBeGreaterThan(0);
  });

  it('a runtime error: exit code 1 and a traceback naming main.py, without the runner', async () => {
    const r = await run('def f():\n    return 1 / 0\nf()\n');
    expect(r.status).toBe('runtime_error');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('File "main.py", line 2, in f');
    expect(r.stderr).toContain('ZeroDivisionError');
    expect(r.stderr).not.toMatch(/runner\.py|algoflow-run-/);
  });

  it('sys.exit codes are passed through', async () => {
    expect(await run('import sys\nprint("x")\nsys.exit(3)\n')).toMatchObject({ status: 'runtime_error', exitCode: 3, stdout: 'x\n' });
  });

  it('refuses other languages without running anything (not charged)', async () => {
    const err = await provider.execute({ language: 'cpp', source: 'int main(){}', stdin: '' }).catch(e => e);
    expect(err).toBeInstanceOf(ExecutionProviderError);
    expect(err).toMatchObject({ kind: 'misconfigured', submitted: false });
  });

  it('an interpreter that cannot be found is reported, and nothing runs (not charged)', async () => {
    const missing = new LocalPythonProvider('algoflow-no-such-python');
    expect(missing.languages()).toEqual([{ id: 'python', label: 'Python (local)' }]);
    expect(await run('print(1)', '', missing).catch(e => e)).toMatchObject({ kind: 'misconfigured', submitted: false });
  });
});

suite('local Python provider: what a program cannot reach', () => {
  it("none of the server's environment: secrets set in the server process are not passed on", async () => {
    process.env.ALGOFLOW_TEST_SECRET = 'should-not-leak';
    try {
      const r = await run('import os\nprint(sorted(os.environ))\nprint(os.environ.get("ALGOFLOW_TEST_SECRET"))\n');
      expect(r.status).toBe('success');
      expect(r.stdout).not.toContain('should-not-leak');
      for (const name of ['JWT_SECRET', 'COOKIE_SECRET', 'MONGODB_URI', 'JUDGE0_API_KEY', 'GEMINI_API_KEY', 'ALGOFLOW_TEST_SECRET']) {
        expect(r.stdout, name).not.toContain(`'${name}'`);
      }
    } finally {
      delete process.env.ALGOFLOW_TEST_SECRET;
    }
  });

  it('files outside the Python library cannot be read, even after replacing os.path.realpath', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'algoflow-secret-'));
    scratch.push(dir);
    const secret = join(dir, 'secret.txt');
    writeFileSync(secret, 'TOP-SECRET-CONTENT');
    const path = JSON.stringify(secret);
    for (const source of [
      `print(open(${path}).read())`,
      `import pathlib\nprint(pathlib.Path(${path}).read_text())`,
      `import os\nfd = os.open(${path}, os.O_RDONLY)\nprint(os.read(fd, 100))`,
      `import os, sys\nos.path.realpath = lambda p, **k: sys.prefix\nprint(open(${path}).read())`,
      `import os\nprint(os.listdir(${JSON.stringify(dir)}))`,
    ]) {
      const r = await run(source);
      expect(r.status, source).toBe('runtime_error');
      expect(r.stdout, source).not.toContain('TOP-SECRET');
      expect(r.stdout, source).not.toContain('secret.txt');
      expect(r.stderr, source).toMatch(/PermissionError: (Reading files|Listing folders)/);
    }
  });

  it("a blocked module this Python does not have fails as a normal ImportError, so the library's optional imports work", async () => {
    // Python 3.14's pathlib does `try: import _winapi / except ImportError`; on Linux there is no _winapi, and refusing it
    // with PermissionError made every `import pathlib` fail. The platform's missing blocked module: _winapi off Windows,
    // _posixsubprocess on Windows
    const missing = process.platform === 'win32' ? '_posixsubprocess' : '_winapi';
    const r = await run(`try:\n    import ${missing}\nexcept ImportError as e:\n    print(type(e).__name__)\nimport pathlib\nprint("pathlib ok")\n`);
    expect(r).toMatchObject({ status: 'success', stdout: 'ModuleNotFoundError\npathlib ok\n' });
    // a blocked module it does have is still refused, even inside the same kind of guarded import
    const blocked = await run('try:\n    import mmap\nexcept ImportError:\n    print("fell back")\n');
    expect(blocked.status).toBe('runtime_error');
    expect(blocked.stdout).toBe('');
    expect(blocked.stderr).toMatch(/PermissionError: Importing mmap is not allowed here\./);
  });

  it('the Python standard library can still be imported and read', async () => {
    const r = await run('import json, collections, heapq, itertools, math, re\nprint(json.dumps(sorted(collections.Counter("abca").items())))\n');
    expect(r).toMatchObject({ status: 'success', stdout: '[["a", 2], ["b", 1], ["c", 1]]\n' });
  });

  it('no files can be written, renamed or deleted', async () => {
    for (const source of ['open("out.txt", "w").write("x")', 'open("out.txt", "a")', 'import os\nos.mkdir("d")', 'import os\nos.remove("program.py")']) {
      const r = await run(source);
      expect(r.status, source).toBe('runtime_error');
      expect(r.stderr, source).toMatch(/PermissionError/);
    }
  });

  it('no processes, network or native code', async () => {
    for (const source of [
      'import subprocess\nsubprocess.run(["whoami"])',
      'import os\nos.system("whoami")',
      'import socket\nsocket.socket()',
      'import urllib.request\nurllib.request.urlopen("http://127.0.0.1:1")',
      'import ctypes',
      'import sys\nprint(sys.modules["ctypes"])',
    ]) {
      const r = await run(source);
      expect(r.status, source).toBe('runtime_error');
      expect(r.stderr, source).toMatch(/PermissionError|KeyError/);
    }
  });

  it('the run folder is a fresh temporary one, deleted when the run ends', async () => {
    const r = await run('import os\nprint(os.getcwd())\n');
    const cwd = r.stdout.trim();
    expect(cwd).toMatch(/algoflow-run-/);
    expect(existsSync(cwd)).toBe(false);
  });
});

suite('local Python provider: limits', () => {
  it('memory: allocating past the limit fails with MemoryError', async () => {
    const r = await run(`x = bytearray(${LOCAL_PYTHON_LIMITS.memoryBytes * 2})\nprint("allocated")\n`);
    expect(r.status).toBe('runtime_error');
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('MemoryError');
  });

  it('time: a program still running at the wall-clock limit is killed and reported as a timeout', async () => {
    const quick = new LocalPythonProvider(PYTHON, { ...LOCAL_PYTHON_LIMITS, wallTimeMs: 1500 });
    const started = Date.now();
    const r = await run('print("started", flush=True)\nwhile True:\n    pass\n', '', quick);
    expect(r).toMatchObject({ status: 'timeout', exitCode: null, stdout: 'started\n' });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('output: past the cap the run is stopped, the output is cut at the cap, and it says why', async () => {
    const small = new LocalPythonProvider(PYTHON, { ...LOCAL_PYTHON_LIMITS, stdoutMaxBytes: 64 * 1024 });
    const r = await run('while True:\n    print("x" * 1000)\n', '', small);
    expect(r.status).toBe('runtime_error');
    expect(r.stdout.length).toBeLessThanOrEqual(64 * 1024);
    expect(r.stderr).toMatch(/output passed the .* limit/);
  });

  it('runs at once are capped: one more is refused as busy (not charged)', async () => {
    const single = new LocalPythonProvider(PYTHON, { ...LOCAL_PYTHON_LIMITS, maxConcurrent: 1 });
    const first = run('import time\ntime.sleep(1)\nprint("first")\n', '', single);
    const second = await run('print("second")', '', single).catch(e => e);
    expect(second).toMatchObject({ kind: 'busy', submitted: false });
    expect(await first).toMatchObject({ status: 'success', stdout: 'first\n' });
    expect(await run('print("after")', '', single)).toMatchObject({ status: 'success', stdout: 'after\n' });
  });
});

suite('local Python provider: step-by-step traces', () => {
  /** what POST /api/run/trace does with the provider's output */
  async function traced(source: string, stdin = ''): Promise<ExecutionTrace> {
    const nonce = 'b'.repeat(32);
    const r = await run(buildPythonTraceProgram(source, nonce), stdin);
    const found = extractTrace(r.stdout, nonce);
    if (found.kind !== 'found') throw new Error(`no trace (${found.kind}): ${r.status} ${r.stderr}`);
    const checked = validateTrace(JSON.parse(found.json), { source, stdin });
    if (!checked.ok) throw new Error(checked.reason);
    return checked.trace;
  }

  it('x = 2, y = 3, result = x + y: every line, every value, the output, and runtime provenance', async () => {
    const t = await traced('x = 2\ny = 3\nresult = x + y\nprint(result)\n');
    expect(t).toMatchObject({ provenance: 'runtime', status: 'completed', exitCode: 0, stdout: '5\n', error: null, truncated: [] });
    expect(t.runtime).toMatch(/^Python 3\./);
    expect(t.steps.map(s => s.line)).toEqual([1, 2, 3, 4]);
    const locals = t.steps.map(s => s.frames[0].locals);
    expect(locals[0]).toEqual({});
    expect(locals[1]).toEqual({ x: { kind: 'int', repr: '2' } });
    expect(locals[2]).toEqual({ x: { kind: 'int', repr: '2' }, y: { kind: 'int', repr: '3' } });
    expect(locals[3]).toEqual({ x: { kind: 'int', repr: '2' }, y: { kind: 'int', repr: '3' }, result: { kind: 'int', repr: '5' } });
    expect(t.steps[3].stdoutLength).toBe(0); // print has not run yet at the last line
  });

  it('reads input and records the exception of a failing program', async () => {
    const t = await traced('a, b = map(int, input().split())\nprint(a // b)\n', '7 0\n');
    expect(t.status).toBe('exception');
    expect(t.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 });
    expect(t.steps[1].stdinConsumed).toBe(4);
  });

  it('an endless loop ends at the tracer time budget with the trace so far (not a provider timeout)', async () => {
    const t = await traced('i = 0\nwhile True:\n    i += 1\n');
    expect(['time_limit', 'step_limit']).toContain(t.status);
    expect(t.steps.length).toBeGreaterThan(10);
  });
});
