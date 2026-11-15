import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Subarray Sum Equals K listings, compiled and run on THIS machine's compilers (a language whose compiler is
 * not installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed
 * by a small driver that reads each case (k and the numbers), calls the listing and prints what it returns. Every
 * language must print exactly the count of the engine's trace, which is checked against a direct search over every
 * subarray. Compiling must print no warning (gcc/g++ -Wall -Wextra, javac -Xlint:all).
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface SubarraySumDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[], params?: Record<string, unknown>): { prefixMap?: { result?: { count: number } } }[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): SubarraySumDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('array-subarray-sum-k')!;

/** every driver reads the number of cases, then each case's length, k and numbers, and prints one count per line */
const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int n, k;
        if (scanf("%d %d", &n, &k) != 2) return 1;
        int nums[10];
        for (int j = 0; j < n; j++) if (scanf("%d", &nums[j]) != 1) return 1;
        printf("%d\\n", subarraySum(nums, n, k));
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
        int n, k;
        cin >> n >> k;
        vector<int> nums(n);
        for (int j = 0; j < n; j++) cin >> nums[j];
        cout << subarraySum(nums, k) << "\\n";
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
            int k = in.nextInt();
            int[] nums = new int[n];
            for (int j = 0; j < n; j++) nums[j] = in.nextInt();
            out.append(SubarraySumEqualsK.subarraySum(nums, k)).append("\\n");
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
        n, k = int(data[pos]), int(data[pos + 1])
        nums = [int(v) for v in data[pos + 2:pos + 2 + n]]
        pos += 2 + n
        out.append(str(subarray_sum(nums, k)))
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-ssk-'));
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
    fs.writeFileSync(path.join(dir, 'SubarraySumEqualsK.java'), source);
    compiled = run('javac', ['-Xlint:all', 'SubarraySumEqualsK.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** the count of the engine's trace, in the drivers' format */
const expectedLine = ([nums, k]: Case) => String(def.generateSteps([...nums], { target: k }).at(-1)!.prefixMap!.result!.count);

/** an independent reference: every subarray, summed directly */
function exhaustive([nums, k]: Case): number {
  let count = 0;
  for (let s = 0; s < nums.length; s++) {
    let sum = 0;
    for (let e = s; e < nums.length; e++) {
      sum += nums[e];
      if (sum === k) count++;
    }
  }
  return count;
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
const rnd = random(560);
const next = () => rnd.next().value as number;

type Case = readonly [readonly number[], number];
const CASES: Case[] = [
  [[1, 2, 3], 3],
  [[1, 1, 1], 2],
  [[1, -1, 0], 0],
  [[0, 0, 0], 0],
  [[-1, -1, 1], 0],
  [[1, 2, 3], 10],
  [[3], 3],
  [[], 0],
  [[], 5],
  [Array(10).fill(0), 0],
  [Array(10).fill(999), 999],
  [Array(10).fill(-999), -999],
  [[999, -999, 999, -999, 999, -999, 999, -999, 999, -999], 0],
  [[3, 4, 7, 2, -3, 1, 4, 2], 7],
  [[1, -1, 1, -1, 1, -1], 0],
  [[5], -5],
  [[-2, 2, -2, 2], 2],
  [[2, 2, 2, 2, 2], 4],
  ...Array.from({ length: 82 }, (_, c): Case => {
    const n = Math.floor(next() * 11);
    const [lo, hi] = c % 2 ? [-3, 4] : [-999, 999];
    const nums = Array.from({ length: n }, () => lo + Math.floor(next() * (hi - lo + 1)));
    const k = n && next() < 0.7 ? Math.max(-999, Math.min(999, nums.slice(0, 1 + Math.floor(next() * n)).reduce((a, b) => a + b, 0))) : lo + Math.floor(next() * (hi - lo + 1));
    return [nums, k];
  }),
];
const STDIN = `${CASES.length}\n${CASES.map(([nums, k]) => [nums.length, k, ...nums].join(' ')).join('\n')}\n`;

describe("Subarray Sum Equals K — the engine's counts the listings are compared with", () => {
  it('the agreed examples, and every case against a direct search over every subarray', () => {
    expect(CASES).toHaveLength(100);
    expect(expectedLine([[1, 2, 3], 3])).toBe('2');
    expect(expectedLine([[1, 1, 1], 2])).toBe('2');
    expect(expectedLine([[1, -1, 0], 0])).toBe('3');
    expect(expectedLine([[0, 0, 0], 0])).toBe('6');
    expect(expectedLine([[-1, -1, 1], 0])).toBe('1');
    expect(expectedLine([[1, 2, 3], 10])).toBe('0');
    expect(expectedLine([[3], 3])).toBe('1');
    expect(expectedLine([[], 0])).toBe('0');
    for (const c of CASES) expect(expectedLine(c), JSON.stringify(c)).toBe(String(exhaustive(c)));
  });
});

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Subarray Sum Equals K — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and returns the engine's count for each of ${CASES.length} cases`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((c, x) => expect(lines[x], JSON.stringify(c)).toBe(expectedLine(c)));
    }, 180_000);
  });
}
