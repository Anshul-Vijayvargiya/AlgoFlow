import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The four Merge k Sorted Lists listings, compiled and run on THIS machine's compilers (a language whose compiler is not
 * installed is skipped, and reported as skipped). Each listing is used exactly as the visualizer shows it, followed by a
 * small driver that builds the lists as linked nodes, calls the listing and walks the list it returns. Every language
 * must print the merged values of the engine's trace, and must have built the result out of the input nodes themselves:
 * the driver counts the returned nodes that are input nodes, each counted once ("reused=8/8"). Compiling must print no
 * warning (gcc/g++ -Wall -Wextra, javac -Xlint:all).
 *
 * Nodes of equal value may leave a library priority queue in another order than the C heap takes them, so the values are
 * compared, not which list each equal node came from.
 *
 * It lives with the tooling tests because it needs Node (child processes, temporary files), which the app's own
 * TypeScript project (src) does not have. The definition is loaded at run time, so this project does not type check src.
 */

type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';
/** the parts of the definition and its steps this test reads */
interface MergeDefinition {
  code: Record<ProgrammingLanguage, string>;
  generateSteps(input: number[], params: { texts: string[] }): { mergeK?: { result?: { values: readonly number[] } } }[];
}
const registryUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/engine/AlgorithmRegistry.ts')).href;
const registry = (await import(registryUrl)) as { getAlgorithmDefinition(id: string): MergeDefinition | undefined };

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = ['python3', 'python'].find(p => has(p, ['--version']));
const AVAILABLE: Record<ProgrammingLanguage, boolean> = {
  c: has('gcc', ['--version']),
  cpp: has('g++', ['--version']),
  java: has('javac', ['-version']) && has('java', ['-version']),
  python: Boolean(PYTHON),
};
const EXE = process.platform === 'win32' ? '.exe' : '';
const def = registry.getAlgorithmDefinition('heap-merge-k-sorted-lists')!;

/**
 * Every driver reads the number of inputs, then for each: k, and for each list its length and its values. It prints one
 * line per input: "R=" and the returned list's values separated by ",", then ";reused=" and how many of the returned
 * nodes are input nodes (each counted once) out of how many input nodes there are.
 */
const DRIVERS: Record<ProgrammingLanguage, string> = {
  c: `
#include <stdio.h>

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 1;
    while (t--) {
        int k;
        if (scanf("%d", &k) != 1) return 1;
        struct ListNode nodes[12] = {{0, NULL}};
        struct ListNode *lists[5] = {NULL};
        int total = 0;
        for (int i = 0; i < k; i++) {
            int n;
            if (scanf("%d", &n) != 1) return 1;
            lists[i] = n > 0 ? &nodes[total] : NULL;
            for (int j = 0; j < n; j++) {
                if (scanf("%d", &nodes[total].val) != 1) return 1;
                nodes[total].next = j + 1 < n ? &nodes[total + 1] : NULL;
                total++;
            }
        }
        struct ListNode *head = mergeKLists(lists, k);
        int seen[12] = {0};
        int reused = 0;
        int count = 0;
        printf("R=");
        for (struct ListNode *p = head; p != NULL && count <= 12; p = p->next) {
            printf(count ? ",%d" : "%d", p->val);
            count++;
            if (p >= nodes && p < nodes + total && !seen[p - nodes]) {
                seen[p - nodes] = 1;
                reused++;
            }
        }
        printf(";reused=%d/%d\\n", reused, total);
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
        int k;
        cin >> k;
        vector<ListNode> nodes;
        nodes.reserve(12);
        vector<ListNode *> lists;
        for (int i = 0; i < k; i++) {
            int n;
            cin >> n;
            ListNode *first = nullptr;
            ListNode *prev = nullptr;
            for (int j = 0; j < n; j++) {
                int v;
                cin >> v;
                nodes.push_back(ListNode(v));
                ListNode *cur = &nodes.back();
                if (prev != nullptr) prev->next = cur;
                else first = cur;
                prev = cur;
            }
            lists.push_back(first);
        }
        int total = (int)nodes.size();
        ListNode *head = Solution().mergeKLists(lists);
        vector<bool> seen(12, false);
        int reused = 0;
        int count = 0;
        cout << "R=";
        for (ListNode *p = head; p != nullptr && count <= 12; p = p->next) {
            cout << (count ? "," : "") << p->val;
            count++;
            int at = (int)(p - nodes.data());
            if (at >= 0 && at < total && p == &nodes[at] && !seen[at]) {
                seen[at] = true;
                reused++;
            }
        }
        cout << ";reused=" << reused << "/" << total << "\\n";
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
            int k = in.nextInt();
            ListNode[] lists = new ListNode[k];
            Set<ListNode> given = Collections.newSetFromMap(new IdentityHashMap<>());
            for (int i = 0; i < k; i++) {
                int n = in.nextInt();
                ListNode prev = null;
                for (int j = 0; j < n; j++) {
                    ListNode cur = new ListNode(in.nextInt());
                    given.add(cur);
                    if (prev == null) lists[i] = cur;
                    else prev.next = cur;
                    prev = cur;
                }
            }
            ListNode head = new Solution().mergeKLists(lists);
            Set<ListNode> seen = Collections.newSetFromMap(new IdentityHashMap<>());
            int reused = 0;
            int count = 0;
            out.append("R=");
            for (ListNode p = head; p != null && count <= 12; p = p.next) {
                if (count > 0) out.append(",");
                out.append(p.val);
                count++;
                if (given.contains(p) && seen.add(p)) reused++;
            }
            out.append(";reused=").append(reused).append("/").append(given.size()).append("\\n");
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
        k = int(data[pos])
        pos += 1
        lists = []
        given = {}
        for _ in range(k):
            n = int(data[pos])
            pos += 1
            first = prev = None
            for _ in range(n):
                cur = ListNode(int(data[pos]))
                pos += 1
                given[id(cur)] = cur
                if prev is None:
                    first = cur
                else:
                    prev.next = cur
                prev = cur
            lists.append(first)
        head = Solution().mergeKLists(lists)
        seen = set()
        values = []
        reused = 0
        p = head
        while p is not None and len(values) <= 12:
            values.append(str(p.val))
            if given.get(id(p)) is p and id(p) not in seen:
                seen.add(id(p))
                reused += 1
            p = p.next
        out.append("R=" + ",".join(values) + ";reused=" + str(reused) + "/" + str(len(given)))
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoflow-mergek-'));
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

const text = (lists: readonly (readonly number[])[]) => `[${lists.map(l => `[${l.join(',')}]`).join(',')}]`;
/** what the engine's trace says the driver prints for these lists: the merged values, made of all the input nodes */
function expectedLine(lists: readonly (readonly number[])[]): string {
  const values = def.generateSteps([], { texts: [text(lists)] }).at(-1)!.mergeK!.result!.values;
  const total = lists.reduce((sum, l) => sum + l.length, 0);
  return `R=${values.join(',')};reused=${total}/${total}`;
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
const rnd = random(2323);
const next = () => rnd.next().value as number;
const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));

/** a random input within the limits: each list ascending by construction (each value at least the one before it) */
function randomLists(c: number): number[][] {
  let room = 12;
  const [low, high] = c % 2 ? [0, 3] : [-999, 999];
  return Array.from({ length: int(0, 5) }, () => {
    const n = Math.min(int(0, 5), room);
    room -= n;
    const list: number[] = [];
    for (let j = 0; j < n; j++) list.push(int(j === 0 ? low : list[j - 1], high));
    return list;
  });
}

const CASES: number[][][] = [
  [[1, 4, 5], [1, 3, 4], [2, 6]],
  [],
  [[]],
  [[], []],
  [[1, 2, 3]],
  [[7]],
  [[], [1]],
  [[2], [1]],
  [[1], [1]],
  [[5], [1], [3], [2], [4]],
  [[2, 2], [2], [2, 2]],
  [[7, 7, 7, 7, 7], [7, 7, 7, 7, 7], [7, 7]],
  [[-5, -1, 3], [], [-2, 0]],
  [[-999, 999], [-999], [999]],
  [[9], [1, 2, 3, 4, 5], [8], [0, 6, 7]],
  [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]],
  [[5, 5, 5], [4, 4, 4], [3, 3], [2, 2], [1, 1]],
  [[1, 2, 3, 4, 5], [1, 2, 3], [2], [3, 4], [5]],
  ...Array.from({ length: 60 }, (_, c) => randomLists(c)),
];
const STDIN = `${CASES.length}\n${CASES.map(lists => [lists.length, ...lists.map(l => [l.length, ...l].join(' '))].join(' ')).join('\n')}\n`;

describe("Merge k Sorted Lists — the engine's results the listings are compared with", () => {
  it('the merged values are all the values in ascending order, for every case', () => {
    expect(expectedLine([[1, 4, 5], [1, 3, 4], [2, 6]])).toBe('R=1,1,2,3,4,4,5,6;reused=8/8');
    expect(expectedLine([])).toBe('R=;reused=0/0');
    expect(expectedLine([[], []])).toBe('R=;reused=0/0');
    for (const lists of CASES) {
      const all = lists.flat().sort((a, b) => a - b);
      expect(expectedLine(lists), text(lists)).toBe(`R=${all.join(',')};reused=${all.length}/${all.length}`);
    }
  });
});

for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
  describe.skipIf(!AVAILABLE[lang])(`Merge k Sorted Lists — the ${lang} listing (local compiler)`, () => {
    it(`compiles without a warning and merges each of ${CASES.length} inputs into the engine's result, out of the input nodes themselves`, () => {
      const { compiled, exec } = build(lang);
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(`${compiled.stdout}${compiled.stderr}`.trim(), 'compiler output').toBe('');
      const r = exec(STDIN);
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stdout.replace(/\r/g, '').trimEnd().split('\n');
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((lists, k) => expect(lines[k], text(lists)).toBe(expectedLine(lists)));
    }, 180_000);
  });
}
