import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Pascal's Triangle listings, compiled and run on THIS machine's compilers (a language whose compiler is not
 * installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed by a
 * small driver that calls its generate for every numRows from 1 to 10 and prints the rows. Every language must print
 * exactly the triangle the engine's trace returns. Compiling must print no warning (gcc/g++ -Wall -Wextra,
 * javac -Xlint:all).
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface TriangleDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[]): { triangle?: { result?: readonly (readonly number[])[] } }[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): TriangleDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('dp-pascals-triangle')!;

/** every driver prints one line per numRows: the rows separated by "|", the values of a row by "," */
const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int numRows;
        if (scanf("%d", &numRows) != 1) return 1;
        int size;
        int* columns;
        int** triangle = generate(numRows, &size, &columns);
        for (int i = 0; i < size; i++) {
            if (i) printf("|");
            for (int j = 0; j < columns[i]; j++) printf(j ? ",%d" : "%d", triangle[i][j]);
            free(triangle[i]);
        }
        printf("\\n");
        free(triangle);
        free(columns);
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
        int numRows;
        cin >> numRows;
        vector<vector<int>> triangle = generate(numRows);
        for (size_t i = 0; i < triangle.size(); i++) {
            if (i) cout << "|";
            for (size_t j = 0; j < triangle[i].size(); j++) cout << (j ? "," : "") << triangle[i][j];
        }
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
            List<List<Integer>> triangle = PascalsTriangle.generate(in.nextInt());
            for (int i = 0; i < triangle.size(); i++) {
                if (i > 0) out.append("|");
                for (int j = 0; j < triangle.get(i).size(); j++) out.append(j > 0 ? "," : "").append(triangle.get(i).get(j));
            }
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
    out = []
    for token in data[1:1 + int(data[0])]:
        out.append("|".join(",".join(map(str, row)) for row in generate(int(token))))
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-pascal-'));
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
    fs.writeFileSync(path.join(dir, 'PascalsTriangle.java'), source);
    compiled = run('javac', ['-Xlint:all', 'PascalsTriangle.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** what the engine's trace returns for numRows, in the drivers' format */
const expectedLine = (numRows: number) => def.generateSteps([numRows]).at(-1)!.triangle!.result!.map(row => row.join(',')).join('|');

const CASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const STDIN = `${CASES.length}\n${CASES.join('\n')}\n`;

describe("Pascal's Triangle — the engine's results the listings are compared with", () => {
  it('numRows = 5 gives the example, and every row ends in 1', () => {
    expect(expectedLine(5)).toBe('1|1,1|1,2,1|1,3,3,1|1,4,6,4,1');
    for (const n of CASES) for (const row of expectedLine(n).split('|')) expect(row.split(',').at(-1)).toBe('1');
  });
});

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Pascal's Triangle — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and returns the engine's triangle for numRows 1 to 10`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((n, k) => expect(lines[k], `numRows = ${n}`).toBe(expectedLine(n)));
    }, 180_000);
  });
}
