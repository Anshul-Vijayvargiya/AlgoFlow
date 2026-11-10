import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Move Zeroes listings, compiled and run on THIS machine's compilers (a language whose compiler is not
 * installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed by a
 * small driver that reads each array, calls the listing (which changes the array in place) and prints the array. Every
 * language must print exactly the final array of the engine's trace. Compiling must print no warning (gcc/g++ -Wall
 * -Wextra, javac -Xlint:all).
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface CellsDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[]): { cells?: { result?: readonly number[] } }[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): CellsDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('array-move-zeroes')!;

/** every driver prints one line per array: its values after the call, separated by "," */
const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int n;
        if (scanf("%d", &n) != 1) return 1;
        int nums[10];
        for (int k = 0; k < n; k++) if (scanf("%d", &nums[k]) != 1) return 1;
        moveZeroes(nums, n);
        for (int k = 0; k < n; k++) printf(k ? ",%d" : "%d", nums[k]);
        printf("\\n");
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
        int n;
        cin >> n;
        vector<int> nums(n);
        for (int k = 0; k < n; k++) cin >> nums[k];
        moveZeroes(nums);
        for (int k = 0; k < n; k++) cout << (k ? "," : "") << nums[k];
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
            int n = in.nextInt();
            int[] nums = new int[n];
            for (int k = 0; k < n; k++) nums[k] = in.nextInt();
            MoveZeroes.moveZeroes(nums);
            for (int k = 0; k < n; k++) out.append(k > 0 ? "," : "").append(nums[k]);
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
    t, pos = int(data[0]), 1
    out = []
    for _ in range(t):
        n = int(data[pos])
        nums = [int(v) for v in data[pos + 1:pos + 1 + n]]
        pos += 1 + n
        move_zeroes(nums)
        out.append(",".join(map(str, nums)))
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-zeroes-'));
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
    fs.writeFileSync(path.join(dir, 'MoveZeroes.java'), source);
    compiled = run('javac', ['-Xlint:all', 'MoveZeroes.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** the final array of the engine's trace, in the drivers' format */
const expectedLine = (nums: readonly number[]) => def.generateSteps([...nums]).at(-1)!.cells!.result!.join(',');

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
const rnd = random(283);
const next = () => rnd.next().value as number;

const CASES: number[][] = [
  [0, 1, 0, 3, 12],
  [0, 0, 1],
  [1, 2, 3],
  [0, 0, 0],
  [0],
  [7],
  [4, 5, 0, 0],
  [1, 0, 0, 0, 2],
  [-1, 0, -2, 0, 3],
  [0, -999, 0, 999, 5, 0, -5, 0, 1, 0],
  ...Array.from({ length: 60 }, () => Array.from({ length: 1 + Math.floor(next() * 10) }, () => (next() < 0.4 ? 0 : Math.floor(next() * 1999) - 999))),
];
const STDIN = `${CASES.length}\n${CASES.map(c => [c.length, ...c].join(' ')).join('\n')}\n`;

describe("Move Zeroes — the engine's results the listings are compared with", () => {
  it('the examples: zeroes at the end, the rest in order', () => {
    expect(expectedLine([0, 1, 0, 3, 12])).toBe('1,3,12,0,0');
    expect(expectedLine([0, 0, 1])).toBe('1,0,0');
    expect(expectedLine([1, 2, 3])).toBe('1,2,3');
    expect(expectedLine([0, 0, 0])).toBe('0,0,0');
  });
});

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Move Zeroes — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and changes each of ${CASES.length} arrays in place into the engine's result`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((nums, k) => expect(lines[k], JSON.stringify(nums)).toBe(expectedLine(nums)));
    }, 180_000);
  });
}
