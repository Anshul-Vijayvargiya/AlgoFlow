import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Last Stone Weight listings, compiled and run on THIS machine's compilers (a language whose compiler is not
 * installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed by a
 * small driver:
 *   - C (the listing the steps follow, with the heap written out): the driver inserts the stones with the listing's own
 *     insert and prints the heap, runs the rounds with its own popMax and insert, printing the heap at each round's
 *     check, then prints what the listing's lastStoneWeight returns. All of it must equal the engine's trace: the same
 *     heap arrays (so the same tie-breaking), the same rounds and the same answer.
 *   - Java, C++, Python (library priority queues, whose heap is not reachable from outside lastStoneWeight): the driver
 *     prints what Solution().lastStoneWeight returns, which must equal the engine's answer.
 * Compiling must print no warning (gcc/g++ -Wall -Wextra, javac -Xlint:all).
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
static void printHeap(int heap[], int size) {
    for (int k = 0; k < size; k++) printf(k ? ",%d" : "%d", heap[k]);
}

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int n;
        if (scanf("%d", &n) != 1) return 1;
        int stones[10];
        for (int k = 0; k < n; k++) if (scanf("%d", &stones[k]) != 1) return 1;
        int heap[10];
        int size = 0;
        for (int k = 0; k < n; k++) insert(heap, &size, stones[k]);
        printf("B=");
        printHeap(heap, size);
        printf(";S=");
        for (int round = 0;; round++) {
            if (round) printf("/");
            printHeap(heap, size);
            if (size <= 1) break;
            int y = popMax(heap, &size);
            int x = popMax(heap, &size);
            if (y != x) insert(heap, &size, y - x);
        }
        printf(";R=%d\\n", lastStoneWeight(stones, n));
    }
    return 0;
}
`,
  cpp: `
int main() {
    int t;
    if (!(cin >> t)) return 1;
    while (t--) {
        int n;
        cin >> n;
        vector<int> stones(n);
        for (int k = 0; k < n; k++) cin >> stones[k];
        cout << "R=" << Solution().lastStoneWeight(stones) << "\\n";
    }
    return 0;
}
`,
  java: `

class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int t = in.nextInt();
        StringBuilder out = new StringBuilder();
        while (t-- > 0) {
            int n = in.nextInt();
            int[] stones = new int[n];
            for (int k = 0; k < n; k++) stones[k] = in.nextInt();
            out.append("R=").append(new Solution().lastStoneWeight(stones)).append("\\n");
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
        out.append("R=" + str(Solution().lastStoneWeight(stones)))
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
    fs.writeFileSync(path.join(dir, 'Main.java'), source);
    compiled = run('javac', ['-Xlint:all', 'Main.java']);
    exec = stdin => run('java', ['-cp', '.', 'Main'], stdin);
  } else {
    fs.writeFileSync(path.join(dir, 'main.py'), source);
    compiled = run(PYTHON!, ['-m', 'py_compile', 'main.py']);
    exec = stdin => run(PYTHON!, ['main.py'], stdin);
  }
  return { compiled, exec };
}

/** what the engine's trace says the driver prints for these stones: C the heap and the rounds too, the others the answer */
function expectedLine(lang: ProgrammingLanguage, stones: readonly number[]): string {
  const steps = def.generateSteps([...stones]);
  const answer = `R=${steps.at(-1)!.heap!.result!.value}`;
  if (lang !== 'c') return answer;
  const built = steps.find(s => s.codeRef === 'build-loop' && s.result === 'false')!.heap!.heap;
  const rounds = steps.filter(s => s.codeRef === 'smash-loop').map(s => s.heap!.heap.join(','));
  return `B=${built.join(',')};S=${rounds.join('/')};${answer}`;
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
  [9, 5, 5, 1],
  [5, 5],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  [1, 999, 500, 250, 125, 62, 31, 15, 7, 3],
  ...Array.from({ length: 60 }, (_, k) => Array.from({ length: Math.floor(next() * 11) }, () => 1 + Math.floor(next() * (k % 2 ? 6 : 999)))),
];
const STDIN = `${CASES.length}\n${CASES.map(c => [c.length, ...c].join(' ')).join('\n')}\n`;

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Last Stone Weight — the ${lang} listing (local compiler)`, () => {
    const what = lang === 'c' ? "the engine's heap, rounds and answer" : "the engine's answer";
    it(`compiles without a warning and gives ${what} for ${CASES.length} inputs`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((stones, k) => expect(lines[k], JSON.stringify(stones)).toBe(expectedLine(lang, stones)));
    }, 180_000);
  });
}
