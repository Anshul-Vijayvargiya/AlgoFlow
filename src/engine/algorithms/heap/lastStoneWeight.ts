import type { AlgorithmDefinition, ExecutionStep, HeapPointer, HeapSmash, MaxHeapView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Last Stone Weight with a max heap. The steps follow the C listing, which writes the heap out by hand:
 *
 *   start with an empty heap; insert the stones one at a time;
 *   while the heap holds more than one stone: y = popMax(), x = popMax() (so y >= x);
 *     if y != x, insert y - x; if y == x both are destroyed and nothing goes back;
 *   return the last stone, or 0 when none is left.
 *
 *   insert:  i = size++; heap[i] = val; while i > 0: parent = (i-1)/2; break when heap[parent] >= heap[i], else swap
 *            and continue at parent
 *   popMax:  max = heap[0]; heap[0] = heap[--size]; i = 0; then sift down: largest = i; l = 2i+1; r = 2i+2; the left,
 *            then the right child replaces largest when it exists and is strictly greater; break when largest == i, else
 *            swap and continue at largest; return max
 *
 * The Java, C++ and Python listings use their library priority queue (Python's heapq is a min heap, so it stores the
 * weights negated). Their heap work happens inside a library call, so each step inside insert or popMax highlights the
 * call it belongs to there: such a step's codeRef names its call site, e.g. 'su-check@stone' (inserting a stone),
 * 'su-check@diff' (inserting y - x), 'sd-swap@y' and 'sd-swap@x' (the two popMax calls of a round). In C every site maps
 * to the same line of insert or popMax. What every listing takes out is the same (the two heaviest stones, so the same
 * rounds and answer); the order inside the heap array is the C listing's (Java's PriorityQueue breaks ties the same way).
 *
 * Ties: a child must be strictly greater to move up when sifting down (so the left child wins a tie between the
 * children, and a child equal to its parent stays below it); the insert loop stops at a parent that is at least as
 * large. The `while (1)` line has no step of its own: its condition is constant. swap(&a, &b) is one step at its call.
 *
 * The child checks short-circuit like the code: a child outside the heap (l >= size) is never read. A call is the call
 * statement, followed by the callee's first statement; a returning popMax is followed by the caller's assignment
 * (y = … / x = …) on the same line as the call. insert falls off its end when i reaches 0: no step for that.
 *
 * Each insertion and each popMax is O(log n): n insertions, then at most n - 1 rounds, give O(n log n) (O(n) when every
 * sift stops at once, e.g. all stones equal), with O(n) space for the heap.
 */

/** 10 stones: a heap of four levels, still readable at phone width, and at most about 700 steps. */
export const MAX_STONES = 10;

/** the steps inside insert and inside popMax; their codeRefs carry the call site: `${ref}@${site}` */
export const INSERT_REFS = ['ins-index', 'ins-store', 'su-loop', 'su-parent', 'su-check', 'su-break', 'su-swap', 'su-move'] as const;
export const POP_REFS = [
  'pop-max',
  'pop-move-last',
  'pop-shrink',
  'pop-set-i',
  'sd-largest',
  'sd-left',
  'sd-right',
  'sd-check-left',
  'sd-take-left',
  'sd-check-right',
  'sd-take-right',
  'sd-check-done',
  'sd-break',
  'sd-swap',
  'sd-move',
  'pop-return',
] as const;
type InsertRef = (typeof INSERT_REFS)[number];
type PopRef = (typeof POP_REFS)[number];
/** where insert is called from: the loop over the stones, or the smash (y - x); popMax: for y or for x */
export type InsertSite = 'stone' | 'diff';
export type PopSite = 'y' | 'x';
export const INSERT_SITES: readonly InsertSite[] = ['stone', 'diff'];
export const POP_SITES: readonly PopSite[] = ['y', 'x'];

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
const stonesWord = (k: number) => `${k} stone${k === 1 ? '' : 's'}`;

function generateLastStoneWeightSteps(input: number[]): ExecutionStep[] {
  const check = validateAlgorithmInput(lastStoneWeightDefinition, input, null);
  if (!check.ok) throw new RangeError(check.message);
  const stones = Object.freeze([...input]);
  const n = stones.length;
  const h: number[] = [];
  const steps: ExecutionStep[] = [];
  const smashes: HeapSmash[] = [];
  const calls: string[] = [];
  let phase: MaxHeapView['phase'] = 'build';
  let y: number | null = null;
  let x: number | null = null;
  let top: number | null = null;
  let popping: MaxHeapView['popping'] = null;
  /** this round's smash, once its y != x check has run */
  let smash: HeapSmash | null = null;

  type Extra = Partial<Pick<MaxHeapView, 'pointers' | 'compared' | 'swapped' | 'moved' | 'removed' | 'inserted' | 'diff' | 'result'>>;
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'heap'>, extra: Extra = {}) => {
    steps.push({
      id: steps.length,
      state: [...h],
      ...s,
      heap: {
        stones,
        heap: Object.freeze([...h]),
        phase,
        calls: [...calls],
        pointers: [],
        top,
        popping,
        y,
        x,
        smashes: [...smashes],
        ...(smash ? { smash } : {}),
        ...extra,
      },
    });
  };
  /** the named positions that are inside the heap's first `size` slots */
  const pointers = (size: number, named: Record<string, number>): HeapPointer[] =>
    Object.entries(named)
      .filter(([, index]) => index >= 0 && index < size)
      .map(([name, index]) => ({ name, index }));

  /** insert(heap, &size, val), as the C listing writes it */
  function insert(val: number, site: InsertSite) {
    const at = (ref: InsertRef) => `${ref}@${site}`;
    const diff = site === 'diff' ? { diff: val } : {};
    calls.push(`insert(heap, &size, ${val})`);
    let i = h.length;
    push(
      {
        type: 'assign',
        codeRef: at('ins-index'),
        variables: { i, size: i + 1, val },
        message: `i = size = ${i}; size → ${i + 1}`,
        explanation: `The new stone ${val} takes the first free slot, position ${i}, so the tree stays complete.`,
        actionLabel: 'i = size++',
      },
      { ...diff }
    );
    h.push(val);
    push(
      {
        type: 'update',
        codeRef: at('ins-store'),
        variables: { i, val, size: h.length },
        message: `heap[${i}] = ${val}`,
        explanation: i === 0 ? `${val} is the only stone in the heap: it is the root.` : `${val} may be heavier than its parent: the loop moves it up while it is.`,
        actionLabel: `Insert ${val}`,
      },
      { pointers: pointers(h.length, { i }), inserted: i, ...diff }
    );
    for (;;) {
      const go = i > 0;
      push(
        {
          type: 'loop-condition',
          codeRef: at('su-loop'),
          variables: { i },
          result: go ? 'true' : 'false',
          message: `i=${i} > 0 → ${go ? 'true' : 'false'}`,
          explanation: go ? `heap[${i}] = ${h[i]} has a parent: compare them.` : `heap[${i}] = ${h[i]} is the root: insert ends here.`,
          actionLabel: go ? 'Has parent' : 'At root',
        },
        { pointers: pointers(h.length, { i }) }
      );
      if (!go) {
        calls.pop();
        return;
      }
      const parent = Math.floor((i - 1) / 2);
      push(
        {
          type: 'assign',
          codeRef: at('su-parent'),
          variables: { i, parent },
          message: `parent = (${i} - 1) / 2 = ${parent}`,
          explanation: `The parent of position ${i} is position ${parent} (heap[${parent}] = ${h[parent]}).`,
          actionLabel: 'parent',
        },
        { pointers: pointers(h.length, { i, parent }) }
      );
      const stop = h[parent] >= h[i];
      push(
        {
          type: 'condition',
          codeRef: at('su-check'),
          variables: { i, parent, 'heap[parent]': h[parent], 'heap[i]': h[i] },
          result: stop ? 'true' : 'false',
          message: `heap[${parent}]=${h[parent]} >= heap[${i}]=${h[i]} → ${stop ? 'TRUE' : 'FALSE'}`,
          explanation: stop
            ? `The parent ${h[parent]} is at least as heavy as ${h[i]}: the heap property holds, so the new stone stays here.`
            : `${h[i]} is heavier than its parent ${h[parent]}, so it moves up.`,
          actionLabel: stop ? 'In place' : 'Heavier than parent',
        },
        { pointers: pointers(h.length, { i, parent }), compared: [parent, i] }
      );
      if (stop) {
        push(
          {
            type: 'return',
            codeRef: at('su-break'),
            variables: { i },
            message: 'break — insert ends',
            explanation: 'The new stone has found its place. Back to the caller.',
            actionLabel: 'Break',
          },
          { pointers: pointers(h.length, { i }) }
        );
        calls.pop();
        return;
      }
      [h[parent], h[i]] = [h[i], h[parent]];
      push(
        {
          type: 'swap',
          codeRef: at('su-swap'),
          variables: { i, parent, 'heap[parent]': h[parent], 'heap[i]': h[i] },
          message: `Swapped heap[${parent}] ↔ heap[${i}]  (now ${h[parent]}, ${h[i]})`,
          explanation: `${h[parent]} moves up to position ${parent}; ${h[i]} moves down to position ${i}.`,
          actionLabel: 'Swap up',
        },
        { pointers: pointers(h.length, { i, parent }), swapped: [parent, i] }
      );
      i = parent;
      push(
        {
          type: 'assign',
          codeRef: at('su-move'),
          variables: { i },
          message: `i = parent = ${i}`,
          explanation: `Continue from position ${i}.`,
          actionLabel: 'i = parent',
        },
        { pointers: pointers(h.length, { i }) }
      );
    }
  }

  /** popMax(heap, &size), as the C listing writes it, then the caller's assignment to y or x */
  function popMax(which: PopSite): number {
    const at = (ref: PopRef) => `${ref}@${which}`;
    calls.push('popMax(heap, &size)');
    popping = which;
    top = h[0];
    push(
      {
        type: 'assign',
        codeRef: at('pop-max'),
        variables: { max: top },
        message: `max = heap[0] = ${top}`,
        explanation: `The root of a max heap is its heaviest stone: ${top}.`,
        actionLabel: 'max = root',
      },
      { pointers: [] }
    );
    const last = h.length - 1;
    h[0] = h[last];
    push(
      {
        type: 'assign',
        codeRef: at('pop-move-last'),
        variables: { size: last, 'heap[0]': h[0] },
        message: `--size → ${last}; heap[0] = heap[${last}] = ${h[0]}`,
        explanation:
          last === 0
            ? 'The root is also the last stone, so it is copied onto itself; its slot is no longer part of the heap.'
            : `The last stone moves to the root, so the tree stays complete. It is probably too light for the root: the loop below sifts it down.`,
        actionLabel: 'Last to root',
      },
      { moved: { from: last, to: 0 } }
    );
    const removed = h.pop()!;
    push(
      {
        type: 'update',
        codeRef: at('pop-shrink'),
        variables: { size: h.length },
        message: `slot ${last} is outside the heap now — it holds ${stonesWord(h.length)}`,
        explanation: `Its stone (${removed}) is already at the root, so the slot is no longer needed.`,
        actionLabel: 'Shrink',
      },
      { removed }
    );
    const size = h.length;
    let i = 0;
    push(
      {
        type: 'assign',
        codeRef: at('pop-set-i'),
        variables: { i, size },
        message: 'i = 0',
        explanation: size > 0 ? `Sift the new root ${h[0]} down until it is at least as heavy as its children.` : 'The heap is empty now: there is nothing to sift down.',
        actionLabel: 'i = 0',
      },
      { pointers: pointers(size, { i }) }
    );
    for (;;) {
      let largest = i;
      const inHeap = i < size;
      push(
        {
          type: 'assign',
          codeRef: at('sd-largest'),
          variables: { size, i, largest },
          message: `largest = i = ${i}${inHeap ? `  (heap[${i}] = ${h[i]})` : ''}`,
          explanation: inHeap
            ? `Assume heap[${i}] = ${h[i]} is the largest of itself and its children.`
            : `The heap is empty (size = ${size}), so there is nothing to sift down.`,
          actionLabel: 'largest = i',
        },
        { pointers: pointers(size, { i, largest }) }
      );

      const l = 2 * i + 1;
      const r = 2 * i + 2;
      const named = () => pointers(size, { i, l, r, largest });
      push(
        {
          type: 'assign',
          codeRef: at('sd-left'),
          variables: { size, i, l },
          message: `l = 2 * ${i} + 1 = ${l}`,
          explanation: l < size ? `The left child of position ${i} is position ${l}.` : `Position ${l} is outside the heap (size = ${size}): no left child.`,
          actionLabel: 'l = 2i+1',
        },
        { pointers: named() }
      );
      push(
        {
          type: 'assign',
          codeRef: at('sd-right'),
          variables: { size, i, l, r },
          message: `r = 2 * ${i} + 2 = ${r}`,
          explanation: r < size ? `The right child of position ${i} is position ${r}.` : `Position ${r} is outside the heap (size = ${size}): no right child.`,
          actionLabel: 'r = 2i+2',
        },
        { pointers: named() }
      );

      for (const side of ['left', 'right'] as const) {
        const c = side === 'left' ? l : r;
        const name = side === 'left' ? 'l' : 'r';
        const exists = c < size;
        const greater = exists && h[c] > h[largest];
        push(
          {
            type: 'condition',
            codeRef: at(side === 'left' ? 'sd-check-left' : 'sd-check-right'),
            variables: exists
              ? { size, [name]: c, largest, [`heap[${name}]`]: h[c], 'heap[largest]': h[largest] }
              : { size, [name]: c, largest },
            result: greater ? 'true' : 'false',
            message: exists
              ? `${name}=${c} < size=${size} && heap[${c}]=${h[c]} > heap[largest=${largest}]=${h[largest]} → ${greater ? 'TRUE' : 'FALSE'}`
              : `${name}=${c} < size=${size} → FALSE — no ${side} child, heap[${c}] is not read`,
            explanation: !exists
              ? `The ${side} child position ${c} is outside the heap, so the && stops before comparing anything.`
              : greater
                ? `The ${side} child ${h[c]} is heavier than ${h[largest]}.`
                : `The ${side} child ${h[c]} is not heavier than ${h[largest]}${h[c] === h[largest] ? ' (equal does not count: the stone above stays)' : ''}.`,
            actionLabel: greater ? 'Child heavier' : exists ? 'Not heavier' : `No ${side} child`,
          },
          { pointers: named(), compared: exists ? [c, largest] : [] }
        );
        if (greater) {
          largest = c;
          push(
            {
              type: 'assign',
              codeRef: at(side === 'left' ? 'sd-take-left' : 'sd-take-right'),
              variables: { size, i, largest, 'heap[largest]': h[largest] },
              message: `largest = ${name} = ${c}  (heap[${c}] = ${h[c]})`,
              explanation: `The ${side} child is the heaviest so far.`,
              actionLabel: `largest = ${name}`,
            },
            { pointers: named() }
          );
        }
      }

      const done = largest === i;
      push(
        {
          type: 'condition',
          codeRef: at('sd-check-done'),
          variables: { size, i, largest },
          result: done ? 'true' : 'false',
          message: `largest(${largest}) == i(${i}) → ${done ? 'TRUE' : 'FALSE — a child is heavier'}`,
          explanation: done
            ? inHeap
              ? `heap[${i}] = ${h[i]} is at least as heavy as its children: the heap is a max heap again.`
              : 'There is no stone to move.'
            : `The child heap[${largest}] = ${h[largest]} is heavier than heap[${i}] = ${h[i]}, so they swap.`,
          actionLabel: done ? 'In place' : 'Swap needed',
        },
        { pointers: named() }
      );
      if (done) {
        push(
          {
            type: 'return',
            codeRef: at('sd-break'),
            variables: { size, i },
            message: 'break — the sift down ends',
            explanation: 'Leave the loop; popMax returns the stone it took.',
            actionLabel: 'Break',
          },
          { pointers: pointers(size, { i }) }
        );
        break;
      }

      [h[i], h[largest]] = [h[largest], h[i]];
      push(
        {
          type: 'swap',
          codeRef: at('sd-swap'),
          variables: { size, i, largest, 'heap[i]': h[i], 'heap[largest]': h[largest] },
          message: `Swapped heap[${i}] ↔ heap[${largest}]  (now ${h[i]}, ${h[largest]})`,
          explanation: `The heavier stone ${h[i]} moves up. ${h[largest]} may still be lighter than its new children, so the sift continues at position ${largest}.`,
          actionLabel: 'Swap down',
        },
        { pointers: named(), swapped: [i, largest] }
      );
      i = largest;
      push(
        {
          type: 'assign',
          codeRef: at('sd-move'),
          variables: { size, i },
          message: `i = largest = ${i}`,
          explanation: `Continue sifting heap[${i}] = ${h[i]} down from position ${i}.`,
          actionLabel: 'i = largest',
        },
        { pointers: pointers(size, { i }) }
      );
    }
    push(
      {
        type: 'return',
        codeRef: at('pop-return'),
        variables: { max: top },
        message: `return ${top}`,
        explanation: `popMax hands back the heaviest stone, ${top}.`,
        actionLabel: 'Return max',
      },
      { pointers: [] }
    );
    calls.pop();
    const value = top;
    if (which === 'y') y = value;
    else x = value;
    top = null;
    popping = null;
    push(
      {
        type: 'assign',
        codeRef: which === 'y' ? 'pop-y' : 'pop-x',
        variables: which === 'y' ? { y } : { y, x },
        message: `${which} = ${value}`,
        explanation: which === 'y' ? `y = ${value} is the heaviest stone.` : `x = ${value} is the second heaviest stone (x ≤ y = ${y}).`,
        actionLabel: `${which} = ${value}`,
      },
      { pointers: [] }
    );
    return value;
  }

  calls.push('lastStoneWeight(stones, n)');
  push({
    type: 'init',
    codeRef: 'init-heap',
    variables: { n, stones: list(stones) },
    message: `heap = an empty array with room for ${stonesWord(Math.max(n, 1))}`,
    explanation:
      n === 0
        ? 'There are no stones. The array still gets one slot (C does not allow an array of 0 elements), and it stays empty.'
        : `Room for all ${n} stones. The heap starts empty: the stones go in one at a time.`,
    actionLabel: 'Empty heap',
  });
  push({
    type: 'assign',
    codeRef: 'set-size',
    variables: { size: 0 },
    message: 'size = 0',
    explanation: 'The heap holds no stone yet.',
    actionLabel: 'size = 0',
  });

  // ── Build the max heap: for (i = 0; i < n; i++) insert(heap, &size, stones[i])
  for (let i = 0; ; i++) {
    const go = i < n;
    push({
      type: 'loop-condition',
      codeRef: 'build-loop',
      variables: { i, n },
      result: go ? 'true' : 'false',
      message: `Build: i=${i} < n=${n} → ${go ? 'true' : 'false'}${go ? '' : ' — max heap built'}`,
      explanation: go
        ? `Next stone: stones[${i}] = ${stones[i]}.`
        : n > 0
          ? `Every stone is in: the array is a max heap, and heap[0] = ${h[0]} is the heaviest stone.`
          : 'There are no stones to insert.',
      actionLabel: go ? `Stone ${i + 1}` : 'Heap built',
    });
    if (!go) break;
    push({
      type: 'loop-start',
      codeRef: 'call-insert',
      variables: { i, 'stones[i]': stones[i] },
      message: `Call insert(heap, &size, ${stones[i]})`,
      explanation: `Insert ${stones[i]} into the heap of ${stonesWord(h.length)}.`,
      actionLabel: 'Call insert',
    });
    insert(stones[i], 'stone');
    push(
      {
        type: 'increment',
        codeRef: 'build-loop',
        variables: { i: i + 1, n },
        message: `i++ → i=${i + 1}`,
        explanation: 'Move to the next stone.',
        actionLabel: 'i++',
      },
      { pointers: [] }
    );
  }

  // ── Smash: while (size > 1) { y = popMax; x = popMax; if (y != x) insert(y - x) }
  phase = 'smash';
  for (;;) {
    y = null;
    x = null;
    smash = null;
    const go = h.length > 1;
    push({
      type: 'loop-condition',
      codeRef: 'smash-loop',
      variables: { size: h.length },
      result: go ? 'true' : 'false',
      message: `size=${h.length} > 1 → ${go ? 'true' : 'false'}`,
      explanation: go
        ? `${stonesWord(h.length)} left: take the two heaviest and smash them.`
        : h.length === 1
          ? `Only one stone is left (${h[0]}): the smashing is over.`
          : 'No stone is left: the smashing is over.',
      actionLabel: go ? `Round ${smashes.length + 1}` : 'Loop ends',
    });
    if (!go) break;

    for (const which of POP_SITES) {
      push(
        {
          type: 'loop-start',
          codeRef: which === 'y' ? 'pop-y' : 'pop-x',
          variables: which === 'y' ? { size: h.length } : { y, size: h.length },
          message: `Call popMax(heap, &size) for ${which}`,
          explanation: which === 'y' ? 'Take the heaviest stone from the root.' : `Take the next heaviest stone: after the first popMax, it is at the root again.`,
          actionLabel: `popMax → ${which}`,
        },
        { pointers: [] }
      );
      popMax(which);
    }

    const yv = y!;
    const xv = x!;
    const differ = yv !== xv;
    smash = { y: yv, x: xv, left: yv - xv };
    smashes.push(smash);
    push({
      type: 'condition',
      codeRef: 'check-equal',
      variables: { y: yv, x: xv },
      result: differ ? 'true' : 'false',
      message: `y=${yv} != x=${xv} → ${differ ? `TRUE — smash leaves ${yv - xv}` : 'FALSE — both destroyed'}`,
      explanation: differ
        ? `Smash: ${xv} is destroyed, and ${yv} becomes ${yv} − ${xv} = ${yv - xv}, which goes back into the heap.`
        : `Smash: the stones weigh the same (${yv}), so both are destroyed and nothing goes back.`,
      actionLabel: differ ? 'Smash: unequal' : 'Smash: equal',
    });
    if (!differ) continue;

    const diff = yv - xv;
    push(
      {
        type: 'loop-start',
        codeRef: 'insert-diff',
        variables: { y: yv, x: xv, 'y - x': diff },
        message: `Call insert(heap, &size, y - x = ${diff})`,
        explanation: `The new stone ${diff} goes back into the heap.`,
        actionLabel: `Insert ${diff}`,
      },
      { diff }
    );
    insert(diff, 'diff');
  }

  phase = 'done';
  calls.pop();
  const value = h.length === 0 ? 0 : h[0];
  const text =
    n === 0 ? 'No stones at all: the answer is 0' : h.length === 0 ? 'No stone is left: the answer is 0' : `The last stone weighs ${value}`;
  push(
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { result: value, smashes: smashes.length },
      message: `return ${value}`,
      explanation:
        n === 0
          ? 'With no stones, nothing is smashed and the answer is 0.'
          : `${smashes.length} smash${smashes.length === 1 ? '' : 'es'}. Each insertion and each popMax took O(log n): n insertions and at most n − 1 rounds make O(n log n).`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    { result: { value, text } }
  );
  return steps;
}

/**
 * A line map for the steps inside insert and popMax, from where each call site's steps go in a listing: C maps every
 * site to the line of the statement itself; the library listings map each site to its library call.
 */
function siteLines(insertLine: (ref: InsertRef, site: InsertSite) => number, popLine: (ref: PopRef, site: PopSite) => number): Record<string, number> {
  const map: Record<string, number> = {};
  for (const site of INSERT_SITES) for (const ref of INSERT_REFS) map[`${ref}@${site}`] = insertLine(ref, site);
  for (const site of POP_SITES) for (const ref of POP_REFS) map[`${ref}@${site}`] = popLine(ref, site);
  return map;
}

const C_INSERT: Record<InsertRef, number> = {
  'ins-index': 12,
  'ins-store': 13,
  'su-loop': 15,
  'su-parent': 16,
  'su-check': 18,
  'su-break': 19,
  'su-swap': 21,
  'su-move': 22,
};
const C_POP: Record<PopRef, number> = {
  'pop-max': 28,
  'pop-move-last': 30,
  'pop-shrink': 30,
  'pop-set-i': 32,
  'sd-largest': 35,
  'sd-left': 36,
  'sd-right': 37,
  'sd-check-left': 39,
  'sd-take-left': 40,
  'sd-check-right': 42,
  'sd-take-right': 43,
  'sd-check-done': 45,
  'sd-break': 46,
  'sd-swap': 48,
  'sd-move': 49,
  'pop-return': 52,
};

export const lastStoneWeightDefinition: AlgorithmDefinition = {
  id: 'heap-last-stone-weight',
  name: 'Last Stone Weight',
  category: 'HEAP',
  visual: 'heap',
  subtitle: 'Smash the two heaviest stones, taken from a max heap, until at most one is left.',
  description:
    'Each round takes the two heaviest stones y ≥ x. If they weigh the same, both are destroyed; otherwise x is destroyed and a stone of y − x goes back. The answer is the weight of the last stone, or 0 when none is left. A max heap gives the heaviest stone in O(log n): the stones are inserted one at a time (each new stone moves up while it is heavier than its parent), then each round makes two popMax calls (move the last stone to the root and sift it down) and, for unequal stones, inserts the difference. n insertions and at most n − 1 rounds of O(log n) work give O(n log n) time, with O(n) space for the heap. The C listing writes the heap out and the steps follow it; Java and C++ use their priority queue, and Python uses heapq, a min heap, with the weights negated.',
  complexity: {
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    bestFor: 'Repeatedly taking the largest item: O(log n) per insertion or removal',
  },
  defaultInput: [2, 7, 4, 1, 8, 1],
  inputSpec: {
    maxLength: MAX_STONES,
    minValue: 1,
    randomValues: [1, 20],
  },

  code: {
    c: `#include <stdio.h>
#include <stdlib.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

// Insert element into Max Heap
void insert(int heap[], int *size, int val) {
    int i = (*size)++;
    heap[i] = val;

    while (i > 0) {
        int parent = (i - 1) / 2;

        if (heap[parent] >= heap[i])
            break;

        swap(&heap[parent], &heap[i]);
        i = parent;
    }
}

// Remove maximum element
int popMax(int heap[], int *size) {
    int max = heap[0];

    heap[0] = heap[--(*size)];

    int i = 0;

    while (1) {
        int largest = i;
        int l = 2 * i + 1;
        int r = 2 * i + 2;

        if (l < *size && heap[l] > heap[largest])
            largest = l;

        if (r < *size && heap[r] > heap[largest])
            largest = r;

        if (largest == i)
            break;

        swap(&heap[i], &heap[largest]);
        i = largest;
    }

    return max;
}

int lastStoneWeight(int stones[], int n) {

    int heap[n > 0 ? n : 1];
    int size = 0;

    // Insert all stones
    for (int i = 0; i < n; i++) {
        insert(heap, &size, stones[i]);
    }

    while (size > 1) {

        int y = popMax(heap, &size);
        int x = popMax(heap, &size);

        if (y != x) {
            insert(heap, &size, y - x);
        }
    }

    return size == 0 ? 0 : heap[0];
}`,
    cpp: `#include <iostream>
#include <vector>
#include <queue>
using namespace std;

class Solution {
public:
    int lastStoneWeight(vector<int>& stones) {

        priority_queue<int> pq;

        // Add all stones
        for (int s : stones) {
            pq.push(s);
        }

        while (pq.size() > 1) {

            int y = pq.top();
            pq.pop();

            int x = pq.top();
            pq.pop();

            if (y != x) {
                pq.push(y - x);
            }
        }

        return pq.empty() ? 0 : pq.top();
    }
};`,
    java: `import java.util.*;

class Solution {
    public int lastStoneWeight(int[] stones) {

        PriorityQueue<Integer> pq =
            new PriorityQueue<>(Collections.reverseOrder());

        // Add all stones
        for (int s : stones) {
            pq.add(s);
        }

        while (pq.size() > 1) {

            int y = pq.poll();
            int x = pq.poll();

            if (y != x) {
                pq.add(y - x);
            }
        }

        return pq.isEmpty() ? 0 : pq.poll();
    }
}`,
    python: `import heapq

class Solution:
    def lastStoneWeight(self, stones):

        # Convert into negative values
        heap = [-s for s in stones]

        heapq.heapify(heap)

        while len(heap) > 1:

            y = -heapq.heappop(heap)
            x = -heapq.heappop(heap)

            if y != x:
                heapq.heappush(heap, -(y - x))

        return -heap[0] if heap else 0`,
  },

  // C: every step on its own statement. The library listings: a step inside insert or popMax highlights the library call
  // it belongs to (C++ reads y and x with top() and removes them with pop(): popMax's first step is the top() line, the
  // rest the pop() line). Python builds its list of negated weights and heapifies it: the build's steps highlight those.
  lineMap: {
    c: {
      'init-heap': 57,
      'set-size': 58,
      'build-loop': 61,
      'call-insert': 62,
      'smash-loop': 65,
      'pop-y': 67,
      'pop-x': 68,
      'check-equal': 70,
      'insert-diff': 71,
      'return-result': 75,
      ...siteLines(
        ref => C_INSERT[ref],
        ref => C_POP[ref]
      ),
    },
    cpp: {
      'init-heap': 10,
      'set-size': 10,
      'build-loop': 13,
      'call-insert': 14,
      'smash-loop': 17,
      'pop-y': 19,
      'pop-x': 22,
      'check-equal': 25,
      'insert-diff': 26,
      'return-result': 30,
      ...siteLines(
        (_ref, site) => (site === 'stone' ? 14 : 26),
        (ref, site) => (site === 'y' ? 19 : 22) + (ref === 'pop-max' ? 0 : 1)
      ),
    },
    java: {
      'init-heap': 6,
      'set-size': 6,
      'build-loop': 10,
      'call-insert': 11,
      'smash-loop': 14,
      'pop-y': 16,
      'pop-x': 17,
      'check-equal': 19,
      'insert-diff': 20,
      'return-result': 24,
      ...siteLines(
        (_ref, site) => (site === 'stone' ? 11 : 20),
        (_ref, site) => (site === 'y' ? 16 : 17)
      ),
    },
    python: {
      'init-heap': 7,
      'set-size': 7,
      'build-loop': 9,
      'call-insert': 9,
      'smash-loop': 11,
      'pop-y': 13,
      'pop-x': 14,
      'check-equal': 16,
      'insert-diff': 17,
      'return-result': 19,
      ...siteLines(
        (_ref, site) => (site === 'stone' ? 9 : 17),
        (_ref, site) => (site === 'y' ? 13 : 14)
      ),
    },
  },

  // Java declares its priority queue over two lines: the step that creates it highlights both.
  lineSpans: {
    java: { 'init-heap': 2, 'set-size': 2 },
  },

  generateSteps: generateLastStoneWeightSteps,
};
