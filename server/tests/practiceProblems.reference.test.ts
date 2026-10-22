import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PRACTICE_PROBLEMS } from '../../src/data/practiceProblems';
import { outputsMatch } from '../../src/execution/judgeCore';
import { HIDDEN_TESTS, SEEDED_PRACTICE_PROBLEMS } from '../config/practiceProblemTests';
import { REFERENCE_SOLUTIONS } from './fixtures/practiceReferenceSolutions';
import type { ExecutionLanguageId } from '../../src/api/client';

/**
 * The seeded problems are correct: for every problem and language, the reference solution (inside the user's own
 * starter program) produces every expected output, visible and hidden; the untouched starter compiles and runs but
 * is not accepted. Compiled and run on THIS machine's compilers, never by the server; a language whose compiler is not
 * installed is skipped (and reported as skipped). Judge0's compiler versions may differ (see judge0.live.test.ts).
 */

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ExecutionLanguageId, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';

/** compiles source into a fresh folder and returns a function that runs it on one input */
function build(language: ExecutionLanguageId, source: string): (stdin: string) => { stdout: string; code: number | null; stderr: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-ref-'));
  const run = (cmd: string, args: string[], stdin = '') => spawnSync(cmd, args, { cwd: dir, input: stdin, encoding: 'utf8', timeout: 20_000 });
  const compile = (cmd: string, args: string[]) => {
    const r = run(cmd, args);
    if (r.status !== 0) throw new Error(`${language} compilation failed:\n${r.stderr}`);
  };
  let exec: (stdin: string) => ReturnType<typeof run>;
  if (language === 'c') {
    fs.writeFileSync(path.join(dir, 'main.c'), source);
    compile('gcc', ['-O2', '-o', `main${EXE}`, 'main.c']);
    exec = stdin => run(path.join(dir, `main${EXE}`), [], stdin);
  } else if (language === 'cpp') {
    fs.writeFileSync(path.join(dir, 'main.cpp'), source);
    compile('g++', ['-O2', '-std=c++14', '-o', `main${EXE}`, 'main.cpp']);
    exec = stdin => run(path.join(dir, `main${EXE}`), [], stdin);
  } else if (language === 'java') {
    fs.writeFileSync(path.join(dir, 'Main.java'), source);
    // Judge0 CE runs OpenJDK 13: compile against the Java 13 API so newer features are caught here
    compile('javac', ['--release', '13', 'Main.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return stdin => {
    const r = exec(stdin);
    return { stdout: r.stdout ?? '', code: r.status, stderr: r.stderr ?? '' };
  };
}

const LANGUAGES: ExecutionLanguageId[] = ['c', 'cpp', 'java', 'python'];

describe('seeded practice problems — data', () => {
  it('every problem has visible and hidden tests, and its stored form keeps both', () => {
    for (const p of PRACTICE_PROBLEMS) {
      expect(p.visibleTests.length, p.problemId).toBeGreaterThanOrEqual(1);
      expect(HIDDEN_TESTS[p.problemId]?.length, p.problemId).toBeGreaterThanOrEqual(3);
      const stored = SEEDED_PRACTICE_PROBLEMS.find(s => s.problemId === p.problemId)!;
      expect(stored.judgeMode).toBe('stdio');
      expect(stored.testCases.filter(t => t.isHidden)).toHaveLength(HIDDEN_TESTS[p.problemId].length);
    }
  });

  it('examples are the visible tests: the statement shows the real input and output format', () => {
    for (const p of PRACTICE_PROBLEMS) {
      for (const ex of p.examples) {
        expect(p.visibleTests.some(t => outputsMatch(t.input, ex.input) && outputsMatch(t.expected, ex.output)), `${p.problemId}: ${ex.input}`).toBe(true);
      }
    }
  });

  it('every reference solution replaces exactly one stub in its starter program', () => {
    for (const p of PRACTICE_PROBLEMS) {
      for (const lang of LANGUAGES) {
        const { stub } = REFERENCE_SOLUTIONS[p.problemId][lang];
        expect(p.starterCode[lang].split(stub).length - 1, `${p.problemId}/${lang}`).toBe(1);
      }
    }
  });
});

for (const lang of LANGUAGES) {
  describe.skipIf(!AVAILABLE[lang])(`seeded practice problems — ${lang} (local compiler)`, () => {
    for (const p of PRACTICE_PROBLEMS) {
      const tests = [...p.visibleTests, ...HIDDEN_TESTS[p.problemId]];

      it(`${p.problemId} ${p.title}: the reference solution passes every visible and hidden test`, () => {
        const { stub, solution } = REFERENCE_SOLUTIONS[p.problemId][lang];
        const run = build(lang, p.starterCode[lang].replace(stub, solution));
        for (const t of tests) {
          const r = run(t.input);
          expect(r.code, `${JSON.stringify(t.input)}\n${r.stderr}`).toBe(0);
          expect(outputsMatch(r.stdout, t.expected), `input ${JSON.stringify(t.input)}: got ${JSON.stringify(r.stdout)}, expected ${JSON.stringify(t.expected)}`).toBe(true);
        }
      }, 120_000);

      it(`${p.problemId} ${p.title}: the starter compiles and runs, and is not accepted`, () => {
        const run = build(lang, p.starterCode[lang]);
        const results = tests.map(t => ({ t, r: run(t.input) }));
        for (const { t, r } of results) expect(r.code, `${JSON.stringify(t.input)}\n${r.stderr}`).toBe(0);
        expect(results.every(({ t, r }) => outputsMatch(r.stdout, t.expected))).toBe(false);
      }, 120_000);
    }
  });
}
