import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Best Time to Buy and Sell Stock listings, compiled and run on THIS machine's compilers (a language whose
 * compiler is not installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows
 * it, followed by a small driver that reads each price list, calls the listing and prints what it returns. Every language
 * must print exactly the profit of the engine's trace. Compiling must print no warning (gcc/g++ -Wall -Wextra, javac
 * -Xlint:all).
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface StockDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[]): { stock?: { result?: { profit: number } } }[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): StockDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('array-buy-sell-stock')!;

/** every driver reads the number of lists, then each list's length and prices, and prints one profit per line */
const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int n;
        if (scanf("%d", &n) != 1) return 1;
        int prices[10];
        for (int k = 0; k < n; k++) if (scanf("%d", &prices[k]) != 1) return 1;
        printf("%d\\n", maxProfit(prices, n));
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
        vector<int> prices(n);
        for (int k = 0; k < n; k++) cin >> prices[k];
        cout << maxProfit(prices) << "\\n";
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
            int[] prices = new int[n];
            for (int k = 0; k < n; k++) prices[k] = in.nextInt();
            out.append(BestTimeToBuyAndSellStock.maxProfit(prices)).append("\\n");
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
        prices = [int(v) for v in data[pos + 1:pos + 1 + n]]
        pos += 1 + n
        out.append(str(max_profit(prices)))
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-stock-'));
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
    fs.writeFileSync(path.join(dir, 'BestTimeToBuyAndSellStock.java'), source);
    compiled = run('javac', ['-Xlint:all', 'BestTimeToBuyAndSellStock.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** the profit of the engine's trace, in the drivers' format */
const expectedLine = (prices: readonly number[]) => String(def.generateSteps([...prices]).at(-1)!.stock!.result!.profit);

/** an independent reference: the best later-minus-earlier difference over every pair of days, or 0 */
function bruteForce(prices: readonly number[]): number {
  let best = 0;
  for (let b = 0; b < prices.length; b++) for (let s = b + 1; s < prices.length; s++) best = Math.max(best, prices[s] - prices[b]);
  return best;
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
const rnd = random(121);
const next = () => rnd.next().value as number;

const CASES: number[][] = [
  [7, 1, 5, 3, 6, 4],
  [7, 6, 4, 3, 1],
  [5],
  [0],
  [1, 2],
  [2, 1],
  [3, 3, 3, 3],
  [1, 2, 3, 4, 5],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  [3, 8, 1, 2],
  [2, 4, 1, 7],
  [1, 5, 1, 5],
  [4, 1, 6, 1, 6],
  [0, 999],
  [999, 0, 999],
  [5, 0, 0, 3],
  [999, 999, 999, 999, 999, 999, 999, 999, 999, 999],
  [0, 999, 0, 999, 0, 999, 0, 999, 0, 999],
  ...Array.from({ length: 57 }, (_, c) => Array.from({ length: 1 + Math.floor(next() * 10) }, () => Math.floor(next() * (c % 2 ? 4 : 1000)))),
];
const STDIN = `${CASES.length}\n${CASES.map(c => [c.length, ...c].join(' ')).join('\n')}\n`;

describe("Best Time to Buy and Sell Stock — the engine's results the listings are compared with", () => {
  it('the examples, and every case against every buy-before-sell pair', () => {
    expect(CASES).toHaveLength(75);
    expect(expectedLine([7, 1, 5, 3, 6, 4])).toBe('5');
    expect(expectedLine([7, 6, 4, 3, 1])).toBe('0');
    expect(expectedLine([3, 8, 1, 2])).toBe('5');
    for (const prices of CASES) expect(expectedLine(prices), JSON.stringify(prices)).toBe(String(bruteForce(prices)));
  });
});

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Best Time to Buy and Sell Stock — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and returns the engine's profit for each of ${CASES.length} price lists`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((prices, k) => expect(lines[k], JSON.stringify(prices)).toBe(expectedLine(prices)));
    }, 180_000);
  });
}
