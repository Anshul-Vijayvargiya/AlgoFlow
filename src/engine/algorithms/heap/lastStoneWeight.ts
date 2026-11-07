import type { AlgorithmDefinition, ExecutionStep, HeapPointer, HeapSmash, MaxHeapView } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * Last Stone Weight with a hand-written array max heap (the same in all four listings, so every step is a statement the
 * listing really runs):
 *
 *   copy the stones into heap; build a max heap bottom-up (siftDown every parent, the last parent first);
 *   while the heap holds more than one stone: y = popMax(), x = popMax() (so y >= x);
 *     if y != x, append y - x and siftUp it; if y == x both are destroyed and nothing is appended;
 *   return the last stone, or 0 when none is left.
 *
 *   popMax:   top = heap[0]; heap[0] = heap[last]; remove the last slot; siftDown(heap, size, 0); return top
 *   siftDown: largest = i; l = 2i+1; r = 2i+2; the left, then the right child replaces largest when it exists and is
 *             strictly greater; stop when largest == i, else swap and continue at largest
 *   siftUp:   while i > 0: parent = (i-1)/2; stop when heap[parent] >= heap[i], else swap and continue at parent
 *
 * Ties: a child must be strictly greater to move up in siftDown (so the left child wins a tie between the children, and
 * a child equal to its parent stays below it); siftUp stops at a parent that is at least as large. The `while (true)`
 * and `while True` lines of siftDown have no step of their own: their condition is constant.
 *
 * The child checks short-circuit like the code: a child outside the heap (l >= n) is never read. A call is the call
 * statement, followed by the callee's first statement; a returning popMax is followed by the caller's assignment
 * (y = … / x = …) on the same line as the call. siftUp falls off its end when i reaches 0: no return step.
 *
 * Building the heap is O(n); each popMax and each insertion is O(log n), and there are at most n - 1 rounds, so the whole
 * run is O(n log n) (O(n) when every sift stops at once, e.g. all stones equal), with O(n) space for the heap copy.
 */

/** 10 stones: a heap of four levels, still readable at phone width, and at most about 600 steps. */
export const MAX_STONES = 10;

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
  let phase: MaxHeapView['phase'] = 'copy';
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

  /** siftDown(heap, size, start), as the listings write it */
  function siftDown(size: number, start: number) {
    calls.push(`siftDown(heap, ${size}, ${start})`);
    let i = start;
    for (;;) {
      let largest = i;
      const inHeap = i < size;
      push(
        {
          type: 'assign',
          codeRef: 'sd-largest',
          variables: { n: size, i, largest },
          message: `largest = i = ${i}${inHeap ? `  (heap[${i}] = ${h[i]})` : ''}`,
          explanation: inHeap
            ? `Assume heap[${i}] = ${h[i]} is the largest of itself and its children.`
            : `The heap is empty (n = ${size}), so there is nothing to sift down.`,
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
          codeRef: 'sd-left',
          variables: { n: size, i, l },
          message: `l = 2 * ${i} + 1 = ${l}`,
          explanation: l < size ? `The left child of position ${i} is position ${l}.` : `Position ${l} is outside the heap (n = ${size}): no left child.`,
          actionLabel: 'l = 2i+1',
        },
        { pointers: named() }
      );
      push(
        {
          type: 'assign',
          codeRef: 'sd-right',
          variables: { n: size, i, l, r },
          message: `r = 2 * ${i} + 2 = ${r}`,
          explanation: r < size ? `The right child of position ${i} is position ${r}.` : `Position ${r} is outside the heap (n = ${size}): no right child.`,
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
            codeRef: side === 'left' ? 'sd-check-left' : 'sd-check-right',
            variables: exists
              ? { n: size, [name]: c, largest, [`heap[${name}]`]: h[c], 'heap[largest]': h[largest] }
              : { n: size, [name]: c, largest },
            result: greater ? 'true' : 'false',
            message: exists
              ? `${name}=${c} < n=${size} && heap[${c}]=${h[c]} > heap[largest=${largest}]=${h[largest]} → ${greater ? 'TRUE' : 'FALSE'}`
              : `${name}=${c} < n=${size} → FALSE — no ${side} child, heap[${c}] is not read`,
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
              codeRef: side === 'left' ? 'sd-take-left' : 'sd-take-right',
              variables: { n: size, i, largest, 'heap[largest]': h[largest] },
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
          codeRef: 'sd-check-done',
          variables: { n: size, i, largest },
          result: done ? 'true' : 'false',
          message: `largest(${largest}) == i(${i}) → ${done ? 'TRUE' : 'FALSE — a child is heavier'}`,
          explanation: done
            ? inHeap
              ? `heap[${i}] = ${h[i]} is at least as heavy as its children: this part of the heap is a max heap again.`
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
            codeRef: 'sd-return',
            variables: { n: size, i },
            message: 'return — siftDown ends',
            explanation: 'Back to the caller.',
            actionLabel: 'Return',
          },
          { pointers: pointers(size, { i }) }
        );
        calls.pop();
        return;
      }

      [h[i], h[largest]] = [h[largest], h[i]];
      push(
        {
          type: 'swap',
          codeRef: 'sd-swap',
          variables: { n: size, i, largest, 'heap[i]': h[i], 'heap[largest]': h[largest] },
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
          codeRef: 'sd-move',
          variables: { n: size, i },
          message: `i = largest = ${i}`,
          explanation: `Continue sifting heap[${i}] = ${h[i]} down from position ${i}.`,
          actionLabel: 'i = largest',
        },
        { pointers: pointers(size, { i }) }
      );
    }
  }

  /** siftUp(heap, start), as the listings write it */
  function siftUp(start: number) {
    calls.push(`siftUp(heap, ${start})`);
    let i = start;
    for (;;) {
      const go = i > 0;
      push(
        {
          type: 'loop-condition',
          codeRef: 'su-loop',
          variables: { i },
          result: go ? 'true' : 'false',
          message: `i=${i} > 0 → ${go ? 'true' : 'false'}`,
          explanation: go ? `heap[${i}] = ${h[i]} has a parent: compare them.` : `heap[${i}] = ${h[i]} is the root: siftUp ends here.`,
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
          codeRef: 'su-parent',
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
          codeRef: 'su-check',
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
            codeRef: 'su-return',
            variables: { i },
            message: 'return — siftUp ends',
            explanation: 'Back to the caller.',
            actionLabel: 'Return',
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
          codeRef: 'su-swap',
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
          codeRef: 'su-move',
          variables: { i },
          message: `i = parent = ${i}`,
          explanation: `Continue from position ${i}.`,
          actionLabel: 'i = parent',
        },
        { pointers: pointers(h.length, { i }) }
      );
    }
  }

  /** popMax(heap), then the caller's assignment to y or x */
  function popMax(which: 'y' | 'x'): number {
    calls.push('popMax(heap)');
    popping = which;
    top = h[0];
    push(
      {
        type: 'assign',
        codeRef: 'pop-top',
        variables: { top },
        message: `top = heap[0] = ${top}`,
        explanation: `The root of a max heap is its heaviest stone: ${top}.`,
        actionLabel: 'top = root',
      },
      { pointers: [] }
    );
    const last = h.length - 1;
    h[0] = h[last];
    push(
      {
        type: 'assign',
        codeRef: 'pop-move-last',
        variables: { last, 'heap[0]': h[0] },
        message: `heap[0] = heap[${last}] = ${h[0]}`,
        explanation:
          last === 0
            ? 'The root is also the last stone, so it is copied onto itself; the next statement removes it.'
            : `The last stone moves to the root, so the tree stays complete. It is probably too light for the root: siftDown will move it.`,
        actionLabel: 'Last to root',
      },
      { moved: { from: last, to: 0 } }
    );
    const removed = h.pop()!;
    push(
      {
        type: 'update',
        codeRef: 'pop-shrink',
        variables: { size: h.length },
        message: `remove the last slot — the heap now holds ${stonesWord(h.length)}`,
        explanation: `Its stone (${removed}) is already at the root, so the slot is no longer needed.`,
        actionLabel: 'Shrink',
      },
      { removed }
    );
    push(
      {
        type: 'loop-start',
        codeRef: 'pop-call-sift',
        variables: { n: h.length },
        message: `Call siftDown(heap, ${h.length}, 0)`,
        explanation: h.length > 0 ? `Move the new root ${h[0]} down until it is at least as heavy as its children.` : 'The heap is empty now: siftDown has nothing to do.',
        actionLabel: 'Call siftDown',
      },
      { pointers: pointers(h.length, { i: 0 }) }
    );
    siftDown(h.length, 0);
    push(
      {
        type: 'return',
        codeRef: 'pop-return',
        variables: { top },
        message: `return ${top}`,
        explanation: `popMax hands back the heaviest stone, ${top}.`,
        actionLabel: 'Return top',
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

  calls.push('lastStoneWeight(stones)');
  h.push(...stones);
  push({
    type: 'init',
    codeRef: 'init-heap',
    variables: { stones: list(stones) },
    message: `heap = a copy of stones ${list(stones)}`,
    explanation:
      n === 0
        ? 'There are no stones. The copy is empty.'
        : `The stones are copied into the heap array. It is not a max heap yet: next, every parent is sifted down, the last parent first.`,
    actionLabel: 'Copy stones',
  });
  push({
    type: 'assign',
    codeRef: 'set-n',
    variables: { n },
    message: `n = ${n}`,
    explanation: `The heap starts with ${stonesWord(n)}.`,
    actionLabel: 'n',
  });

  // ── Build the max heap: for (i = n / 2 - 1; i >= 0; i--) siftDown(heap, n, i)
  phase = 'build';
  for (let i = Math.floor(n / 2) - 1; ; i--) {
    const go = i >= 0;
    push(
      {
        type: 'loop-condition',
        codeRef: 'build-loop',
        variables: { i, n },
        result: go ? 'true' : 'false',
        message: `Build: i=${i} >= 0 → ${go ? 'true' : 'false'}${go ? '' : ' — max heap built'}`,
        explanation: go
          ? `Position ${i} is a parent. Sift it down so the part of the tree below it is a max heap.`
          : n > 1
            ? `Every parent has been sifted down: the array is a max heap, and heap[0] = ${h[0]} is the heaviest stone.`
            : `With ${stonesWord(n)} there is no parent to sift down.`,
        actionLabel: go ? `Build i=${i}` : 'Heap built',
      },
      { pointers: pointers(n, { i }) }
    );
    if (!go) break;
    push(
      {
        type: 'loop-start',
        codeRef: 'call-build',
        variables: { n, i },
        message: `Call siftDown(heap, ${n}, ${i})`,
        explanation: `Sift heap[${i}] = ${h[i]} down within the whole heap (n = ${n}).`,
        actionLabel: 'Call siftDown',
      },
      { pointers: pointers(n, { i }) }
    );
    siftDown(n, i);
    push(
      {
        type: 'decrement',
        codeRef: 'build-loop',
        variables: { i: i - 1, n },
        message: `i-- → i=${i - 1}`,
        explanation: 'Move to the previous parent.',
        actionLabel: 'i--',
      },
      { pointers: pointers(n, { i: i - 1 }) }
    );
  }

  // ── Smash: while (size > 1) { y = popMax; x = popMax; if (y != x) { append y - x; siftUp } }
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

    for (const which of ['y', 'x'] as const) {
      push(
        {
          type: 'loop-start',
          codeRef: which === 'y' ? 'pop-y' : 'pop-x',
          variables: which === 'y' ? { size: h.length } : { y, size: h.length },
          message: `Call popMax(heap) for ${which}`,
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
    h.push(diff);
    push(
      {
        type: 'update',
        codeRef: 'push-diff',
        variables: { y: yv, x: xv, 'y - x': diff, size: h.length },
        message: `append y - x = ${yv} - ${xv} = ${diff} at heap[${h.length - 1}]`,
        explanation: `The new stone ${diff} goes into the first free slot, so the tree stays complete. It may be heavier than its parent: siftUp moves it.`,
        actionLabel: `Insert ${diff}`,
      },
      { inserted: h.length - 1, diff }
    );
    push(
      {
        type: 'loop-start',
        codeRef: 'call-siftup',
        variables: { i: h.length - 1 },
        message: `Call siftUp(heap, ${h.length - 1})`,
        explanation: `Move ${diff} up while it is heavier than its parent.`,
        actionLabel: 'Call siftUp',
      },
      { pointers: pointers(h.length, { i: h.length - 1 }), diff }
    );
    siftUp(h.length - 1);
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
          : `${smashes.length} smash${smashes.length === 1 ? '' : 'es'}. Building the heap took O(n); each smash took at most two popMax and one siftUp, O(log n) each, so the whole run is O(n log n).`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    { result: { value, text } }
  );
  return steps;
}

export const lastStoneWeightDefinition: AlgorithmDefinition = {
  id: 'heap-last-stone-weight',
  name: 'Last Stone Weight',
  category: 'HEAP',
  visual: 'heap',
  subtitle: 'Smash the two heaviest stones, taken from a max heap, until at most one is left.',
  description:
    'Each round takes the two heaviest stones y ≥ x. If they weigh the same, both are destroyed; otherwise x is destroyed and a stone of y − x goes back. The answer is the weight of the last stone, or 0 when none is left. A max heap gives the heaviest stone in O(log n): the stones are copied into an array and turned into a max heap bottom-up in O(n), then each round makes two popMax calls (move the last stone to the root and sift it down) and, for unequal stones, appends the difference and sifts it up. At most n − 1 rounds of O(log n) work give O(n log n) time, with O(n) space for the heap.',
  complexity: {
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    bestFor: 'Repeatedly taking the largest item: build a heap in O(n), then O(log n) per removal or insertion',
  },
  defaultInput: [2, 7, 4, 1, 8, 1],
  inputSpec: {
    maxLength: MAX_STONES,
    minValue: 1,
    randomValues: [1, 20],
  },

  code: {
    c: `#include <string.h>

#define MAX_STONES 10

void siftDown(int heap[], int n, int i) {
    while (1) {
        int largest = i;
        int l = 2 * i + 1;
        int r = 2 * i + 2;
        if (l < n && heap[l] > heap[largest]) largest = l;
        if (r < n && heap[r] > heap[largest]) largest = r;
        if (largest == i) return;
        int temp = heap[i];
        heap[i] = heap[largest];
        heap[largest] = temp;
        i = largest;
    }
}

void siftUp(int heap[], int i) {
    while (i > 0) {
        int parent = (i - 1) / 2;
        if (heap[parent] >= heap[i]) return;
        int temp = heap[parent];
        heap[parent] = heap[i];
        heap[i] = temp;
        i = parent;
    }
}

int popMax(int heap[], int *size) {
    int top = heap[0];
    heap[0] = heap[*size - 1];
    (*size)--;
    siftDown(heap, *size, 0);
    return top;
}

int lastStoneWeight(int stones[], int n) {
    int heap[MAX_STONES];
    memcpy(heap, stones, n * sizeof(int));
    int size = n;
    for (int i = n / 2 - 1; i >= 0; i--)
        siftDown(heap, n, i);
    while (size > 1) {
        int y = popMax(heap, &size);
        int x = popMax(heap, &size);
        if (y != x) {
            heap[size++] = y - x;
            siftUp(heap, size - 1);
        }
    }
    return size == 0 ? 0 : heap[0];
}`,
    cpp: `#include <utility>
#include <vector>
using namespace std;

void siftDown(vector<int>& heap, int n, int i) {
    while (true) {
        int largest = i;
        int l = 2 * i + 1;
        int r = 2 * i + 2;
        if (l < n && heap[l] > heap[largest]) largest = l;
        if (r < n && heap[r] > heap[largest]) largest = r;
        if (largest == i) return;
        swap(heap[i], heap[largest]);
        i = largest;
    }
}

void siftUp(vector<int>& heap, int i) {
    while (i > 0) {
        int parent = (i - 1) / 2;
        if (heap[parent] >= heap[i]) return;
        swap(heap[parent], heap[i]);
        i = parent;
    }
}

int popMax(vector<int>& heap) {
    int top = heap[0];
    heap[0] = heap.back();
    heap.pop_back();
    siftDown(heap, heap.size(), 0);
    return top;
}

int lastStoneWeight(const vector<int>& stones) {
    vector<int> heap = stones;
    int n = heap.size();
    for (int i = n / 2 - 1; i >= 0; i--)
        siftDown(heap, n, i);
    while (heap.size() > 1) {
        int y = popMax(heap);
        int x = popMax(heap);
        if (y != x) {
            heap.push_back(y - x);
            siftUp(heap, heap.size() - 1);
        }
    }
    return heap.empty() ? 0 : heap[0];
}`,
    java: `import java.util.ArrayList;
import java.util.List;

public class LastStoneWeight {
    static void siftDown(List<Integer> heap, int n, int i) {
        while (true) {
            int largest = i;
            int l = 2 * i + 1;
            int r = 2 * i + 2;
            if (l < n && heap.get(l) > heap.get(largest)) largest = l;
            if (r < n && heap.get(r) > heap.get(largest)) largest = r;
            if (largest == i) return;
            int temp = heap.get(i);
            heap.set(i, heap.get(largest));
            heap.set(largest, temp);
            i = largest;
        }
    }

    static void siftUp(List<Integer> heap, int i) {
        while (i > 0) {
            int parent = (i - 1) / 2;
            if (heap.get(parent) >= heap.get(i)) return;
            int temp = heap.get(parent);
            heap.set(parent, heap.get(i));
            heap.set(i, temp);
            i = parent;
        }
    }

    static int popMax(List<Integer> heap) {
        int top = heap.get(0);
        heap.set(0, heap.get(heap.size() - 1));
        heap.remove(heap.size() - 1);
        siftDown(heap, heap.size(), 0);
        return top;
    }

    public static int lastStoneWeight(int[] stones) {
        List<Integer> heap = new ArrayList<>();
        for (int s : stones) heap.add(s);
        int n = heap.size();
        for (int i = n / 2 - 1; i >= 0; i--)
            siftDown(heap, n, i);
        while (heap.size() > 1) {
            int y = popMax(heap);
            int x = popMax(heap);
            if (y != x) {
                heap.add(y - x);
                siftUp(heap, heap.size() - 1);
            }
        }
        return heap.isEmpty() ? 0 : heap.get(0);
    }
}`,
    python: `def sift_down(heap, n, i):
    while True:
        largest = i
        l = 2 * i + 1
        r = 2 * i + 2
        if l < n and heap[l] > heap[largest]:
            largest = l
        if r < n and heap[r] > heap[largest]:
            largest = r
        if largest == i:
            return
        heap[i], heap[largest] = heap[largest], heap[i]
        i = largest

def sift_up(heap, i):
    while i > 0:
        parent = (i - 1) // 2
        if heap[parent] >= heap[i]:
            return
        heap[parent], heap[i] = heap[i], heap[parent]
        i = parent

def pop_max(heap):
    top = heap[0]
    heap[0] = heap[-1]
    heap.pop()
    sift_down(heap, len(heap), 0)
    return top

def last_stone_weight(stones):
    heap = stones[:]
    n = len(heap)
    for i in range(n // 2 - 1, -1, -1):
        sift_down(heap, n, i)
    while len(heap) > 1:
        y = pop_max(heap)
        x = pop_max(heap)
        if y != x:
            heap.append(y - x)
            sift_up(heap, len(heap) - 1)
    return heap[0] if heap else 0`,
  },

  // C++ and Java write `if (child < n && …) largest = child;` and `if (largest == i) return;` on one line, so the check
  // and the statement it guards share that line there; Python puts the guarded statement on its own line.
  lineMap: {
    c: {
      'init-heap': 40,
      'set-n': 42,
      'build-loop': 43,
      'call-build': 44,
      'smash-loop': 45,
      'pop-y': 46,
      'pop-x': 47,
      'check-equal': 48,
      'push-diff': 49,
      'call-siftup': 50,
      'return-result': 53,
      'pop-top': 32,
      'pop-move-last': 33,
      'pop-shrink': 34,
      'pop-call-sift': 35,
      'pop-return': 36,
      'sd-largest': 7,
      'sd-left': 8,
      'sd-right': 9,
      'sd-check-left': 10,
      'sd-take-left': 10,
      'sd-check-right': 11,
      'sd-take-right': 11,
      'sd-check-done': 12,
      'sd-return': 12,
      'sd-swap': 13,
      'sd-move': 16,
      'su-loop': 21,
      'su-parent': 22,
      'su-check': 23,
      'su-return': 23,
      'su-swap': 24,
      'su-move': 27,
    },
    cpp: {
      'init-heap': 36,
      'set-n': 37,
      'build-loop': 38,
      'call-build': 39,
      'smash-loop': 40,
      'pop-y': 41,
      'pop-x': 42,
      'check-equal': 43,
      'push-diff': 44,
      'call-siftup': 45,
      'return-result': 48,
      'pop-top': 28,
      'pop-move-last': 29,
      'pop-shrink': 30,
      'pop-call-sift': 31,
      'pop-return': 32,
      'sd-largest': 7,
      'sd-left': 8,
      'sd-right': 9,
      'sd-check-left': 10,
      'sd-take-left': 10,
      'sd-check-right': 11,
      'sd-take-right': 11,
      'sd-check-done': 12,
      'sd-return': 12,
      'sd-swap': 13,
      'sd-move': 14,
      'su-loop': 19,
      'su-parent': 20,
      'su-check': 21,
      'su-return': 21,
      'su-swap': 22,
      'su-move': 23,
    },
    java: {
      'init-heap': 40,
      'set-n': 42,
      'build-loop': 43,
      'call-build': 44,
      'smash-loop': 45,
      'pop-y': 46,
      'pop-x': 47,
      'check-equal': 48,
      'push-diff': 49,
      'call-siftup': 50,
      'return-result': 53,
      'pop-top': 32,
      'pop-move-last': 33,
      'pop-shrink': 34,
      'pop-call-sift': 35,
      'pop-return': 36,
      'sd-largest': 7,
      'sd-left': 8,
      'sd-right': 9,
      'sd-check-left': 10,
      'sd-take-left': 10,
      'sd-check-right': 11,
      'sd-take-right': 11,
      'sd-check-done': 12,
      'sd-return': 12,
      'sd-swap': 13,
      'sd-move': 16,
      'su-loop': 21,
      'su-parent': 22,
      'su-check': 23,
      'su-return': 23,
      'su-swap': 24,
      'su-move': 27,
    },
    python: {
      'init-heap': 31,
      'set-n': 32,
      'build-loop': 33,
      'call-build': 34,
      'smash-loop': 35,
      'pop-y': 36,
      'pop-x': 37,
      'check-equal': 38,
      'push-diff': 39,
      'call-siftup': 40,
      'return-result': 41,
      'pop-top': 24,
      'pop-move-last': 25,
      'pop-shrink': 26,
      'pop-call-sift': 27,
      'pop-return': 28,
      'sd-largest': 3,
      'sd-left': 4,
      'sd-right': 5,
      'sd-check-left': 6,
      'sd-take-left': 7,
      'sd-check-right': 8,
      'sd-take-right': 9,
      'sd-check-done': 10,
      'sd-return': 11,
      'sd-swap': 12,
      'sd-move': 13,
      'su-loop': 16,
      'su-parent': 17,
      'su-check': 18,
      'su-return': 19,
      'su-swap': 20,
      'su-move': 21,
    },
  },

  // C and Java swap through a temporary over three lines, where C++ calls swap() and Python uses a tuple assignment; the
  // copy is a declaration plus memcpy (C) or a declaration plus a for-each loop (Java), where C++ and Python copy in one
  // statement. The single step of each highlights all of its lines.
  lineSpans: {
    c: { 'init-heap': 2, 'sd-swap': 3, 'su-swap': 3 },
    java: { 'init-heap': 2, 'sd-swap': 3, 'su-swap': 3 },
  },

  generateSteps: generateLastStoneWeightSteps,
};
