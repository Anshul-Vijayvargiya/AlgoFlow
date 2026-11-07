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
    expect(ALGORITHM_NAV.filter(a => a.category === 'HEAP').map(a => [a.id, a.name, a.implemented])).toEqual([[ID, 'Last Stone Weight', true]]);
    expect(IMPLEMENTED_TOPICS.find(t => t.topic === 'Heap & Priority Queue')!.algorithmIds).toEqual([ID]);
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

describe('Last Stone Weight: the heap at every step', () => {
  const ALL = [...EDGE, ...randomInputs(120)];

  it('the copy holds the stones in input order; after the build the array is a max heap of the same stones', () => {
    for (const stones of ALL) {
      const steps = run(...stones);
      expect(view(steps[0]).heap, JSON.stringify(stones)).toEqual(stones);
      expect(view(steps[0]).phase).toBe('copy');
      const built = steps.find(s => s.codeRef === 'build-loop' && s.result === 'false')!;
      expect(isMaxHeap(view(built).heap), JSON.stringify(stones)).toBe(true);
      expect(sorted(view(built).heap)).toEqual(sorted(stones));
    }
  });

  it('the heap property holds whenever no sift is running: at each round, after each popMax and after each siftUp', () => {
    for (const stones of ALL) {
      for (const s of run(...stones)) {
        const atRest = ['smash-loop', 'pop-return', 'pop-y', 'pop-x', 'check-equal', 'return-result'].includes(s.codeRef!) || (s.codeRef === 'su-loop' && s.result === 'false') || s.codeRef === 'su-return';
        if (atRest && view(s).phase !== 'copy') expect(isMaxHeap(view(s).heap), `${JSON.stringify(stones)} step ${s.id} ${s.codeRef}`).toBe(true);
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
      // popMax returns the root, which is the largest stone in the heap at that moment
      for (const [k, s] of steps.entries()) {
        if (s.codeRef === 'pop-top') expect(view(s).top).toBe(Math.max(...view(steps[k - 1]).heap));
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

  it('a check of a missing child reads nothing: no comparison, and the message says so', () => {
    const steps = run(2, 7, 4, 1, 8, 1);
    const missing = steps.filter(s => (s.codeRef === 'sd-check-left' || s.codeRef === 'sd-check-right') && !view(s).compared?.length);
    expect(missing.length).toBeGreaterThan(0);
    for (const s of missing) {
      expect(s.result).toBe('false');
      expect(s.message).toMatch(/is not read$/);
    }
  });

  it('ties: an equal child does not move up in siftDown, and siftUp stops at an equal parent', () => {
    // [5, 5]: the left child equals the root, so the build does not swap
    const build = run(5, 5).filter(s => s.codeRef === 'sd-swap' && view(s).phase === 'build');
    expect(build).toEqual([]);
    // [9, 5, 4]: 9 - 5 = 4 goes in under the 4 left at the root; it is not heavier, so it stays
    const steps = run(9, 5, 4);
    const append = steps.find(s => s.codeRef === 'push-diff')!;
    expect(view(append).heap).toEqual([4, 4]);
    const check = steps.find(s => s.codeRef === 'su-check')!;
    expect(check.result).toBe('true');
    expect(steps.filter(s => s.codeRef === 'su-swap')).toEqual([]);
  });

  it('popMax: the last stone moves to the root, its slot goes, then siftDown; an unequal smash appends y − x and sifts it up', () => {
    const steps = run(2, 7, 4, 1, 8, 1);
    const k = steps.findIndex(s => s.codeRef === 'pop-move-last');
    expect(view(steps[k - 1]).heap).toEqual([8, 7, 4, 1, 2, 1]);
    expect(view(steps[k])).toMatchObject({ heap: [1, 7, 4, 1, 2, 1], moved: { from: 5, to: 0 }, top: 8, popping: 'y' });
    expect(view(steps[k + 1])).toMatchObject({ heap: [1, 7, 4, 1, 2], removed: 1 });
    expect(steps[k + 2]).toMatchObject({ codeRef: 'pop-call-sift', message: 'Call siftDown(heap, 5, 0)' });
    const append = steps.find(s => s.codeRef === 'push-diff')!;
    // two stones out of six, one back in: it goes into the fifth slot
    expect(view(append)).toMatchObject({ y: 8, x: 7, diff: 1, inserted: 4 });
    expect(view(append).heap).toHaveLength(5);
    expect(view(append).heap[4]).toBe(1);
    // equal stones: nothing is appended
    const equal = run(4, 4);
    expect(equal.filter(s => s.codeRef === 'push-diff')).toEqual([]);
    expect(equal.find(s => s.codeRef === 'check-equal')).toMatchObject({ result: 'false', message: 'y=4 != x=4 → FALSE — both destroyed' });
  });

  it('the calls in progress: lastStoneWeight, then popMax, then siftDown, outermost first', () => {
    const steps = run(2, 7, 4, 1, 8, 1);
    const inner = steps.find(s => s.codeRef === 'sd-largest' && view(s).phase === 'smash')!;
    expect(view(inner).calls).toEqual(['lastStoneWeight(stones)', 'popMax(heap)', 'siftDown(heap, 5, 0)']);
    expect(view(steps.find(s => s.codeRef === 'su-loop')!).calls).toEqual(['lastStoneWeight(stones)', 'siftUp(heap, 4)']);
    expect(view(steps.at(-1)!).calls).toEqual([]);
  });
});

describe('Last Stone Weight: the steps', () => {
  it('the empty input and one stone: copy, n, the build check, the loop check, the return', () => {
    for (const stones of [[], [5]]) {
      expect(run(...stones).map(s => s.codeRef)).toEqual(['init-heap', 'set-n', 'build-loop', 'smash-loop', 'return-result']);
    }
    expect(run().map(s => s.state)).toEqual([[], [], [], [], []]);
  });

  it('[4, 4]: the exact order of statements, through both popMax calls', () => {
    expect(run(4, 4).map(s => s.codeRef)).toEqual([
      'init-heap', 'set-n',
      'build-loop', 'call-build', 'sd-largest', 'sd-left', 'sd-right', 'sd-check-left', 'sd-check-right', 'sd-check-done', 'sd-return', 'build-loop', 'build-loop',
      'smash-loop',
      'pop-y', 'pop-top', 'pop-move-last', 'pop-shrink', 'pop-call-sift', 'sd-largest', 'sd-left', 'sd-right', 'sd-check-left', 'sd-check-right', 'sd-check-done', 'sd-return', 'pop-return', 'pop-y',
      'pop-x', 'pop-top', 'pop-move-last', 'pop-shrink', 'pop-call-sift', 'sd-largest', 'sd-left', 'sd-right', 'sd-check-left', 'sd-check-right', 'sd-check-done', 'sd-return', 'pop-return', 'pop-x',
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
    expect(run(2, 7, 4, 1, 8, 1)).toHaveLength(244);
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
  const line = (lang: ProgrammingLanguage, ref: string) => code(lang).split('\n')[def.lineMap[lang][ref] - 1].trim();

  it('hand-written heap operations in every language: no library priority queue or heap module', () => {
    for (const lang of LANGUAGES) {
      expect(code(lang), lang).not.toMatch(/priority_queue|PriorityQueue|heapq|make_heap|push_heap|pop_heap/);
      expect(code(lang), lang).toMatch(/sift_?[dD]own/);
      expect(code(lang), lang).toMatch(/sift_?[uU]p/);
      expect(code(lang), lang).toMatch(/pop_?[mM]ax/);
    }
  });

  it('the same tie-breaking everywhere: a child must be strictly greater, siftUp stops at a parent that is at least as large', () => {
    for (const lang of LANGUAGES) {
      expect(line(lang, 'sd-check-left'), lang).toMatch(/heap(\[l\]|\.get\(l\)) > heap(\[largest\]|\.get\(largest\))/);
      expect(line(lang, 'sd-check-right'), lang).toMatch(/heap(\[r\]|\.get\(r\)) > heap(\[largest\]|\.get\(largest\))/);
      expect(line(lang, 'su-check'), lang).toMatch(/heap(\[parent\]|\.get\(parent\)) >= heap(\[i\]|\.get\(i\))/);
    }
  });

  it('the functions come in the same order, and each listing runs the statements in trace order', () => {
    const order = ['sd-largest', 'sd-left', 'sd-right', 'sd-check-left', 'sd-check-right', 'sd-check-done', 'sd-swap', 'sd-move', 'su-loop', 'su-parent', 'su-check', 'su-swap', 'su-move', 'pop-top', 'pop-move-last', 'pop-shrink', 'pop-call-sift', 'pop-return', 'init-heap', 'set-n', 'build-loop', 'call-build', 'smash-loop', 'pop-y', 'pop-x', 'check-equal', 'push-diff', 'call-siftup', 'return-result'];
    for (const lang of LANGUAGES) {
      const lines = order.map(ref => def.lineMap[lang][ref]);
      expect(lines, lang).toEqual([...lines].sort((a, b) => a - b));
    }
  });

  it('C++ computes n / 2 - 1 on an int, never on the unsigned heap.size() (an empty heap would wrap around)', () => {
    expect(line('cpp', 'set-n')).toBe('int n = heap.size();');
    expect(line('cpp', 'build-loop')).toBe('for (int i = n / 2 - 1; i >= 0; i--)');
    expect(code('cpp')).not.toMatch(/heap\.size\(\) \/ 2/);
  });

  it('C and Java swap through a temporary over three lines, and copy over two; each such step highlights all of them', () => {
    for (const lang of ['c', 'java'] as const) {
      for (const ref of ['sd-swap', 'su-swap']) {
        const r = resolveCodeRange(def, lang, ref)!;
        expect(r.end - r.start, `${lang} ${ref}`).toBe(2);
        expect(code(lang).split('\n')[r.end - 1], `${lang} ${ref}`).toMatch(/= temp;|, temp\);/);
      }
      const copy = resolveCodeRange(def, lang, 'init-heap')!;
      expect(code(lang).split('\n').slice(copy.start - 1, copy.end).join('\n'), lang).toMatch(lang === 'c' ? /memcpy\(heap, stones/ : /for \(int s : stones\) heap\.add\(s\);/);
    }
    for (const lang of ['cpp', 'python'] as const) {
      for (const ref of ['sd-swap', 'su-swap', 'init-heap']) expect(resolveCodeRange(def, lang, ref)!.end - resolveCodeRange(def, lang, ref)!.start, `${lang} ${ref}`).toBe(0);
    }
  });

  it('C holds up to MAX_STONES = 10 stones, the same limit as the visualizer', () => {
    expect(code('c')).toContain('#define MAX_STONES 10');
    expect(code('c')).toContain('int heap[MAX_STONES];');
  });
});
