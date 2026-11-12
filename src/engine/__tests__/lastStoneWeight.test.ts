import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRange, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { maxInputLength, validateAlgorithmInput } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { IMPLEMENTED_TOPICS } from '../../data/algorithmCatalog';
import type { ExecutionStep, MaxHeapView, ProgrammingLanguage } from '../../types/algorithm';

const ID = 'heap-last-stone-weight';
const def = getAlgorithmDefinition(ID)!;
const run = (...stones: number[]) => def.generateSteps(stones);
const view = (s: ExecutionStep): MaxHeapView => s.heap!;
const answer = (...stones: number[]) => view(run(...stones).at(-1)!).result!.value;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/**
 * The reference, sharing nothing with the heap: sort the stones, smash the two heaviest, repeat. It also gives the
 * (y, x) pairs in order and the stones left before each round.
 */
function reference(stones: readonly number[]) {
  let left = [...stones];
  const pairs: { y: number; x: number; left: number }[] = [];
  const rounds: number[][] = [];
  for (;;) {
    left.sort((a, b) => b - a);
    rounds.push([...left]);
    if (left.length <= 1) break;
    const [y, x, ...rest] = left;
    pairs.push({ y, x, left: y - x });
    left = y === x ? rest : [...rest, y - x];
  }
  return { value: left[0] ?? 0, pairs, rounds };
}

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}

/** every allowed length, both the full range of weights and a narrow one (many equal stones) */
function randomInputs(count: number): number[][] {
  const rnd = random(20261107);
  const next = () => rnd.next().value as number;
  return Array.from({ length: count }, (_, k) => {
    const high = k % 2 === 0 ? 999 : 6;
    return Array.from({ length: Math.floor(next() * 11) }, () => 1 + Math.floor(next() * high));
  });
}

const isMaxHeap = (h: readonly number[]) => h.every((v, k) => k === 0 || h[Math.floor((k - 1) / 2)] >= v);
const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

const EDGE = [[], [5], [4, 4], [9, 3], [2, 7, 4, 1, 8, 1], [3, 3, 3, 3], [3, 3, 3], [1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1], [2, 2, 1, 1, 2], [999, 1], [999, 999, 998], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], [1, 999, 500, 250, 125, 62, 31, 15, 7, 3]];

describe('Last Stone Weight: where it is listed and how it is drawn', () => {
  it('a new HEAP category, "HEAP & PRIORITY QUEUE", right after TREES; the BIT MANIPULATION order is untouched', () => {
    const order = ALGORITHM_CATEGORIES.map(c => c.id);
    expect(order.indexOf('HEAP')).toBe(order.indexOf('TREES') + 1);
    expect(ALGORITHM_CATEGORIES.find(c => c.id === 'HEAP')!.label).toBe('HEAP & PRIORITY QUEUE');
    expect(order.indexOf('BIT_MANIPULATION')).toBe(order.indexOf('BACKTRACKING') + 1);
    expect(order.indexOf('FUNDAMENTALS')).toBe(order.indexOf('BIT_MANIPULATION') + 1);
    expect(ALGORITHM_NAV.filter(a => a.category === 'HEAP').map(a => [a.id, a.name, a.implemented])).toEqual([
      [ID, 'Last Stone Weight', true],
      ['heap-merge-k-sorted-lists', 'Merge k Sorted Lists', true],
    ]);
    expect(IMPLEMENTED_TOPICS.find(t => t.topic === 'Heap & Priority Queue')!.algorithmIds).toEqual([ID, 'heap-merge-k-sorted-lists']);
  });

  it('an independent definition drawn as a heap; Heap Sort stays a SORTING algorithm drawn as bars', () => {
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
    expect(def).toMatchObject({ id: ID, category: 'HEAP', visual: 'heap', defaultInput: [2, 7, 4, 1, 8, 1] });
    expect(visualKindOf(def)).toBe('heap');
    const heapSort = getAlgorithmDefinition('heap-sort')!;
    expect(heapSort.category).toBe('SORTING');
    expect(visualKindOf(heapSort)).toBe('array');
    expect(buildExecution(ID, [2, 7, 4, 1, 8, 1]).status).toBe('ok');
  });

  it('complexity: O(n) best (every sift stops at once), O(n log n) otherwise, O(n) space', () => {
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)' });
    expect(def.description).toContain('O(n)');
    expect(def.description).toContain('O(log n)');
  });
});

describe('Heap Sort is unchanged', () => {
  // fingerprints recorded from the untouched Heap Sort (src/engine/algorithms/heapSort.ts) when Last Stone Weight was
  // added: two 32-bit FNV-style hashes of the JSON, enough to notice any change
  const hash = (x: unknown) => {
    const s = JSON.stringify(x);
    let a = 0x811c9dc5;
    let b = 0x9747b28c ^ s.length;
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x5bd1e995);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  };
  it.each([
    [[4, 10, 3, 5, 1, 8, 9], 181, 'fbf9eedeeeb3adda'],
    [[2, 7, 4, 1, 8, 1], 150, '5d8161cc8be9d133'],
    [[3, 3, 1, 2], 73, '6a02c78cea2e9cb9'],
    [[], 4, '8123a144c909f07f'],
  ])('%j: same steps as before', (input, count, fingerprint) => {
    const steps = getAlgorithmDefinition('heap-sort')!.generateSteps([...input]);
    expect(steps).toHaveLength(count);
    expect(hash(steps)).toBe(fingerprint);
  });
  it('same code, line maps, complexity, category and visual as before', () => {
    const d = getAlgorithmDefinition('heap-sort')!;
    expect(hash({ code: d.code, lineMap: d.lineMap, lineSpans: d.lineSpans, complexity: d.complexity, category: d.category, visual: d.visual ?? null })).toBe('77b33273dcf559db');
  });
});

describe('Last Stone Weight: the answer', () => {
  it('your example: [2, 7, 4, 1, 8, 1] → 1, smashing (8, 7), (4, 2), (2, 1), (1, 1)', () => {
    const last = run(2, 7, 4, 1, 8, 1).at(-1)!;
    expect(view(last).result).toEqual({ value: 1, text: 'The last stone weighs 1' });
    expect(view(last).smashes).toEqual([
      { y: 8, x: 7, left: 1 },
      { y: 4, x: 2, left: 2 },
      { y: 2, x: 1, left: 1 },
      { y: 1, x: 1, left: 0 },
    ]);
    expect(last.outcomeText).toBe('The last stone weighs 1');
  });

  it.each([
    ['the empty input → 0', [], 0, 'No stones at all: the answer is 0'],
    ['one stone → that stone', [5], 5, 'The last stone weighs 5'],
    ['two equal stones → 0', [4, 4], 0, 'No stone is left: the answer is 0'],
    ['two unequal stones → their difference', [9, 3], 6, 'The last stone weighs 6'],
    ['all equal, an even count → 0', [3, 3, 3, 3], 0, 'No stone is left: the answer is 0'],
    ['all equal, an odd count → one of them', [3, 3, 3], 3, 'The last stone weighs 3'],
    ['sorted ascending', [1, 2, 3, 4, 5, 6], 1, 'The last stone weighs 1'],
    ['sorted descending', [6, 5, 4, 3, 2, 1], 1, 'The last stone weighs 1'],
    ['repeated weights', [2, 2, 1, 1, 2], 0, 'No stone is left: the answer is 0'],
    ['the largest weight', [999, 1], 998, 'The last stone weighs 998'],
    ['large weights', [999, 999, 998], 998, 'The last stone weighs 998'],
  ] as const)('%s', (_name, stones, value, text) => {
    expect(view(run(...stones).at(-1)!).result).toEqual({ value, text });
  });

  it.each(EDGE.map(x => [x]))('%j: the answer and every smash agree with the sorting reference', stones => {
    const ref = reference(stones);
    expect(answer(...stones)).toBe(ref.value);
    expect(view(run(...stones).at(-1)!).smashes).toEqual(ref.pairs);
  });

  it('agrees with the sorting reference on 400 random inputs of every allowed length', () => {
    const lengths = new Set<number>();
    for (const stones of randomInputs(400)) {
      const ref = reference(stones);
      const last = run(...stones).at(-1)!;
      expect(view(last).result!.value, JSON.stringify(stones)).toBe(ref.value);
      expect(view(last).smashes, JSON.stringify(stones)).toEqual(ref.pairs);
      lengths.add(stones.length);
    }
    expect([...lengths].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

/** the codeRef without its call site: 'su-check@diff' → 'su-check' */
const base = (s: ExecutionStep) => s.codeRef!.split('@')[0];
const site = (s: ExecutionStep) => s.codeRef!.split('@')[1];

describe('Last Stone Weight: the heap at every step', () => {
  const ALL = [...EDGE, ...randomInputs(120)];

  it('the heap starts empty, each stone is inserted in input order, and after the build it is a max heap of the same stones', () => {
    for (const stones of ALL) {
      const steps = run(...stones);
      expect(view(steps[0]).heap, JSON.stringify(stones)).toEqual([]);
      expect(view(steps[0]).phase).toBe('build');
      const stored = steps.filter(s => s.codeRef === 'ins-store@stone').map(s => view(s).heap[view(s).inserted!]);
      expect(stored, JSON.stringify(stones)).toEqual(stones);
      const built = steps.find(s => s.codeRef === 'build-loop' && s.result === 'false')!;
      expect(isMaxHeap(view(built).heap), JSON.stringify(stones)).toBe(true);
      expect(sorted(view(built).heap)).toEqual(sorted(stones));
    }
  });

  it('the heap property holds whenever no sift is running: between insertions, at each round, after each popMax and after each insert', () => {
    for (const stones of ALL) {
      for (const s of run(...stones)) {
        const atRest =
          ['init-heap', 'set-size', 'build-loop', 'call-insert', 'smash-loop', 'pop-return', 'pop-y', 'pop-x', 'check-equal', 'insert-diff', 'return-result'].includes(base(s)) ||
          (base(s) === 'su-loop' && s.result === 'false') ||
          base(s) === 'su-break';
        if (atRest) expect(isMaxHeap(view(s).heap), `${JSON.stringify(stones)} step ${s.id} ${s.codeRef}`).toBe(true);
      }
    }
  });

  it('each round starts with exactly the stones the reference has left, and takes them heaviest first (x ≤ y)', () => {
    for (const stones of ALL) {
      const steps = run(...stones);
      const ref = reference(stones);
      const rounds = steps.filter(s => s.codeRef === 'smash-loop').map(s => sorted(view(s).heap).reverse());
      expect(rounds, JSON.stringify(stones)).toEqual(ref.rounds);
      const ys = steps.filter(s => s.codeRef === 'pop-y' && s.type === 'assign').map(s => view(s).y);
      const xs = steps.filter(s => s.codeRef === 'pop-x' && s.type === 'assign').map(s => view(s).x);
      expect(ys).toEqual(ref.pairs.map(p => p.y));
      expect(xs).toEqual(ref.pairs.map(p => p.x));
      // popMax takes the root, which is the largest stone in the heap at that moment
      for (const [k, s] of steps.entries()) {
        if (base(s) === 'pop-max') expect(view(s).top).toBe(Math.max(...view(steps[k - 1]).heap));
      }
    }
  });

  it('state is the heap array on every step; pointers, comparisons and swaps name positions inside it', () => {
    for (const stones of ALL) {
      const steps = run(...stones);
      for (const [k, s] of steps.entries()) {
        const v = view(s);
        const where = `${JSON.stringify(stones)} step ${s.id} ${s.codeRef}`;
        expect(s.state, where).toEqual([...v.heap]);
        expect(v.stones, where).toEqual(stones);
        for (const p of v.pointers) expect(p.index >= 0 && p.index < v.heap.length, `${where} pointer ${p.name}`).toBe(true);
        for (const c of v.compared ?? []) expect(c >= 0 && c < v.heap.length, `${where} compared ${c}`).toBe(true);
        if (v.swapped) {
          const [a, b] = v.swapped;
          const before = view(steps[k - 1]).heap;
          expect([v.heap[a], v.heap[b]], where).toEqual([before[b], before[a]]);
        }
      }
    }
  });

  it('every step inside insert or popMax names its call site: a stone or y − x for insert, y or x for popMax', () => {
    for (const stones of ALL) {
      const steps = run(...stones);
      for (const s of steps) {
        const calls = view(s).calls;
        if (calls.length < 2) {
          expect(site(s), `${s.id} ${s.codeRef}`).toBeUndefined();
          continue;
        }
        if (calls[1].startsWith('insert')) expect(site(s), `${s.id} ${s.codeRef}`).toBe(view(s).phase === 'build' ? 'stone' : 'diff');
        else expect(site(s), `${s.id} ${s.codeRef}`).toBe(view(s).popping);
      }
    }
  });

  it('a check of a missing child reads nothing: no comparison, and the message says so', () => {
    const steps = run(2, 7, 4, 1, 8, 1);
    const missing = steps.filter(s => (base(s) === 'sd-check-left' || base(s) === 'sd-check-right') && !view(s).compared?.length);
    expect(missing.length).toBeGreaterThan(0);
    for (const s of missing) {
      expect(s.result).toBe('false');
      expect(s.message).toMatch(/is not read$/);
    }
  });

  it('ties: an equal child does not move up when sifting down, and insert stops at an equal parent', () => {
    // [5, 5]: the second 5 goes in under the first; it is not heavier, so it stays
    const equal = run(5, 5);
    expect(equal.find(s => s.codeRef === 'su-check@stone' && s.heap!.heap.length === 2)!.result).toBe('true');
    expect(equal.filter(s => base(s) === 'su-swap')).toEqual([]);
    // [9, 5, 4]: 9 - 5 = 4 goes in under the 4 left at the root; it is not heavier, so it stays
    const steps = run(9, 5, 4);
    const store = steps.find(s => s.codeRef === 'ins-store@diff')!;
    expect(view(store).heap).toEqual([4, 4]);
    expect(steps.find(s => s.codeRef === 'su-check@diff')!.result).toBe('true');
    expect(steps.filter(s => s.codeRef === 'su-swap@diff')).toEqual([]);
    // [9, 5, 5, 1]: the first popMax moves 1 to the root, under two equal children 5 and 5; the left one wins the tie
    const pops = run(9, 5, 5, 1);
    expect(pops.find(s => s.codeRef === 'sd-check-right@y')).toMatchObject({ result: 'false', message: 'r=2 < size=3 && heap[2]=5 > heap[largest=1]=5 → FALSE' });
    expect(view(pops.find(s => s.codeRef === 'sd-swap@y')!).swapped).toEqual([0, 1]);
  });

  it('popMax: the last stone moves to the root, its slot goes, then i = 0 and the sift down; an unequal smash inserts y − x', () => {
    const steps = run(2, 7, 4, 1, 8, 1);
    const k = steps.findIndex(s => s.codeRef === 'pop-move-last@y');
    expect(view(steps[k - 1]).heap).toEqual([8, 7, 4, 1, 2, 1]);
    expect(view(steps[k])).toMatchObject({ heap: [1, 7, 4, 1, 2, 1], moved: { from: 5, to: 0 }, top: 8, popping: 'y' });
    expect(view(steps[k + 1])).toMatchObject({ heap: [1, 7, 4, 1, 2], removed: 1 });
    expect(steps[k + 2]).toMatchObject({ codeRef: 'pop-set-i@y', message: 'i = 0' });
    const store = steps.find(s => s.codeRef === 'ins-store@diff')!;
    // two stones out of six, one back in: it goes into the fifth slot
    expect(view(store)).toMatchObject({ y: 8, x: 7, diff: 1, inserted: 4 });
    expect(view(store).heap).toHaveLength(5);
    expect(view(store).heap[4]).toBe(1);
    // equal stones: nothing is inserted
    const equal = run(4, 4);
    expect(equal.filter(s => s.codeRef === 'insert-diff')).toEqual([]);
    expect(equal.find(s => s.codeRef === 'check-equal')).toMatchObject({ result: 'false', message: 'y=4 != x=4 → FALSE — both destroyed' });
  });

  it('the calls in progress: lastStoneWeight, then insert or popMax, outermost first', () => {
    const steps = run(2, 7, 4, 1, 8, 1);
    expect(view(steps.find(s => s.codeRef === 'su-loop@stone')!).calls).toEqual(['lastStoneWeight(stones, n)', 'insert(heap, &size, 2)']);
    expect(view(steps.find(s => s.codeRef === 'sd-largest@y')!).calls).toEqual(['lastStoneWeight(stones, n)', 'popMax(heap, &size)']);
    expect(view(steps.find(s => s.codeRef === 'su-loop@diff')!).calls).toEqual(['lastStoneWeight(stones, n)', 'insert(heap, &size, 1)']);
    expect(view(steps.at(-1)!).calls).toEqual([]);
  });
});

describe('Last Stone Weight: the steps', () => {
  it('the empty input: the empty heap, size = 0, the build check, the loop check, the return', () => {
    expect(run().map(s => s.codeRef)).toEqual(['init-heap', 'set-size', 'build-loop', 'smash-loop', 'return-result']);
    expect(run().map(s => s.state)).toEqual([[], [], [], [], []]);
    expect(run()[0].message).toBe('heap = an empty array with room for 1 stone');
  });

  it('one stone: inserted at the root, then nothing to smash', () => {
    expect(run(5).map(s => s.codeRef)).toEqual(['init-heap', 'set-size', 'build-loop', 'call-insert', 'ins-index@stone', 'ins-store@stone', 'su-loop@stone', 'build-loop', 'build-loop', 'smash-loop', 'return-result']);
  });

  it('[4, 4]: the exact order of statements, through both insertions and both popMax calls', () => {
    const pop = (w: 'y' | 'x') => [
      `pop-${w}`, `pop-max@${w}`, `pop-move-last@${w}`, `pop-shrink@${w}`, `pop-set-i@${w}`,
      `sd-largest@${w}`, `sd-left@${w}`, `sd-right@${w}`, `sd-check-left@${w}`, `sd-check-right@${w}`, `sd-check-done@${w}`, `sd-break@${w}`,
      `pop-return@${w}`, `pop-${w}`,
    ];
    expect(run(4, 4).map(s => s.codeRef)).toEqual([
      'init-heap', 'set-size',
      'build-loop', 'call-insert', 'ins-index@stone', 'ins-store@stone', 'su-loop@stone', 'build-loop',
      'build-loop', 'call-insert', 'ins-index@stone', 'ins-store@stone', 'su-loop@stone', 'su-parent@stone', 'su-check@stone', 'su-break@stone', 'build-loop',
      'build-loop',
      'smash-loop',
      ...pop('y'),
      ...pop('x'),
      'check-equal', 'smash-loop', 'return-result',
    ]);
  });

  it('every codeRef of the listings is reached by some input, and every step highlights a line in every language', () => {
    const reached = new Set<string>();
    for (const stones of [...EDGE, ...randomInputs(60)]) {
      for (const s of run(...stones)) {
        reached.add(s.codeRef!);
        for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, s.codeRef), `${lang} ${s.codeRef}`).not.toBeNull();
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(def.lineMap.cpp).sort());
    for (const lang of LANGUAGES) expect(Object.keys(def.lineMap[lang]).sort(), lang).toEqual(Object.keys(def.lineMap.cpp).sort());
  });

  it('no message or explanation shows undefined or NaN', () => {
    for (const stones of [...EDGE, ...randomInputs(60)]) {
      for (const s of run(...stones)) expect(`${s.message} ${s.explanation ?? ''} ${s.actionLabel ?? ''}`, `${JSON.stringify(stones)} step ${s.id}`).not.toMatch(/undefined|NaN/);
    }
  });

  it('the largest input, 10 stones: at most 750 steps', () => {
    let most = 0;
    for (const stones of randomInputs(400).filter(a => a.length === 10)) most = Math.max(most, run(...stones).length);
    for (const stones of EDGE.filter(a => a.length === 10)) most = Math.max(most, run(...stones).length);
    expect(most).toBeGreaterThan(300);
    expect(most).toBeLessThanOrEqual(750);
    expect(run(2, 7, 4, 1, 8, 1)).toHaveLength(250);
  });
});

describe('Last Stone Weight: the input', () => {
  it('up to 10 whole numbers from 1 to 999; Randomize draws from 1 to 20 so equal stones happen', () => {
    expect(def.inputSpec).toEqual({ maxLength: 10, minValue: 1, randomValues: [1, 20] });
    expect(maxInputLength(def)).toBe(10);
    expect(validateAlgorithmInput(def, [], null).ok).toBe(true);
    expect(validateAlgorithmInput(def, [999, 1, 1, 1, 1, 1, 1, 1, 1, 1], null).ok).toBe(true);
  });

  it.each([
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'Too many values (11). The visualizer supports at most 10.'],
    [[3, 0, 2], 'Value 2 (0) is below 1: Last Stone Weight takes values from 1 to 999.'],
    [[-4], 'Value 1 (-4) is below 1: Last Stone Weight takes values from 1 to 999.'],
  ])('%j is refused: %s', (stones, message) => {
    expect(validateAlgorithmInput(def, stones, null)).toMatchObject({ ok: false, message });
    expect(() => def.generateSteps(stones)).toThrow(RangeError);
  });
});

describe('Last Stone Weight: the four listings', () => {
  const code = (lang: ProgrammingLanguage) => def.code[lang];
  const lineAt = (lang: ProgrammingLanguage, n: number) => code(lang).split('\n')[n - 1].trim();
  const line = (lang: ProgrammingLanguage, ref: string) => lineAt(lang, def.lineMap[lang][ref]);
  const INSERT = ['ins-index', 'ins-store', 'su-loop', 'su-parent', 'su-check', 'su-break', 'su-swap', 'su-move'];
  const POP = ['pop-max', 'pop-move-last', 'pop-shrink', 'pop-set-i', 'sd-largest', 'sd-left', 'sd-right', 'sd-check-left', 'sd-take-left', 'sd-check-right', 'sd-take-right', 'sd-check-done', 'sd-break', 'sd-swap', 'sd-move', 'pop-return'];
  const TOP = ['init-heap', 'set-size', 'build-loop', 'call-insert', 'smash-loop', 'pop-y', 'pop-x', 'check-equal', 'insert-diff', 'return-result'];

  it('C writes the heap out (insert, popMax, swap); Java and C++ use their priority queue, Python heapq', () => {
    expect(code('c')).not.toMatch(/priority_queue|PriorityQueue|heapq/);
    for (const fn of ['void swap(int *a, int *b) {', 'void insert(int heap[], int *size, int val) {', 'int popMax(int heap[], int *size) {', 'int lastStoneWeight(int stones[], int n) {']) expect(code('c')).toContain(fn);
    expect(code('cpp')).toContain('priority_queue<int> pq;');
    expect(code('java')).toContain('new PriorityQueue<>(Collections.reverseOrder());');
    expect(code('python')).toContain('heapq.heapify(heap)');
    expect(code('python')).toContain('heap = [-s for s in stones]');
  });

  it('C: a child must be strictly greater, insert stops at a parent that is at least as large (the trace\'s tie-breaking)', () => {
    for (const w of ['y', 'x']) {
      expect(line('c', `sd-check-left@${w}`)).toBe('if (l < *size && heap[l] > heap[largest])');
      expect(line('c', `sd-check-right@${w}`)).toBe('if (r < *size && heap[r] > heap[largest])');
    }
    for (const s of ['stone', 'diff']) expect(line('c', `su-check@${s}`)).toBe('if (heap[parent] >= heap[i])');
  });

  it('C: both call sites of insert, and of popMax, highlight the same statements, in trace order', () => {
    for (const ref of INSERT) expect(def.lineMap.c[`${ref}@stone`], ref).toBe(def.lineMap.c[`${ref}@diff`]);
    for (const ref of POP) expect(def.lineMap.c[`${ref}@y`], ref).toBe(def.lineMap.c[`${ref}@x`]);
    const order = [...INSERT.map(r => `${r}@stone`), ...POP.map(r => `${r}@y`), ...TOP];
    const lines = order.map(ref => def.lineMap.c[ref]);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it('the library listings: each step inside insert or popMax highlights the library call of its call site', () => {
    const SITE_LINES: Record<'cpp' | 'java' | 'python', Record<string, string>> = {
      cpp: { stone: 'pq.push(s);', diff: 'pq.push(y - x);', y: 'pq.pop();', x: 'pq.pop();' },
      java: { stone: 'pq.add(s);', diff: 'pq.add(y - x);', y: 'int y = pq.poll();', x: 'int x = pq.poll();' },
      python: { stone: 'heapq.heapify(heap)', diff: 'heapq.heappush(heap, -(y - x))', y: 'y = -heapq.heappop(heap)', x: 'x = -heapq.heappop(heap)' },
    };
    for (const lang of ['cpp', 'java', 'python'] as const) {
      for (const s of ['stone', 'diff']) for (const ref of INSERT) expect(line(lang, `${ref}@${s}`), `${lang} ${ref}@${s}`).toBe(SITE_LINES[lang][s]);
      for (const w of ['y', 'x']) {
        for (const ref of POP) {
          // C++ reads the root with top() before pop() removes it
          const expected = lang === 'cpp' && ref === 'pop-max' ? `int ${w} = pq.top();` : SITE_LINES[lang][w];
          expect(line(lang, `${ref}@${w}`), `${lang} ${ref}@${w}`).toBe(expected);
        }
      }
      // the y pop() comes before the x pop()
      expect(def.lineMap[lang]['sd-swap@y'], lang).toBeLessThan(def.lineMap[lang]['sd-swap@x']);
      const lines = TOP.map(ref => def.lineMap[lang][ref]);
      expect(lines, lang).toEqual([...lines].sort((a, b) => a - b));
    }
  });

  it('the top-level statements, in every language', () => {
    const EXPECTED: Record<string, Record<ProgrammingLanguage, string>> = {
      'init-heap': { c: 'int heap[n > 0 ? n : 1];', cpp: 'priority_queue<int> pq;', java: 'PriorityQueue<Integer> pq =', python: 'heap = [-s for s in stones]' },
      'build-loop': { c: 'for (int i = 0; i < n; i++) {', cpp: 'for (int s : stones) {', java: 'for (int s : stones) {', python: 'heapq.heapify(heap)' },
      'smash-loop': { c: 'while (size > 1) {', cpp: 'while (pq.size() > 1) {', java: 'while (pq.size() > 1) {', python: 'while len(heap) > 1:' },
      'pop-y': { c: 'int y = popMax(heap, &size);', cpp: 'int y = pq.top();', java: 'int y = pq.poll();', python: 'y = -heapq.heappop(heap)' },
      'check-equal': { c: 'if (y != x) {', cpp: 'if (y != x) {', java: 'if (y != x) {', python: 'if y != x:' },
      'insert-diff': { c: 'insert(heap, &size, y - x);', cpp: 'pq.push(y - x);', java: 'pq.add(y - x);', python: 'heapq.heappush(heap, -(y - x))' },
      'return-result': { c: 'return size == 0 ? 0 : heap[0];', cpp: 'return pq.empty() ? 0 : pq.top();', java: 'return pq.isEmpty() ? 0 : pq.poll();', python: 'return -heap[0] if heap else 0' },
    };
    for (const [ref, byLang] of Object.entries(EXPECTED)) for (const lang of LANGUAGES) expect(line(lang, ref), `${lang} ${ref}`).toBe(byLang[lang]);
  });

  it('Java creates its priority queue over two lines: that step highlights both; every other step one line', () => {
    const r = resolveCodeRange(def, 'java', 'init-heap')!;
    expect(code('java').split('\n').slice(r.start - 1, r.end).map(l => l.trim())).toEqual(['PriorityQueue<Integer> pq =', 'new PriorityQueue<>(Collections.reverseOrder());']);
    for (const lang of LANGUAGES) {
      for (const ref of Object.keys(def.lineMap[lang])) {
        if (lang === 'java' && (ref === 'init-heap' || ref === 'set-size')) continue;
        const range = resolveCodeRange(def, lang, ref)!;
        expect(range.end - range.start, `${lang} ${ref}`).toBe(0);
      }
    }
  });

  it('C: the heap array has at least one slot (an array of 0 elements is undefined in C), and no main()', () => {
    expect(code('c')).toContain('int heap[n > 0 ? n : 1];');
    expect(code('c')).not.toMatch(/\bmain\s*\(/);
  });
});
