import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateTextDraft, validateTextField } from '../inputParsing';
import { MAX_LISTS, MAX_LIST_NODES, MAX_TOTAL_NODES, parseSortedLists, sortedListsFromText } from '../linkedList/sortedLists';
import { MERGE_K_FIELD, POP_REFS, PUSH_REFS, PUSH_SITES } from '../algorithms/heap/mergeKSortedLists';
import { LANGUAGES, TEXT_INPUTS, makeRng } from './testUtils';
import type { ExecutionStep, MergeKListsView } from '../../types/algorithm';

const ID = 'heap-merge-k-sorted-lists' as const;
const def = getAlgorithmDefinition(ID)!;
const text = (lists: readonly (readonly number[])[]) => `[${lists.map(l => `[${l.join(',')}]`).join(',')}]`;
/** the trace for these lists; generated once per input (the tests only read it) */
const traces = new Map<string, ExecutionStep[]>();
const run = (lists: readonly (readonly number[])[] | string): ExecutionStep[] => {
  const input = typeof lists === 'string' ? lists : text(lists);
  if (!traces.has(input)) traces.set(input, def.generateSteps([], { texts: [input] }));
  return traces.get(input)!;
};
const view = (s: ExecutionStep) => s.mergeK!;
const last = (steps: ExecutionStep[]) => view(steps.at(-1)!);
/** an independent reference: all the values, sorted */
const reference = (lists: readonly (readonly number[])[]) => lists.flat().sort((a, b) => a - b);
const refs = (steps: ExecutionStep[]) => steps.map(s => s.codeRef);

/** seeded random inputs within the limits: 0 to 5 lists of 0 to 5 nodes, at most 12 nodes; a small range gives many ties */
function randomLists(count: number, seed: number): number[][][] {
  const rng = makeRng(seed);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  return Array.from({ length: count }, (_, c) => {
    const k = int(0, MAX_LISTS);
    let room = MAX_TOTAL_NODES;
    const [low, high] = c % 3 === 0 ? [0, 3] : c % 3 === 1 ? [-999, 999] : [-9, 9];
    return Array.from({ length: k }, () => {
      const n = Math.min(int(0, MAX_LIST_NODES), room);
      room -= n;
      // sorted by insertion, not by a library sort: each value is at least the one before it
      const list: number[] = [];
      for (let j = 0; j < n; j++) list.push(int(j === 0 ? low : list[j - 1], high));
      return list;
    });
  });
}
const RANDOM = randomLists(200, 2323);
const FIXED: number[][][] = TEXT_INPUTS[ID].map(([t]) => sortedListsFromText(t));
const ALL_INPUTS = [...FIXED, ...RANDOM];
/** the inputs whose every step is checked one by one: the fixed ones and the first random ones */
const STEP_INPUTS = [...FIXED, ...RANDOM.slice(0, 40)];

describe('Merge k Sorted Lists — the lists parser', () => {
  it('accepts no lists, empty lists and sorted lists, exactly as written', () => {
    for (const [input, lists] of [
      ['[]', []],
      ['[[]]', [[]]],
      ['[[],[]]', [[], []]],
      ['[[1,2],[3,4]]', [[1, 2], [3, 4]]],
      ['[[1,4,5],[1,3,4],[2,6]]', [[1, 4, 5], [1, 3, 4], [2, 6]]],
      ['  [ [1, 2] ,\t[ ] , [3] ]  ', [[1, 2], [], [3]]],
      ['[[7]]', [[7]]],
    ] as const) {
      expect(parseSortedLists(input), input).toEqual({ ok: true, lists });
    }
  });

  it('accepts duplicate values (within a list and across lists), negative values and the ends of the range', () => {
    expect(parseSortedLists('[[2,2,2],[2,2]]')).toEqual({ ok: true, lists: [[2, 2, 2], [2, 2]] });
    expect(parseSortedLists('[[-999,-5,0],[-5,999]]')).toEqual({ ok: true, lists: [[-999, -5, 0], [-5, 999]] });
    const zero = parseSortedLists('[[-0]]');
    expect(zero.ok && Object.is(zero.lists[0][0], 0)).toBe(true);
  });

  it('missing or malformed brackets are refused, naming the list when there is one', () => {
    for (const [input, message] of [
      ['', 'Enter the lists'],
      ['   ', 'Enter the lists'],
      ['1,2', 'missing their opening "["'],
      ['[1,2]]', 'Each list needs its own brackets'],
      ['[1, 2, 3]', 'Each list needs its own brackets'],
      ['[', 'missing their closing "]"'],
      ['[[1,2],[3', 'missing their closing "]"'],
      ['[[1,2]', 'List L0 is missing its closing "]"'],
      ['[[1],[2,3]', 'List L1 is missing its closing "]"'],
      ['[[1,[2]]]', 'List L0 contains another "["'],
      ['[[[1]]]', 'List L0 contains another "["'],
      ['[[1]]]', 'a "]" without a matching "["'],
      ['[]]', 'a "]" without a matching "["'],
      ['[[1] [2]]', 'Separate lists with a comma: found "[2]" after list L0'],
      ['[[1]x]', 'Separate lists with a comma: found "x" after list L0'],
      ['[[1],]', 'an extra comma after list L0'],
      ['[[1],,[2]]', 'an extra comma after list L0'],
      ['[,[1]]', 'a comma before the first list'],
      ['[[1],2]', 'found "2" where list L1 should start'],
    ] as const) {
      const r = parseSortedLists(input);
      expect(r.ok, input).toBe(false);
      if (!r.ok) expect(r.message, input).toContain(message);
    }
  });

  it('values that are empty, decimal, not numbers or out of range are refused, with the list and the value', () => {
    for (const [input, message] of [
      ['[[1,,2]]', 'List L0, value 2 is empty'],
      ['[[1,]]', 'List L0, value 2 is empty'],
      ['[[1],[1.5]]', 'List L1, value 1 ("1.5") is a decimal'],
      ['[[.5]]', 'List L0, value 1 (".5") is a decimal'],
      ['[[1,a]]', 'List L0, value 2 ("a") is not a whole number'],
      ['[[1 2]]', 'List L0, value 1 ("1 2") is not a whole number'],
      ['[[null]]', 'List L0, value 1 ("null") is not a whole number'],
      ['[[1],[2],[1000]]', 'List L2, value 1 (1000) is out of range: use values from -999 to 999'],
      ['[[-1000]]', 'List L0, value 1 (-1000) is out of range'],
    ] as const) {
      const r = parseSortedLists(input);
      expect(r.ok, input).toBe(false);
      if (!r.ok) expect(r.message, input).toContain(message);
    }
  });

  it('every limit: at most 5 lists, 5 nodes per list and 12 nodes in all', () => {
    expect([MAX_LISTS, MAX_LIST_NODES, MAX_TOTAL_NODES]).toEqual([5, 5, 12]);
    expect(parseSortedLists('[[],[],[],[],[]]').ok).toBe(true);
    expect(parseSortedLists('[[],[],[],[],[],[]]')).toEqual({ ok: false, message: 'Too many lists (6). The visualizer supports at most 5.' });
    expect(parseSortedLists('[[1,2,3,4,5]]').ok).toBe(true);
    expect(parseSortedLists('[[1],[1,2,3,4,5,6]]')).toEqual({ ok: false, message: 'List L1 has 6 nodes. The visualizer supports at most 5 per list.' });
    expect(parseSortedLists('[[1,2,3,4,5],[1,2,3,4,5],[1,2]]').ok).toBe(true);
    expect(parseSortedLists('[[1,2,3,4,5],[1,2,3,4,5],[1,2,3]]')).toEqual({ ok: false, message: 'Too many nodes (13 in all the lists). The visualizer supports at most 12.' });
    expect(parseSortedLists('[[1,2,3],[1,2,3],[1,2,3],[1,2,3],[1]]')).toEqual({ ok: false, message: 'Too many nodes (13 in all the lists). The visualizer supports at most 12.' });
  });

  it('a list that is not in ascending order is refused with the list and the positions; nothing is sorted for the user', () => {
    expect(parseSortedLists('[[1,3,2]]')).toEqual({
      ok: false,
      message: 'List L0 is not sorted: position 1 (3) is greater than position 2 (2). Every list must be in ascending order.',
    });
    expect(parseSortedLists('[[1,2],[],[5,4]]')).toEqual({
      ok: false,
      message: 'List L2 is not sorted: position 0 (5) is greater than position 1 (4). Every list must be in ascending order.',
    });
    expect(parseSortedLists('[[0,-1]]').ok).toBe(false);
    // the lists need not be in any order relative to each other
    expect(parseSortedLists('[[9],[1],[5]]')).toEqual({ ok: true, lists: [[9], [1], [5]] });
    expect(() => sortedListsFromText('[[2,1]]')).toThrow(RangeError);
  });

  it('the input field uses the rule: the form, the app and the generator all refuse the same text', () => {
    expect(MERGE_K_FIELD.rule).toBe('sorted-lists');
    expect(validateTextField('[[1,4,5],[1,3,4],[2,6]]', MERGE_K_FIELD)).toEqual({ ok: true, value: '[[1,4,5],[1,3,4],[2,6]]' });
    expect(validateTextField('[[3,1]]', MERGE_K_FIELD)).toEqual({ ok: false, message: expect.stringContaining('List L0 is not sorted') });
    expect(validateTextField('', MERGE_K_FIELD)).toEqual({ ok: false, message: 'Enter a value for "lists".' });
    expect(validateTextDraft(def, ['[[3,1]]'])).toEqual({ ok: false, field: 0, message: expect.stringContaining('List L0 is not sorted') });
    expect(validateTextDraft(def, ['[[1],[]]'])).toEqual({ ok: true, texts: ['[[1],[]]'] });
    expect(validateAlgorithmInput(def, [], null, null, null, ['[[1,2],[0]]'])).toEqual({ ok: true });
    expect(validateAlgorithmInput(def, [], null, null, null, ['[[1,2],[0],[],[],[],[]]']).ok).toBe(false);
    expect(validateAlgorithmInput(def, [1, 2], null, null, null, ['[[1]]'])).toEqual({ ok: false, canSortCopy: false, message: 'Merge k Sorted Lists takes strings, not an array.' });
    expect(validateAlgorithmInput(def, [], null, null, null, null).ok).toBe(false);
    for (const bad of ['[[3,1]]', '[1]', '[[1.5]]', '[[1,2,3,4,5,6]]']) expect(() => run(bad), bad).toThrow(RangeError);
  });

  it('algorithms without the rule are unaffected: only this field has it, and a field without it does not check lists', () => {
    const withRule = getAllAlgorithms().flatMap(d => (d.inputSpec?.texts ?? []).filter(f => f.rule === 'sorted-lists').map(() => d.id));
    expect(withRule).toEqual([ID]);
    const { rule: _rule, ...plain } = MERGE_K_FIELD;
    expect(validateTextField('[[3,1]]', plain).ok).toBe(true);
    const tree = getAlgorithmDefinition('tree-inorder')!.inputSpec!.texts![0];
    expect(validateTextField('[1, 2, 3]', tree).ok).toBe(true);
    expect(validateTextField('[[1], [2]]', tree).ok).toBe(false);
    const prefix = getAlgorithmDefinition('longest-common-prefix')!.inputSpec!.texts![0];
    expect(validateTextField('flower, flow, flight', prefix).ok).toBe(true);
  });
});

describe('Merge k Sorted Lists — the definition', () => {
  it('is a HEAP algorithm drawn as k lists, taking its lists as one string, O(N log k) time and O(k) space', () => {
    expect(def.name).toBe('Merge k Sorted Lists');
    expect(def.category).toBe('HEAP');
    expect(visualKindOf(def)).toBe('k-lists');
    expect(def.complexity).toMatchObject({ best: 'O(N log k)', average: 'O(N log k)', worst: 'O(N log k)', space: 'O(k)' });
    expect(def.defaultInput).toEqual([]);
    expect(def.inputSpec!.texts!.map(f => [f.label, f.rule, f.defaultValue])).toEqual([['lists', 'sorted-lists', '[[1,4,5],[1,3,4],[2,6]]']]);
    for (const [example] of def.inputSpec!.textExamples!) expect(parseSortedLists(example).ok, example).toBe(true);
    expect(def.inputSpec!.textExamples![0]).toEqual([MERGE_K_FIELD.defaultValue]);
  });

  it('called without parameters it runs on its example: [[1,4,5],[1,3,4],[2,6]] → 1 1 2 3 4 4 5 6', () => {
    const steps = def.generateSteps([]);
    expect(steps).toEqual(run('[[1,4,5],[1,3,4],[2,6]]'));
    expect(last(steps).result).toEqual({ values: [1, 1, 2, 3, 4, 4, 5, 6], text: 'Merged 8 nodes from 3 lists: 1 → 1 → 2 → 3 → 4 → 4 → 5 → 6' });
    expect(steps.at(-1)!.outcomeText).toBe('Merged 8 nodes from 3 lists: 1 → 1 → 2 → 3 → 4 → 4 → 5 → 6');
    expect(steps.at(-1)!.type).toBe('complete');
  });

  it('no listing sorts: the heap is written out in C, and the others use a priority queue', () => {
    for (const lang of LANGUAGES) expect(def.code[lang], lang).not.toMatch(/sort/i);
    expect(def.code.c).toContain('void push(struct ListNode *heap[], int *size, struct ListNode *node)');
    expect(def.code.c).toContain('struct ListNode *pop(struct ListNode *heap[], int *size)');
    expect(def.code.c).toContain('struct ListNode dummy;');
    expect(def.code.cpp).toContain('priority_queue<ListNode *, vector<ListNode *>, Compare> pq;');
    expect(def.code.java).toContain('new PriorityQueue<>((a, b) -> Integer.compare(a.val, b.val));');
    expect(def.code.python).toContain('heapq.heappush(heap, (lists[i].val, i, lists[i]))');
    // no listing creates a list node other than the dummy
    expect(def.code.c).not.toContain('malloc');
    expect(def.code.cpp.match(/ListNode dummy\(0\)/g)).toHaveLength(1);
    expect(def.code.cpp).not.toContain('new ');
    expect(def.code.java.match(/new ListNode\(/g)).toHaveLength(1);
    expect(def.code.python.match(/ListNode\(\)/g)).toHaveLength(1);
  });
});

describe('Merge k Sorted Lists — results', () => {
  it('empty inputs: no lists, one empty list, several empty lists', () => {
    for (const [input, message] of [
      ['[]', 'No lists: the merged list is empty (NULL)'],
      ['[[]]', 'The list is empty: the merged list is empty (NULL)'],
      ['[[],[]]', 'All 2 lists are empty: the merged list is empty (NULL)'],
      ['[[],[],[],[],[]]', 'All 5 lists are empty: the merged list is empty (NULL)'],
    ] as const) {
      const steps = run(input);
      expect(last(steps).result, input).toEqual({ values: [], text: message });
      expect(last(steps).merged).toEqual([]);
      expect(steps.every(s => view(s).heap.length === 0), input).toBe(true);
      expect(refs(steps).some(r => r?.includes('@')), input).toBe(false);
    }
    expect(refs(run('[]'))).toEqual(['init-heap', 'set-size', 'build-loop', 'init-dummy', 'init-tail', 'merge-loop', 'return-result']);
    expect(refs(run('[[]]'))).toEqual(['init-heap', 'set-size', 'build-loop', 'check-head', 'build-loop', 'init-dummy', 'init-tail', 'merge-loop', 'return-result']);
  });

  it('one list, single nodes, different lengths, duplicates, negatives and equal values everywhere', () => {
    for (const [lists, merged] of [
      [[[1, 2, 3]], [1, 2, 3]],
      [[[7]], [7]],
      [[[], [1]], [1]],
      [[[5], [1], [3], [2], [4]], [1, 2, 3, 4, 5]],
      [[[1, 4, 5], [1, 3, 4], [2, 6]], [1, 1, 2, 3, 4, 4, 5, 6]],
      [[[9], [1, 2, 3, 4, 5], [8], [0, 6, 7]], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
      [[[2, 2], [2], [2, 2]], [2, 2, 2, 2, 2]],
      [[[7, 7, 7, 7, 7], [7, 7, 7, 7, 7], [7, 7]], Array(12).fill(7)],
      [[[-5, -1, 3], [], [-2, 0]], [-5, -2, -1, 0, 3]],
      [[[-999, 999], [-999], [999]], [-999, -999, 999, 999]],
      [[[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ] as [number[][], number[]][]) {
      expect(last(run(lists)).result!.values, text(lists)).toEqual(merged);
    }
  });

  it('200 seeded random inputs (with many ties) and the fixed ones: the merged values are all the values, sorted', () => {
    expect(RANDOM.some(l => l.length === 0) && RANDOM.some(l => l.length === MAX_LISTS) && RANDOM.some(l => l.flat().length === MAX_TOTAL_NODES)).toBe(true);
    for (const lists of ALL_INPUTS) {
      const v = last(run(lists));
      expect(v.result!.values, text(lists)).toEqual(reference(lists));
      expect(v.merged.map(id => v.nodes.find(n => n.id === id)!.value), text(lists)).toEqual(reference(lists));
    }
  });

  it('every input node is in the merged list exactly once, and it is the same node: nothing is created or copied', () => {
    for (const lists of ALL_INPUTS) {
      const steps = run(lists);
      const given = lists.flatMap((list, i) => list.map((value, index) => ({ id: `l${i}n${index}`, value, list: i, index })));
      const v = last(steps);
      expect([...v.merged].sort(), text(lists)).toEqual(given.map(n => n.id).sort());
      expect(new Set(v.merged).size).toBe(v.merged.length);
      // the nodes are the input nodes on every step: same ids, values and places, never more and never fewer
      const want = JSON.stringify(given);
      expect(steps.every(s => JSON.stringify(view(s).nodes.map(({ next: _next, ...n }) => n)) === want), text(lists)).toBe(true);
      // a list's own nodes keep their order
      for (let i = 0; i < lists.length; i++) {
        const own = v.merged.filter(id => id.startsWith(`l${i}n`));
        expect(own, text(lists)).toEqual(lists[i].map((_, index) => `l${i}n${index}`));
      }
    }
  });

  it('the links: the merged chain follows next from the first merged node on every step, and ends at NULL', () => {
    for (const lists of STEP_INPUTS) {
      const steps = run(lists);
      for (const s of steps) {
        const v = view(s);
        const next = new Map(v.nodes.map(n => [n.id, n.next]));
        for (let j = 0; j + 1 < v.merged.length; j++) expect(next.get(v.merged[j]), `${text(lists)} step ${s.id}`).toBe(v.merged[j + 1]);
      }
      const v = last(steps);
      if (v.merged.length) expect(v.nodes.find(n => n.id === v.merged.at(-1))!.next, text(lists)).toBeNull();
      // before anything is linked, every node points to the next node of its own list
      const first = view(steps[0]);
      expect(first.heads, text(lists)).toEqual(lists.map((list, i) => (list.length ? `l${i}n0` : null)));
      for (const n of first.nodes) expect(n.next).toBe(n.index + 1 < lists[n.list].length ? `l${n.list}n${n.index + 1}` : null);
    }
  });

  it('equal values: the trace follows the C heap, e.g. [[1],[1]] takes the node of L0 first', () => {
    expect(last(run([[1], [1]])).merged).toEqual(['l0n0', 'l1n0']);
    expect(last(run([[2, 2], [2], [2, 2]])).result!.values).toEqual([2, 2, 2, 2, 2]);
  });
});

describe('Merge k Sorted Lists — the steps', () => {
  const isMinHeap = (v: MergeKListsView) => {
    const value = (id: string) => v.nodes.find(n => n.id === id)!.value;
    return v.heap.every((id, k) => k === 0 || value(v.heap[Math.floor((k - 1) / 2)]) <= value(id));
  };

  it('[[2],[1]] step by step: both heads pushed (the second sifts up), then two rounds of pop, link, advance', () => {
    const steps = run([[2], [1]]);
    const pop = ['pop-min', 'pop-move-last', 'pop-shrink', 'pop-set-i', 'sd-smallest', 'sd-left', 'sd-right', 'sd-check-left', 'sd-check-right', 'sd-check-done', 'sd-break', 'pop-return'].map(r => `${r}@node`);
    expect(refs(steps)).toEqual([
      'init-heap',
      'set-size',
      'build-loop',
      'check-head',
      'push-head',
      'ins-index@head',
      'ins-store@head',
      'su-loop@head',
      'build-loop',
      'check-head',
      'push-head',
      'ins-index@head',
      'ins-store@head',
      'su-loop@head',
      'su-parent@head',
      'su-check@head',
      'su-swap@head',
      'su-move@head',
      'su-loop@head',
      'build-loop',
      'init-dummy',
      'init-tail',
      'merge-loop',
      ...pop,
      'pop-node',
      'link-node',
      'advance-tail',
      'check-next',
      'merge-loop',
      ...pop,
      'pop-node',
      'link-node',
      'advance-tail',
      'check-next',
      'merge-loop',
      'return-result',
    ]);
    const at = (ref: string, k = 0) => steps.filter(s => s.codeRef === ref)[k];
    expect(at('su-check@head').message).toBe('heap[0]=2 <= heap[1]=1 → FALSE');
    expect(view(at('su-check@head'))).toMatchObject({ heap: ['l0n0', 'l1n0'], compared: [0, 1], pointers: [{ name: 'i', index: 1 }, { name: 'parent', index: 0 }], listIndex: 1 });
    expect(view(at('su-swap@head'))).toMatchObject({ heap: ['l1n0', 'l0n0'], swapped: [0, 1] });
    expect(view(at('init-dummy'))).toMatchObject({ phase: 'merge', dummy: true, tail: null, listIndex: null });
    expect(view(at('init-tail'))).toMatchObject({ tail: 'dummy', merged: [] });
    expect(view(at('pop-min@node'))).toMatchObject({ min: 'l1n0', heap: ['l1n0', 'l0n0'], calls: ['mergeKLists(lists, 2)', 'pop(heap, &size)'] });
    expect(view(at('pop-move-last@node'))).toMatchObject({ heap: ['l0n0', 'l0n0'], moved: { from: 1, to: 0 } });
    expect(view(at('pop-shrink@node'))).toMatchObject({ heap: ['l0n0'], removed: 'l0n0' });
    expect(view(at('pop-node'))).toMatchObject({ min: null, node: 'l1n0', merged: [], tail: 'dummy' });
    expect(view(at('link-node'))).toMatchObject({ merged: ['l1n0'], linked: 'l1n0', tail: 'dummy' });
    expect(at('link-node').message).toBe('tail->next = node — dummy → 1');
    expect(view(at('advance-tail'))).toMatchObject({ tail: 'l1n0' });
    expect(at('check-next').message).toBe('node->next != NULL → FALSE — list L1 is used up');
    expect(at('link-node', 1).message).toBe('tail->next = node — 1 → 2');
    expect(view(at('link-node', 1)).nodes.find(n => n.id === 'l1n0')!.next).toBe('l0n0');
    expect(view(at('return-result'))).toMatchObject({ phase: 'done', calls: [], merged: ['l1n0', 'l0n0'], tail: 'l0n0', heap: [] });
  });

  it('a node with a successor pushes it: [[1,3],[2]] replaces 1 by 3 in the heap before 2 is taken', () => {
    const steps = run([[1, 3], [2]]);
    const push = steps.find(s => s.codeRef === 'push-next')!;
    expect(push.message).toBe('push(heap, &size, node->next) — node 3 (L0)');
    expect(steps[push.id - 1].message).toBe('node->next != NULL → TRUE (next is 3)');
    expect(steps[push.id + 1].codeRef).toBe('ins-index@next');
    expect(view(steps.find(s => s.codeRef === 'ins-store@next')!)).toMatchObject({ heap: ['l1n0', 'l0n1'], inserted: 1, calls: ['mergeKLists(lists, 2)', 'push(heap, &size, 3 (L0))'] });
    expect(last(steps).result!.values).toEqual([1, 2, 3]);
  });

  it('ids count up from 0, the state is empty (the lists are not one array) and every step has its view', () => {
    for (const lists of STEP_INPUTS.slice(0, 25)) {
      const steps = run(lists);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
      for (const s of steps) {
        expect(s.state).toEqual([]);
        expect(s.mergeK, `step ${s.id}`).toBeDefined();
        expect(s.message.length).toBeGreaterThan(0);
        expect(s.explanation?.length).toBeGreaterThan(0);
        expect(view(s).lists).toEqual(lists);
      }
    }
  });

  it('between heap calls the heap is a min heap holding exactly the first unmerged node of every list', () => {
    for (const lists of STEP_INPUTS) {
      for (const s of run(lists)) {
        const v = view(s);
        expect(v.heap.length, `${text(lists)} step ${s.id}`).toBeLessThanOrEqual(Math.max(lists.length, 1));
        if (s.codeRef!.includes('@')) continue;
        expect(isMinHeap(v), `${text(lists)} step ${s.id} (${s.codeRef})`).toBe(true);
        if (s.codeRef !== 'merge-loop') continue;
        const fronts = lists.flatMap((list, i) => {
          const done = v.merged.filter(id => id.startsWith(`l${i}n`)).length;
          return done < list.length ? [`l${i}n${done}`] : [];
        });
        expect([...v.heap].sort(), `${text(lists)} step ${s.id}`).toEqual(fronts.sort());
      }
    }
  });

  it('the merged list is sorted on every step and only grows, one node per link-node step', () => {
    for (const lists of STEP_INPUTS) {
      const steps = run(lists);
      let before: readonly string[] = [];
      for (const s of steps) {
        const v = view(s);
        const values = v.merged.map(id => v.nodes.find(n => n.id === id)!.value);
        expect(values, `${text(lists)} step ${s.id}`).toEqual([...values].sort((a, b) => a - b));
        expect(v.merged.slice(0, before.length)).toEqual(before);
        expect(v.merged.length - before.length).toBe(s.codeRef === 'link-node' ? 1 : 0);
        expect(v.linked).toBe(s.codeRef === 'link-node' ? v.merged.at(-1) : undefined);
        before = v.merged;
      }
      expect(steps.filter(s => s.codeRef === 'link-node')).toHaveLength(lists.flat().length);
    }
  });

  it('the variables: i only in the build loop, min only inside pop, tail the dummy and then the node linked last', () => {
    for (const lists of STEP_INPUTS) {
      for (const s of run(lists)) {
        const v = view(s);
        const where = `${text(lists)} step ${s.id} (${s.codeRef})`;
        expect(v.listIndex !== null, where).toBe(v.phase === 'build' && s.codeRef !== 'init-heap' && s.codeRef !== 'set-size');
        expect(v.min !== null, where).toBe(/^(pop-|sd-).*@node$/.test(s.codeRef!));
        expect(v.dummy, where).toBe(v.phase !== 'build');
        if (v.phase === 'build') expect([v.tail, v.node, v.merged], where).toEqual([null, null, []]);
        if (v.tail !== null && v.tail !== 'dummy') expect(v.merged, where).toContain(v.tail);
        if (s.codeRef === 'advance-tail') expect(v.tail, where).toBe(v.merged.at(-1));
        if (s.codeRef === 'link-node') expect(v.node, where).toBe(v.merged.at(-1));
        // every position named or marked is inside the heap array
        for (const p of v.pointers) expect(p.index >= 0 && p.index < v.heap.length, where).toBe(true);
        for (const k of [...(v.compared ?? []), ...(v.swapped ?? []), ...(v.inserted !== undefined ? [v.inserted] : []), ...(v.moved ? [v.moved.from, v.moved.to] : [])]) {
          expect(k >= 0 && k < v.heap.length, where).toBe(true);
        }
        expect(v.calls.length, where).toBe(v.phase === 'done' ? 0 : s.codeRef!.includes('@') ? 2 : 1);
      }
    }
  });

  it('a comparison reads only nodes inside the heap, and says what it found', () => {
    for (const lists of STEP_INPUTS) {
      for (const s of run(lists)) {
        const v = view(s);
        if (!/^sd-check-(left|right)@/.test(s.codeRef!)) continue;
        if (v.compared!.length === 0) expect(s.message).toMatch(/is not read$/);
        else expect(s.message).toMatch(/→ (TRUE|FALSE)$/);
      }
    }
  });

  it('the trace stays short enough to step through: at most 450 steps at the limits', () => {
    let longest = 0;
    for (const lists of [...ALL_INPUTS, [[5, 5, 5], [4, 4, 4], [3, 3], [2, 2], [1, 1]], [[1, 2, 3], [1, 2, 3], [1, 2], [1, 2], [1, 2]], [[1, 6, 11], [2, 7, 12], [3, 8], [4, 9], [5, 10]]]) {
      longest = Math.max(longest, run(lists).length);
    }
    expect(longest).toBeGreaterThan(300);
    expect(longest).toBeLessThanOrEqual(450);
    expect(run('[[1,4,5],[1,3,4],[2,6]]')).toHaveLength(229);
  });
});

describe('Merge k Sorted Lists — snapshots are immutable', () => {
  const frozenDeep = (value: unknown): boolean =>
    value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value as object).every(frozenDeep));

  it('every view is frozen all the way down: the view, its arrays, the nodes, the pointers and the result', () => {
    for (const lists of STEP_INPUTS.slice(0, 30)) {
      for (const s of run(lists)) {
        const v = view(s);
        expect(frozenDeep(v), `${text(lists)} step ${s.id}`).toBe(true);
        for (const part of [v.lists, v.nodes, v.heads, v.heap, v.calls, v.pointers, v.merged]) expect(Object.isFrozen(part)).toBe(true);
        for (const n of v.nodes) expect(Object.isFrozen(n)).toBe(true);
        for (const list of v.lists) expect(Object.isFrozen(list)).toBe(true);
      }
    }
  });

  it('a snapshot cannot be changed, and later steps never change an earlier one', () => {
    const steps = run('[[1,4,5],[1,3,4],[2,6]]');
    const v = view(steps[40]);
    expect(() => (v.heap as string[]).push('x')).toThrow(TypeError);
    expect(() => ((v.nodes[0] as { next: string | null }).next = 'x')).toThrow(TypeError);
    expect(() => ((v as { tail: string | null }).tail = 'x')).toThrow(TypeError);
    expect(() => (v.lists[0] as number[]).reverse()).toThrow(TypeError);
    // the links change during the run, yet each step keeps its own: step 0 still shows the lists as given
    expect(view(steps[0]).nodes.map(n => n.next)).toEqual(['l0n1', 'l0n2', null, 'l1n1', 'l1n2', null, 'l2n1', null]);
    expect(view(steps.at(-1)!).nodes.map(n => n.next)).not.toEqual(view(steps[0]).nodes.map(n => n.next));
    expect(view(steps[0]).heap).toEqual([]);
    // two runs give equal, separate traces
    const again = def.generateSteps([], { texts: ['[[1,4,5],[1,3,4],[2,6]]'] });
    expect(again).toEqual(steps);
    expect(view(again[40])).not.toBe(v);
  });
});

describe('Merge k Sorted Lists — code references', () => {
  it('every step names a line in all four listings, and every mapped reference is reached by some trace', () => {
    const seen = new Set<string>();
    for (const lists of ALL_INPUTS) for (const s of run(lists)) seen.add(s.codeRef ?? '(none)');
    for (const ref of seen) for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, ref), `${lang} ${ref}`).not.toBeNull();
    expect([...seen].sort()).toEqual(Object.keys(def.lineMap.c).sort());
    const inner = [...PUSH_SITES.flatMap(site => PUSH_REFS.map(r => `${r}@${site}`)), ...POP_REFS.map(r => `${r}@node`)];
    expect(Object.keys(def.lineMap.c).filter(r => r.includes('@')).sort()).toEqual(inner.sort());
  });

  it('C: each step is on its own statement; the push and pop steps are the same lines from either call site', () => {
    const line = (ref: string) => def.code.c.split('\n')[def.lineMap.c[ref] - 1].trim();
    expect(line('su-check@head')).toBe('if (heap[parent]->val <= heap[i]->val)');
    expect(line('su-check@next')).toBe('if (heap[parent]->val <= heap[i]->val)');
    expect(line('su-break@head')).toBe('break;');
    expect(line('sd-break@node')).toBe('break;');
    expect(def.lineMap.c['su-break@head']).toBeLessThan(def.lineMap.c['sd-break@node']);
    expect(line('sd-check-left@node')).toBe('if (l < *size && heap[l]->val < heap[smallest]->val)');
    expect(line('pop-node')).toBe('struct ListNode *node = pop(heap, &size);');
    expect(line('link-node')).toBe('tail->next = node;');
    // the dummy's declaration and the line that clears its next are one step
    expect(line('init-dummy')).toBe('dummy.next = NULL;');
    expect(def.lineLeads).toEqual({ c: { 'init-dummy': 1 } });
    expect(def.code.c.split('\n')[def.lineMap.c['init-dummy'] - 2].trim()).toBe('struct ListNode dummy;');
  });

  it('C++, Java and Python: a step inside push or pop highlights the library call of its call site, never an invented line', () => {
    const line = (lang: 'cpp' | 'java' | 'python', ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();
    for (const ref of PUSH_REFS) {
      expect(line('cpp', `${ref}@head`)).toBe('pq.push(lists[i]);');
      expect(line('cpp', `${ref}@next`)).toBe('pq.push(node->next);');
      expect(line('java', `${ref}@head`)).toBe('pq.add(lists[i]);');
      expect(line('java', `${ref}@next`)).toBe('pq.add(node.next);');
      expect(line('python', `${ref}@head`)).toBe('heapq.heappush(heap, (lists[i].val, i, lists[i]))');
      expect(line('python', `${ref}@next`)).toBe('heapq.heappush(heap, (node.next.val, i, node.next))');
    }
    for (const ref of POP_REFS) {
      expect(line('cpp', `${ref}@node`)).toBe(ref === 'pop-min' ? 'ListNode *node = pq.top();' : 'pq.pop();');
      expect(line('java', `${ref}@node`)).toBe('ListNode node = pq.poll();');
      expect(line('python', `${ref}@node`)).toBe('val, i, node = heapq.heappop(heap)');
    }
    expect(def.lineSpans).toEqual({ java: { 'init-heap': 2, 'set-size': 2 } });
    for (const lang of ['cpp', 'java', 'python'] as const) expect(def.code[lang]).not.toMatch(/(smallest|parent|l|r) = /);
  });
});
