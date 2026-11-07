import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Last Stone Weight listings, compiled and run on THIS machine's compilers (a language whose compiler is not
 * installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed by a
 * small driver that:
 *   - builds the heap with the listing's own siftDown and prints it,
 *   - runs the rounds with the listing's own popMax and siftUp, printing the heap at each round's check,
 *   - prints what the listing's lastStoneWeight returns.
 * All of it must equal the engine's trace for the same stones: the same heap arrays (so the same tie-breaking), the same
 * rounds and the same answer, in every language. Compiling must print no warning (gcc/g++ -Wall -Wextra, javac -Xlint:all).
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface HeapStep {
  codeRef?: string;
  result?: 'true' | 'false';
  heap?: { heap: readonly number[]; result?: { value: number } };
}
interface HeapDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[]): HeapStep[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): HeapDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('heap-last-stone-weight')!;

const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

static void printHeap(int heap[], int size) {
    for (int k = 0; k < size; k++) printf(k ? ",%d" : "%d", heap[k]);
}

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int n;
        if (scanf("%d", &n) != 1) return 1;
        int stones[MAX_STONES];
        for (int k = 0; k < n; k++) if (scanf("%d", &stones[k]) != 1) return 1;
        int heap[MAX_STONES];
        int size = n;
        for (int k = 0; k < n; k++) heap[k] = stones[k];
        for (int i = n / 2 - 1; i >= 0; i--) siftDown(heap, n, i);
        printf("B=");
        printHeap(heap, size);
        printf(";S=");
        for (int round = 0;; round++) {
            if (round) printf("/");
            printHeap(heap, size);
            if (size <= 1) break;
            int y = popMax(heap, &size);
            int x = popMax(heap, &size);
            if (y != x) {
                heap[size++] = y - x;
                siftUp(heap, size - 1);
            }
        }
        printf(";R=%d\\n", lastStoneWeight(stones, n));
    }
    return 0;
}
`,
  cpp: `
#include <iostream>

static void printHeap(const vector<int>& heap) {
    for (size_t k = 0; k < heap.size(); k++) cout << (k ? "," : "") << heap[k];
}

int main() {
    int t;
    if (!(cin >> t)) return 1;
    while (t--) {
        int n;
        cin >> n;
        vector<int> stones(n);
        for (int k = 0; k < n; k++) cin >> stones[k];
        vector<int> heap = stones;
        for (int i = n / 2 - 1; i >= 0; i--) siftDown(heap, n, i);
        cout << "B=";
        printHeap(heap);
        cout << ";S=";
        for (int round = 0;; round++) {
            if (round) cout << "/";
            printHeap(heap);
            if (heap.size() <= 1) break;
            int y = popMax(heap);
            int x = popMax(heap);
            if (y != x) {
                heap.push_back(y - x);
                siftUp(heap, heap.size() - 1);
            }
        }
        cout << ";R=" << lastStoneWeight(stones) << "\\n";
    }
    return 0;
}
`,
  java: `

class Main {
    static String text(List<Integer> heap) {
        StringBuilder out = new StringBuilder();
        for (int k = 0; k < heap.size(); k++) out.append(k > 0 ? "," : "").append(heap.get(k));
        return out.toString();
    }

    public static void main(String[] args) {
        java.util.Scanner in = new java.util.Scanner(System.in);
        int t = in.nextInt();
        StringBuilder out = new StringBuilder();
        while (t-- > 0) {
            int n = in.nextInt();
            int[] stones = new int[n];
            for (int k = 0; k < n; k++) stones[k] = in.nextInt();
            List<Integer> heap = new ArrayList<>();
            for (int s : stones) heap.add(s);
            for (int i = n / 2 - 1; i >= 0; i--) LastStoneWeight.siftDown(heap, n, i);
            out.append("B=").append(text(heap)).append(";S=");
            for (int round = 0;; round++) {
                if (round > 0) out.append("/");
                out.append(text(heap));
                if (heap.size() <= 1) break;
                int y = LastStoneWeight.popMax(heap);
                int x = LastStoneWeight.popMax(heap);
                if (y != x) {
                    heap.add(y - x);
                    LastStoneWeight.siftUp(heap, heap.size() - 1);
                }
            }
            out.append(";R=").append(LastStoneWeight.lastStoneWeight(stones)).append("\\n");
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
        stones = [int(v) for v in data[pos + 1:pos + 1 + n]]
        pos += 1 + n
        heap = stones[:]
        for i in range(n // 2 - 1, -1, -1):
            sift_down(heap, n, i)
        rounds = []
        built = ",".join(map(str, heap))
        while True:
            rounds.append(",".join(map(str, heap)))
            if len(heap) <= 1:
                break
            y = pop_max(heap)
            x = pop_max(heap)
            if y != x:
                heap.append(y - x)
                sift_up(heap, len(heap) - 1)
        out.append("B=" + built + ";S=" + "/".join(rounds) + ";R=" + str(last_stone_weight(stones)))
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-lsw-'));
  dirs.push(dir);
  const run = (cmd: string, args: string[], stdin = '') => spawnSync(cmd, args, { cwd: dir, input: stdin, encoding: 'utf8', timeout: 60_000 });
  const source = def.code[lang] + '\n' + DRIVERS[lang];
  let compiled: ReturnType<typeof run> | null = null;
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
    fs.writeFileSync(path.join(dir, 'LastStoneWeight.java'), source);
    compiled = run('javac', ['-Xlint:all', 'LastStoneWeight.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** what the engine's trace says the driver prints for these stones */
function expectedLine(stones: readonly number[]): string {
  const steps = def.generateSteps([...stones]);
  const built = steps.find(s => s.codeRef === 'build-loop' && s.result === 'false')!.heap!.heap;
  const rounds = steps.filter(s => s.codeRef === 'smash-loop').map(s => s.heap!.heap.join(','));
  return `B=${built.join(',')};S=${rounds.join('/')};R=${steps.at(-1)!.heap!.result!.value}`;
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
const rnd = random(7071);
const next = () => rnd.next().value as number;

const CASES: number[][] = [
  [2, 7, 4, 1, 8, 1],
  [],
  [5],
  [4, 4],
  [9, 3],
  [3, 3, 3, 3],
  [3, 3, 3],
  [1, 2, 3, 4, 5, 6],
  [6, 5, 4, 3, 2, 1],
  [2, 2, 1, 1, 2],
  [999, 1],
  [999, 999, 998],
  [9, 5, 4],
  [5, 5],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  [1, 999, 500, 250, 125, 62, 31, 15, 7, 3],
  ...Array.from({ length: 60 }, (_, k) => Array.from({ length: Math.floor(next() * 11) }, () => 1 + Math.floor(next() * (k % 2 ? 6 : 999)))),
];
const STDIN = `${CASES.length}\n${CASES.map(c => [c.length, ...c].join(' ')).join('\n')}\n`;

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Last Stone Weight — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and gives the engine's heap, rounds and answer for ${CASES.length} inputs`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((stones, k) => expect(lines[k], JSON.stringify(stones)).toBe(expectedLine(stones)));
    }, 180_000);
  });
}
