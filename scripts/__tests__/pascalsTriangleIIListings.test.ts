import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Pascal's Triangle II listings, compiled and run on THIS machine's compilers (a language whose compiler is not
 * installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed by a
 * small driver that calls its getRow for every rowIndex from 0 to 9 and prints the row. Every language must print exactly
 * the row the engine's trace returns. Compiling must print no warning (gcc/g++ -Wall -Wextra, javac -Xlint:all).
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface RowDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[]): { dpRow?: { result?: readonly number[] } }[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): RowDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('dp-pascals-triangle-ii')!;

/** every driver prints one line per rowIndex: the row's values separated by "," */
const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int rowIndex;
        if (scanf("%d", &rowIndex) != 1) return 1;
        int size;
        int* row = getRow(rowIndex, &size);
        for (int k = 0; k < size; k++) printf(k ? ",%d" : "%d", row[k]);
        printf("\\n");
        free(row);
    }
    return 0;
}
`,
  cpp: `
#include <iostream>

int main() {
    int t;
    if (!(cin >> t)) return 1;
    while (t--) {
        int rowIndex;
        cin >> rowIndex;
        vector<int> row = getRow(rowIndex);
        for (size_t k = 0; k < row.size(); k++) cout << (k ? "," : "") << row[k];
        cout << "\\n";
    }
    return 0;
}
`,
  java: `

class Main {
    public static void main(String[] args) {
        java.util.Scanner in = new java.util.Scanner(System.in);
        int t = in.nextInt();
        StringBuilder out = new StringBuilder();
        while (t-- > 0) {
            List<Integer> row = PascalsTriangleII.getRow(in.nextInt());
            for (int k = 0; k < row.size(); k++) out.append(k > 0 ? "," : "").append(row.get(k));
            out.append("\\n");
        }
        System.out.print(out);
    }
}
`,
  python: `

import sys

def _main():
    data = sys.stdin.read().split()
    out = [",".join(map(str, get_row(int(token)))) for token in data[1:1 + int(data[0])]]
    print("\\n".join(out))

_main()
`,
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** compiles the listing plus its driver; returns the compiler's own output and a runner */
function build(lang: ProgrammingLanguage) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-pascal2-'));
  dirs.push(dir);
  const run = (cmd: string, args: string[], stdin = '') => spawnSync(cmd, args, { cwd: dir, input: stdin, encoding: 'utf8', timeout: 60_000 });
  const source = def.code[lang] + '\n' + DRIVERS[lang];
  let compiled: ReturnType<typeof run>;
  let exec: (stdin: string) => ReturnType<typeof run>;
  if (lang === 'c') {
    fs.writeFileSync(path.join(dir, 'main.c'), source);
    compiled = run('gcc', ['-std=c99', '-Wall', '-Wextra', '-O2', '-o', `main${EXE}`, 'main.c']);
    exec = stdin => run(path.join(dir, `main${EXE}`), [], stdin);
  } else if (lang === 'cpp') {
    fs.writeFileSync(path.join(dir, 'main.cpp'), source);
    compiled = run('g++', ['-std=c++14', '-Wall', '-Wextra', '-O2', '-o', `main${EXE}`, 'main.cpp']);
    exec = stdin => run(path.join(dir, `main${EXE}`), [], stdin);
  } else if (lang === 'java') {
    fs.writeFileSync(path.join(dir, 'PascalsTriangleII.java'), source);
    compiled = run('javac', ['-Xlint:all', 'PascalsTriangleII.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** what the engine's trace returns for rowIndex, in the drivers' format */
const expectedLine = (rowIndex: number) => def.generateSteps([rowIndex]).at(-1)!.dpRow!.result!.join(',');

const CASES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const STDIN = `${CASES.length}\n${CASES.join('\n')}\n`;

describe("Pascal's Triangle II — the engine's results the listings are compared with", () => {
  it('rowIndex = 3 gives [1, 3, 3, 1], and 9 the tenth row', () => {
    expect(expectedLine(3)).toBe('1,3,3,1');
    expect(expectedLine(9)).toBe('1,9,36,84,126,126,84,36,9,1');
  });
});

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Pascal's Triangle II — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and returns the engine's row for rowIndex 0 to 9`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((n, k) => expect(lines[k], `rowIndex = ${n}`).toBe(expectedLine(n)));
    }, 180_000);
  });
}
