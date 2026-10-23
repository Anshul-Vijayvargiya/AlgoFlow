import { describe, it, expect } from 'vitest';
import type { RunResult } from '../../../api';
import { FakeProviderUnavailableError, fakeExecute } from '../../../execution/fakeExecution';
import { runHeadline, runMetrics } from '../runOutput';
import { SOURCE_FILE_NAMES, STARTER_PROGRAMS } from '../starterPrograms';

const result = (r: Partial<RunResult>): RunResult => ({
  status: 'success', stdout: '', stderr: '', compileOutput: '', truncated: false, exitCode: 0, exitSignal: null,
  timeMs: null, memoryKb: null, provider: 'judge0', usedToday: 1, dailyLimit: 100, ...r,
});

describe('run summary', () => {
  it('names what happened, from the result only', () => {
    expect(runHeadline(result({ exitCode: 0 }))).toEqual({ text: 'Finished with exit code 0', tone: 'success' });
    expect(runHeadline(result({ status: 'compile_error', exitCode: null }))).toEqual({ text: 'Compilation failed', tone: 'error' });
    expect(runHeadline(result({ status: 'runtime_error', exitCode: 139, exitSignal: 11 })).text).toBe('Runtime error (exit code 139) (signal 11)');
    expect(runHeadline(result({ status: 'runtime_error', exitCode: null })).text).toBe('Runtime error');
    expect(runHeadline(result({ status: 'timeout', exitCode: null }))).toMatchObject({ tone: 'warning', text: expect.stringMatching(/Time limit/) });
  });

  it('shows time and memory only when the provider reported them', () => {
    expect(runMetrics(result({ timeMs: 12, memoryKb: 3456 }))).toBe('Time: 12 ms · Memory: 3.4 MB');
    expect(runMetrics(result({ timeMs: null, memoryKb: null }))).toBe('');
  });
});

describe('starter programs', () => {
  it('one complete program per language; Java is class Main as Judge0 requires', () => {
    expect(Object.keys(STARTER_PROGRAMS).sort()).toEqual(['c', 'cpp', 'java', 'python']);
    expect(STARTER_PROGRAMS.java).toMatch(/public class Main\b/);
    expect(STARTER_PROGRAMS.c).toMatch(/int main\(void\)/);
    expect(STARTER_PROGRAMS.cpp).toMatch(/int main\(\)/);
    expect(SOURCE_FILE_NAMES).toEqual({ c: 'main.c', cpp: 'main.cpp', java: 'Main.java', python: 'main.py' });
  });
});

describe('fake execution (tests only)', () => {
  it('never runs code: echoes stdin, or prints the FAKE:PRINT lines', () => {
    expect(fakeExecute('int main(){}', '1 2')).toMatchObject({ status: 'success', stdout: '1 2', exitCode: 0 });
    expect(fakeExecute('// FAKE:PRINT hello\n// FAKE:PRINT world', 'x').stdout).toBe('hello\nworld\n');
  });

  it('produces each outcome on request', () => {
    expect(fakeExecute('FAKE:COMPILE_ERROR', '')).toMatchObject({ status: 'compile_error', compileOutput: expect.stringContaining('FAKE:COMPILE_ERROR') });
    expect(fakeExecute('FAKE:RUNTIME_ERROR', '')).toMatchObject({ status: 'runtime_error', exitCode: 1 });
    expect(fakeExecute('FAKE:TIMEOUT', '')).toMatchObject({ status: 'timeout' });
    expect(() => fakeExecute('FAKE:UNAVAILABLE', '')).toThrow(FakeProviderUnavailableError);
  });
});
