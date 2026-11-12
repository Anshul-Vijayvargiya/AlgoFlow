import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, HeapPointer, MergeKListsView, TextField } from '../../../types/algorithm';
import { MAX_LISTS, MAX_LIST_NODES, MAX_TOTAL_NODES, sortedListsFromText } from '../../linkedList/sortedLists';
import { textInputs } from '../strings/textInput';

/**
 * Merge k Sorted Lists with a min heap of nodes. The steps follow the C listing, which writes the heap out by hand:
 *
 *   start with an empty heap; push the head of every list that is not empty;
 *   make a dummy node and point tail at it;
 *   while the heap is not empty: node = pop() (the smallest node of all the lists' fronts);
 *     tail->next = node; tail = node; if node has a successor in its own list, push it;
 *   return dummy.next.
 *
 *   push:  i = size++; heap[i] = node; while i > 0: parent = (i-1)/2; break when heap[parent]->val <= heap[i]->val, else
 *          swap and continue at parent
 *   pop:   min = heap[0]; heap[0] = heap[--size]; i = 0; then sift down: smallest = i; l = 2i+1; r = 2i+2; the left,
 *          then the right child replaces smallest when it exists and is strictly smaller; break when smallest == i, else
 *          swap and continue at smallest; return min
 *
 * No node is created or copied: the heap holds pointers to the input nodes, and the merged list is those same nodes
 * with their next pointers rewritten. A node's own next still points into its input list when it is linked (that is how
 * its successor is found); it is rewritten when the following node is linked after it. The node linked last is the last
 * node of its list, so its next is already NULL.
 *
 * The C++, Java and Python listings use their library priority queue (Python's heapq holds (value, list index, node)
 * tuples, so two nodes are never compared). Their heap work happens inside a library call, so each step inside push or
 * pop highlights the call it belongs to there: such a step's codeRef names its call site, e.g. 'su-check@head' (pushing a
 * list's head), 'su-check@next' (pushing the successor of the node just merged) and 'sd-swap@node' (the pop of a round).
 * In C every site maps to the same line of push or pop.
 *
 * Ties: every listing produces the same values in the same order, but among nodes of equal value the order the nodes
 * leave the heap is the C listing's here; a library priority queue may take equal nodes in another order.
 *
 * As in Last Stone Weight: the child checks short-circuit like the code (a child outside the heap is never read); the
 * `while (1)` line has no step of its own; swap(&a, &b) is one step at its call; a call is the call statement followed by
 * the callee's first statement; a returning pop is followed by the caller's assignment on the line of the call.
 *
 * With N nodes in k lists, each node is pushed once and popped once from a heap of at most k nodes: O(N log k) time and
 * O(k) extra space.
 */

/** the steps inside push and inside pop; their codeRefs carry the call site: `${ref}@${site}` */
export const PUSH_REFS = ['ins-index', 'ins-store', 'su-loop', 'su-parent', 'su-check', 'su-break', 'su-swap', 'su-move'] as const;
export const POP_REFS = [
  'pop-min',
  'pop-move-last',
  'pop-shrink',
  'pop-set-i',
  'sd-smallest',
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
type PushRef = (typeof PUSH_REFS)[number];
type PopRef = (typeof POP_REFS)[number];
/** where push is called from: the loop over the lists' heads, or the successor of the node just merged */
export type PushSite = 'head' | 'next';
export const PUSH_SITES: readonly PushSite[] = ['head', 'next'];
/** pop has one call site: the merge loop's node */
export const POP_SITE = 'node';

export const MERGE_K_FIELD: TextField = {
  label: 'lists',
  hint: `The lists as [[1, 4, 5], [1, 3, 4], [2, 6]]: whole numbers from -999 to 999, each list in ascending order (equal values allowed); [] inside is an empty list, and [] alone is no lists. At most ${MAX_LISTS} lists, ${MAX_LIST_NODES} nodes per list and ${MAX_TOTAL_NODES} nodes in all`,
  defaultValue: '[[1,4,5],[1,3,4],[2,6]]',
  minLength: 1,
  maxLength: 160,
  chars: { pattern: '[\\s\\S]', description: 'any characters' },
  rule: 'sorted-lists',
};

export const MERGE_K_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [MERGE_K_FIELD],
  textExamples: [
    ['[[1,4,5],[1,3,4],[2,6]]'],
    ['[[1,3,5],[2,4,6]]'],
    ['[[5],[1],[3],[2],[4]]'],
    ['[[2,2],[2],[2,2]]'],
    ['[[-5,-1,3],[],[-2,0]]'],
    ['[[1,4,7,10],[2,5,8,11],[3,6,9,12]]'],
    ['[[1,1,2],[1,2,2],[0,3]]'],
    ['[[],[7,8,9]]'],
  ],
};

/** a node while the trace is generated: the views are frozen copies, never this */
interface Node {
  readonly id: string;
  readonly value: number;
  readonly list: number;
  readonly index: number;
  next: Node | null;
}

/** freezes a value and everything inside it */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value as object)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** how a node is named in a message: its value and the list it came from */
const label = (n: Node) => `${n.value} (L${n.list})`;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function generateMergeKSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [text] = textInputs(MERGE_K_INPUT_SPEC, params, 'Merge k Sorted Lists');
  const values = sortedListsFromText(text);
  const k = values.length;
  const lists = deepFreeze(values.map(list => [...list]));
  const heads: (Node | null)[] = values.map((list, i) => {
    const nodes: Node[] = list.map((value, index) => ({ id: `l${i}n${index}`, value, list: i, index, next: null }));
    nodes.forEach((node, index) => (node.next = nodes[index + 1] ?? null));
    return nodes[0] ?? null;
  });
  const all: Node[] = heads.flatMap(head => {
    const chain: Node[] = [];
    for (let node = head; node; node = node.next) chain.push(node);
    return chain;
  });
  const total = all.length;
  const headIds = deepFreeze(heads.map(head => head?.id ?? null));

  const h: Node[] = [];
  const steps: ExecutionStep[] = [];
  const calls: string[] = [];
  const merged: Node[] = [];
  let phase: MergeKListsView['phase'] = 'build';
  let listIndex: number | null = null;
  let min: Node | null = null;
  let node: Node | null = null;
  let dummy = false;
  let tail: Node | 'dummy' | null = null;

  type Extra = Partial<Pick<MergeKListsView, 'pointers' | 'compared' | 'swapped' | 'moved' | 'removed' | 'inserted' | 'linked' | 'result'>>;
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'mergeK'>, extra: Extra = {}) => {
    const view: MergeKListsView = {
      lists,
      nodes: all.map(n => ({ id: n.id, value: n.value, list: n.list, index: n.index, next: n.next?.id ?? null })),
      heads: headIds,
      heap: h.map(n => n.id),
      phase,
      calls: [...calls],
      pointers: [],
      listIndex,
      min: min?.id ?? null,
      node: node?.id ?? null,
      dummy,
      tail: tail === null ? null : tail === 'dummy' ? 'dummy' : tail.id,
      merged: merged.map(n => n.id),
      ...extra,
    };
    steps.push({ id: steps.length, state: [], ...s, mergeK: deepFreeze(view) });
  };
  /** the named positions that are inside the heap's first `size` slots */
  const pointers = (size: number, named: Record<string, number>): HeapPointer[] =>
    Object.entries(named)
      .filter(([, index]) => index >= 0 && index < size)
      .map(([name, index]) => ({ name, index }));

  /** push(heap, &size, node), as the C listing writes it */
  function heapPush(added: Node, site: PushSite) {
    const at = (ref: PushRef) => `${ref}@${site}`;
    calls.push(`push(heap, &size, ${label(added)})`);
    let i = h.length;
    push({
      type: 'assign',
      codeRef: at('ins-index'),
      variables: { i, size: i + 1, node: label(added) },
      message: `i = size = ${i}; size → ${i + 1}`,
      explanation: `Node ${label(added)} takes the first free slot, position ${i}, so the tree stays complete.`,
      actionLabel: 'i = size++',
    });
    h.push(added);
    push(
      {
        type: 'update',
        codeRef: at('ins-store'),
        variables: { i, size: h.length, node: label(added) },
        message: `heap[${i}] = node ${label(added)}`,
        explanation: i === 0 ? `Node ${label(added)} is the only node in the heap: it is the root.` : `${added.value} may be smaller than its parent: the loop moves it up while it is.`,
        actionLabel: `Push ${added.value}`,
      },
      { pointers: pointers(h.length, { i }), inserted: i }
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
          explanation: go ? `heap[${i}] = ${h[i].value} has a parent: compare them.` : `heap[${i}] = ${h[i].value} is the root: push ends here.`,
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
          explanation: `The parent of position ${i} is position ${parent} (heap[${parent}] = ${h[parent].value}).`,
          actionLabel: 'parent',
        },
        { pointers: pointers(h.length, { i, parent }) }
      );
      const stop = h[parent].value <= h[i].value;
      push(
        {
          type: 'condition',
          codeRef: at('su-check'),
          variables: { i, parent, 'heap[parent]->val': h[parent].value, 'heap[i]->val': h[i].value },
          result: stop ? 'true' : 'false',
          message: `heap[${parent}]=${h[parent].value} <= heap[${i}]=${h[i].value} → ${stop ? 'TRUE' : 'FALSE'}`,
          explanation: stop
            ? `The parent ${h[parent].value} is not larger than ${h[i].value}: the heap property holds, so the new node stays here.`
            : `${h[i].value} is smaller than its parent ${h[parent].value}, so it moves up.`,
          actionLabel: stop ? 'In place' : 'Smaller than parent',
        },
        { pointers: pointers(h.length, { i, parent }), compared: [parent, i] }
      );
      if (stop) {
        push(
          {
            type: 'return',
            codeRef: at('su-break'),
            variables: { i },
            message: 'break — push ends',
            explanation: 'The new node has found its place. Back to the caller.',
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
          variables: { i, parent, 'heap[parent]->val': h[parent].value, 'heap[i]->val': h[i].value },
          message: `Swapped heap[${parent}] ↔ heap[${i}]  (now ${h[parent].value}, ${h[i].value})`,
          explanation: `${h[parent].value} moves up to position ${parent}; ${h[i].value} moves down to position ${i}.`,
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

  /** pop(heap, &size), as the C listing writes it, then the caller's assignment to node */
  function heapPop(): Node {
    const at = (ref: PopRef) => `${ref}@${POP_SITE}`;
    calls.push('pop(heap, &size)');
    const taken = h[0];
    min = taken;
    push({
      type: 'assign',
      codeRef: at('pop-min'),
      variables: { min: label(taken) },
      message: `min = heap[0] = node ${label(taken)}`,
      explanation: `The root of a min heap is its smallest node: ${taken.value}, from list L${taken.list}. No node still waiting in any list is smaller.`,
      actionLabel: 'min = root',
    });
    const last = h.length - 1;
    h[0] = h[last];
    push(
      {
        type: 'assign',
        codeRef: at('pop-move-last'),
        variables: { size: last, 'heap[0]->val': h[0].value },
        message: `--size → ${last}; heap[0] = heap[${last}] = node ${label(h[0])}`,
        explanation:
          last === 0
            ? 'The root is also the last node, so it is copied onto itself; its slot is no longer part of the heap.'
            : 'The last node moves to the root, so the tree stays complete. It is probably too large for the root: the loop below sifts it down.',
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
        message: `slot ${last} is outside the heap now — it holds ${count(h.length, 'node')}`,
        explanation: last === 0 ? `Node ${label(removed)} is held by min; the heap is empty.` : `Its node (${label(removed)}) is already at the root, so the slot is no longer needed.`,
        actionLabel: 'Shrink',
      },
      { removed: removed.id }
    );
    const size = h.length;
    let i = 0;
    push(
      {
        type: 'assign',
        codeRef: at('pop-set-i'),
        variables: { i, size },
        message: 'i = 0',
        explanation: size > 0 ? `Sift the new root ${h[0].value} down until it is not larger than its children.` : 'The heap is empty now: there is nothing to sift down.',
        actionLabel: 'i = 0',
      },
      { pointers: pointers(size, { i }) }
    );
    for (;;) {
      let smallest = i;
      const inHeap = i < size;
      push(
        {
          type: 'assign',
          codeRef: at('sd-smallest'),
          variables: { size, i, smallest },
          message: `smallest = i = ${i}${inHeap ? `  (heap[${i}] = ${h[i].value})` : ''}`,
          explanation: inHeap ? `Assume heap[${i}] = ${h[i].value} is the smallest of itself and its children.` : `The heap is empty (size = ${size}), so there is nothing to sift down.`,
          actionLabel: 'smallest = i',
        },
        { pointers: pointers(size, { i, smallest }) }
      );

      const l = 2 * i + 1;
      const r = 2 * i + 2;
      const named = () => pointers(size, { i, l, r, smallest });
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
        const smaller = exists && h[c].value < h[smallest].value;
        push(
          {
            type: 'condition',
            codeRef: at(side === 'left' ? 'sd-check-left' : 'sd-check-right'),
            variables: exists
              ? { size, [name]: c, smallest, [`heap[${name}]->val`]: h[c].value, 'heap[smallest]->val': h[smallest].value }
              : { size, [name]: c, smallest },
            result: smaller ? 'true' : 'false',
            message: exists
              ? `${name}=${c} < size=${size} && heap[${c}]=${h[c].value} < heap[smallest=${smallest}]=${h[smallest].value} → ${smaller ? 'TRUE' : 'FALSE'}`
              : `${name}=${c} < size=${size} → FALSE — no ${side} child, heap[${c}] is not read`,
            explanation: !exists
              ? `The ${side} child position ${c} is outside the heap, so the && stops before comparing anything.`
              : smaller
                ? `The ${side} child ${h[c].value} is smaller than ${h[smallest].value}.`
                : `The ${side} child ${h[c].value} is not smaller than ${h[smallest].value}${h[c].value === h[smallest].value ? ' (equal does not count: the node above stays)' : ''}.`,
            actionLabel: smaller ? 'Child smaller' : exists ? 'Not smaller' : `No ${side} child`,
          },
          { pointers: named(), compared: exists ? [c, smallest] : [] }
        );
        if (smaller) {
          smallest = c;
          push(
            {
              type: 'assign',
              codeRef: at(side === 'left' ? 'sd-take-left' : 'sd-take-right'),
              variables: { size, i, smallest, 'heap[smallest]->val': h[smallest].value },
              message: `smallest = ${name} = ${c}  (heap[${c}] = ${h[c].value})`,
              explanation: `The ${side} child is the smallest so far.`,
              actionLabel: `smallest = ${name}`,
            },
            { pointers: named() }
          );
        }
      }

      const done = smallest === i;
      push(
        {
          type: 'condition',
          codeRef: at('sd-check-done'),
          variables: { size, i, smallest },
          result: done ? 'true' : 'false',
          message: `smallest(${smallest}) == i(${i}) → ${done ? 'TRUE' : 'FALSE — a child is smaller'}`,
          explanation: done
            ? inHeap
              ? `heap[${i}] = ${h[i].value} is not larger than its children: the heap is a min heap again.`
              : 'There is no node to move.'
            : `The child heap[${smallest}] = ${h[smallest].value} is smaller than heap[${i}] = ${h[i].value}, so they swap.`,
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
            explanation: 'Leave the loop; pop returns the node it took.',
            actionLabel: 'Break',
          },
          { pointers: pointers(size, { i }) }
        );
        break;
      }

      [h[i], h[smallest]] = [h[smallest], h[i]];
      push(
        {
          type: 'swap',
          codeRef: at('sd-swap'),
          variables: { size, i, smallest, 'heap[i]->val': h[i].value, 'heap[smallest]->val': h[smallest].value },
          message: `Swapped heap[${i}] ↔ heap[${smallest}]  (now ${h[i].value}, ${h[smallest].value})`,
          explanation: `The smaller node ${h[i].value} moves up. ${h[smallest].value} may still be larger than its new children, so the sift continues at position ${smallest}.`,
          actionLabel: 'Swap down',
        },
        { pointers: named(), swapped: [i, smallest] }
      );
      i = smallest;
      push(
        {
          type: 'assign',
          codeRef: at('sd-move'),
          variables: { size, i },
          message: `i = smallest = ${i}`,
          explanation: `Continue sifting heap[${i}] = ${h[i].value} down from position ${i}.`,
          actionLabel: 'i = smallest',
        },
        { pointers: pointers(size, { i }) }
      );
    }
    push({
      type: 'return',
      codeRef: at('pop-return'),
      variables: { min: label(taken) },
      message: `return min — node ${label(taken)}`,
      explanation: `pop hands back the smallest node, ${taken.value} from list L${taken.list}.`,
      actionLabel: 'Return min',
    });
    calls.pop();
    node = taken;
    min = null;
    push({
      type: 'assign',
      codeRef: 'pop-node',
      variables: { node: label(taken), size: h.length },
      message: `node = ${label(taken)}`,
      explanation: `Node ${taken.value} of list L${taken.list} is the next node of the merged list.`,
      actionLabel: `node = ${taken.value}`,
    });
    return taken;
  }

  calls.push(`mergeKLists(lists, ${k})`);
  push({
    type: 'init',
    codeRef: 'init-heap',
    variables: { listsSize: k, nodes: total },
    message: `heap = an empty array with room for ${count(Math.max(k, 1), 'node')}`,
    explanation:
      k === 0
        ? 'There are no lists. The array still gets one slot (C does not allow an array of 0 elements), and it stays empty.'
        : `The heap never holds more than one node per list: ${count(k, 'slot')} for ${count(k, 'list')}, however many nodes they have (${total} here).`,
    actionLabel: 'Create heap',
  });
  push({
    type: 'assign',
    codeRef: 'set-size',
    variables: { size: 0 },
    message: 'size = 0',
    explanation: 'The heap is empty. It will hold pointers to the input nodes: no node is copied.',
    actionLabel: 'size = 0',
  });

  for (let i = 0; ; i++) {
    listIndex = i;
    const go = i < k;
    push({
      type: 'loop-condition',
      codeRef: 'build-loop',
      variables: { i, listsSize: k },
      result: go ? 'true' : 'false',
      message: `i=${i} < listsSize=${k} → ${go ? 'true' : 'false'}`,
      explanation: go ? `Look at list L${i}.` : k === 0 ? 'There are no lists to look at.' : `Every list has been looked at: the heap holds ${count(h.length, 'head')}.`,
      actionLabel: go ? `List L${i}` : 'Heads done',
    });
    if (!go) break;
    const head = heads[i];
    push({
      type: 'condition',
      codeRef: 'check-head',
      variables: { i, 'lists[i]': head ? label(head) : 'NULL' },
      result: head ? 'true' : 'false',
      message: `lists[${i}] != NULL → ${head ? `TRUE (head ${head.value})` : 'FALSE — list L' + i + ' is empty'}`,
      explanation: head ? `List L${i} starts with ${head.value}, its smallest value: only this node can be the next of the merged list from L${i}.` : `An empty list has no node to offer: nothing is pushed for L${i}.`,
      actionLabel: head ? 'Has head' : 'Empty list',
    });
    if (head) {
      push({
        type: 'update',
        codeRef: 'push-head',
        variables: { i, node: label(head), size: h.length },
        message: `push(heap, &size, lists[${i}]) — node ${label(head)}`,
        explanation: `The head of L${i} goes into the heap.`,
        actionLabel: `Push head ${head.value}`,
      });
      heapPush(head, 'head');
    }
  }
  listIndex = null;

  phase = 'merge';
  dummy = true;
  push({
    type: 'init',
    codeRef: 'init-dummy',
    variables: { 'dummy.next': 'NULL' },
    message: 'dummy.next = NULL',
    explanation: 'A dummy node stands before the merged list, so the first real node is linked like every other one. It is a local variable, not a list node.',
    actionLabel: 'Create dummy',
  });
  tail = 'dummy';
  push({
    type: 'assign',
    codeRef: 'init-tail',
    variables: { tail: 'dummy' },
    message: 'tail = &dummy',
    explanation: 'tail is the last node of the merged list so far: the dummy, while the list is empty.',
    actionLabel: 'tail = dummy',
  });

  for (;;) {
    const go = h.length > 0;
    push({
      type: 'loop-condition',
      codeRef: 'merge-loop',
      variables: { size: h.length, merged: merged.length },
      result: go ? 'true' : 'false',
      message: `size=${h.length} > 0 → ${go ? 'true' : 'false'}`,
      explanation: go
        ? `The heap holds the first unmerged node of ${count(h.length, 'list')}: the smallest of them is the next node.`
        : total === 0
          ? 'The heap is empty and nothing was merged: there were no nodes.'
          : `The heap is empty: all ${count(total, 'node')} are in the merged list.`,
      actionLabel: go ? 'Heap not empty' : 'Heap empty',
    });
    if (!go) break;

    const taken = heapPop();
    const before = tail as Node | 'dummy';
    if (before !== 'dummy') before.next = taken;
    merged.push(taken);
    push(
      {
        type: 'update',
        codeRef: 'link-node',
        variables: { tail: before === 'dummy' ? 'dummy' : label(before), node: label(taken) },
        message: `tail->next = node — ${before === 'dummy' ? 'dummy' : before.value} → ${taken.value}`,
        explanation:
          before === 'dummy'
            ? `Node ${label(taken)} becomes the first node of the merged list. The node itself is linked: nothing is copied.`
            : `Node ${label(taken)} is linked after ${before.value}. The node itself is linked: nothing is copied.`,
        actionLabel: `Link ${taken.value}`,
      },
      { linked: taken.id }
    );
    tail = taken;
    push({
      type: 'assign',
      codeRef: 'advance-tail',
      variables: { tail: label(taken) },
      message: `tail = node — ${label(taken)}`,
      explanation: `The merged list now ends at ${taken.value}.`,
      actionLabel: 'tail = node',
    });
    const successor = taken.next;
    push({
      type: 'condition',
      codeRef: 'check-next',
      variables: { node: label(taken), 'node->next': successor ? label(successor) : 'NULL' },
      result: successor ? 'true' : 'false',
      message: `node->next != NULL → ${successor ? `TRUE (next is ${successor.value})` : `FALSE — list L${taken.list} is used up`}`,
      explanation: successor
        ? `List L${taken.list} goes on with ${successor.value}: that node now stands for L${taken.list} in the heap.`
        : `Node ${taken.value} was the last node of L${taken.list}: nothing is pushed, and the heap has one node fewer.`,
      actionLabel: successor ? 'Has next' : 'List used up',
    });
    if (successor) {
      push({
        type: 'update',
        codeRef: 'push-next',
        variables: { node: label(successor), size: h.length },
        message: `push(heap, &size, node->next) — node ${label(successor)}`,
        explanation: `The next node of L${taken.list} goes into the heap.`,
        actionLabel: `Push next ${successor.value}`,
      });
      heapPush(successor, 'next');
    }
  }

  phase = 'done';
  calls.pop();
  const result = merged.map(n => n.value);
  const resultText =
    total === 0
      ? k === 0
        ? 'No lists: the merged list is empty (NULL)'
        : `${k === 1 ? 'The list is' : `All ${k} lists are`} empty: the merged list is empty (NULL)`
      : `Merged ${count(total, 'node')} from ${count(k, 'list')}: ${result.join(' → ')}`;
  push(
    {
      type: 'complete',
      codeRef: 'return-result',
      variables: { 'dummy.next': merged[0] ? label(merged[0]) : 'NULL', nodes: total },
      message: `return dummy.next — ${merged[0] ? `node ${label(merged[0])}` : 'NULL'}`,
      explanation:
        total === 0
          ? 'Nothing was linked after the dummy, so the merged list is empty.'
          : `Every node was pushed once and popped once from a heap of at most ${count(k, 'node')}: O(N log k) time with O(k) extra space. The merged list is made of the input nodes themselves.`,
      actionLabel: 'Done',
      outcomeText: resultText,
    },
    { result: { values: result, text: resultText } }
  );
  return steps;
}

const CODE = {
  c: `#include <stdlib.h>

struct ListNode {
    int val;
    struct ListNode *next;
};

void swap(struct ListNode **a, struct ListNode **b) {
    struct ListNode *temp = *a;
    *a = *b;
    *b = temp;
}

// Insert a node into the Min Heap
void push(struct ListNode *heap[], int *size, struct ListNode *node) {
    int i = (*size)++;
    heap[i] = node;

    while (i > 0) {
        int parent = (i - 1) / 2;

        if (heap[parent]->val <= heap[i]->val)
            break;

        swap(&heap[parent], &heap[i]);
        i = parent;
    }
}

// Remove the node with the smallest value
struct ListNode *pop(struct ListNode *heap[], int *size) {
    struct ListNode *min = heap[0];

    heap[0] = heap[--(*size)];

    int i = 0;

    while (1) {
        int smallest = i;
        int l = 2 * i + 1;
        int r = 2 * i + 2;

        if (l < *size && heap[l]->val < heap[smallest]->val)
            smallest = l;

        if (r < *size && heap[r]->val < heap[smallest]->val)
            smallest = r;

        if (smallest == i)
            break;

        swap(&heap[i], &heap[smallest]);
        i = smallest;
    }

    return min;
}

struct ListNode *mergeKLists(struct ListNode **lists, int listsSize) {

    struct ListNode *heap[listsSize > 0 ? listsSize : 1];
    int size = 0;

    // Add the head of every non-empty list
    for (int i = 0; i < listsSize; i++) {
        if (lists[i] != NULL) {
            push(heap, &size, lists[i]);
        }
    }

    struct ListNode dummy;
    dummy.next = NULL;
    struct ListNode *tail = &dummy;

    while (size > 0) {

        struct ListNode *node = pop(heap, &size);

        tail->next = node;
        tail = node;

        if (node->next != NULL) {
            push(heap, &size, node->next);
        }
    }

    return dummy.next;
}`,
  cpp: `#include <vector>
#include <queue>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode(int x) : val(x), next(nullptr) {}
};

// Orders the queue so that the smallest value is on top
struct Compare {
    bool operator()(const ListNode *a, const ListNode *b) const {
        return a->val > b->val;
    }
};

class Solution {
public:
    ListNode *mergeKLists(vector<ListNode *> &lists) {

        priority_queue<ListNode *, vector<ListNode *>, Compare> pq;

        // Add the head of every non-empty list
        for (int i = 0; i < (int)lists.size(); i++) {
            if (lists[i] != nullptr) {
                pq.push(lists[i]);
            }
        }

        ListNode dummy(0);
        ListNode *tail = &dummy;

        while (!pq.empty()) {

            ListNode *node = pq.top();
            pq.pop();

            tail->next = node;
            tail = node;

            if (node->next != nullptr) {
                pq.push(node->next);
            }
        }

        return dummy.next;
    }
};`,
  java: `import java.util.*;

class ListNode {
    int val;
    ListNode next;

    ListNode(int val) {
        this.val = val;
    }
}

class Solution {
    public ListNode mergeKLists(ListNode[] lists) {

        PriorityQueue<ListNode> pq =
            new PriorityQueue<>((a, b) -> Integer.compare(a.val, b.val));

        // Add the head of every non-empty list
        for (int i = 0; i < lists.length; i++) {
            if (lists[i] != null) {
                pq.add(lists[i]);
            }
        }

        ListNode dummy = new ListNode(0);
        ListNode tail = dummy;

        while (!pq.isEmpty()) {

            ListNode node = pq.poll();

            tail.next = node;
            tail = node;

            if (node.next != null) {
                pq.add(node.next);
            }
        }

        return dummy.next;
    }
}`,
  python: `import heapq

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class Solution:
    def mergeKLists(self, lists):

        # Entries are (value, list index, node): two nodes are never compared
        heap = []

        # Add the head of every non-empty list
        for i in range(len(lists)):
            if lists[i] is not None:
                heapq.heappush(heap, (lists[i].val, i, lists[i]))

        dummy = ListNode()
        tail = dummy

        while heap:

            val, i, node = heapq.heappop(heap)

            tail.next = node
            tail = node

            if node.next is not None:
                heapq.heappush(heap, (node.next.val, i, node.next))

        return dummy.next`,
};

/** the 1-based number of the line of a listing that is exactly `text` (apart from its indentation); the nth such line */
function lineOf(code: string, text: string, nth = 0): number {
  const found = code
    .split('\n')
    .map((line, k) => (line.trim() === text ? k + 1 : 0))
    .filter(Boolean);
  if (found[nth] === undefined) throw new Error(`Merge k Sorted Lists: no line "${text}" (occurrence ${nth + 1}) in its listing`);
  return found[nth];
}

/**
 * A line map for the steps inside push and pop, from where each call site's steps go in a listing: C maps every site to
 * the line of the statement itself; the library listings map each site to its library call.
 */
function siteLines(pushLine: (ref: PushRef, site: PushSite) => number, popLine: (ref: PopRef) => number): Record<string, number> {
  const map: Record<string, number> = {};
  for (const site of PUSH_SITES) for (const ref of PUSH_REFS) map[`${ref}@${site}`] = pushLine(ref, site);
  for (const ref of POP_REFS) map[`${ref}@${POP_SITE}`] = popLine(ref);
  return map;
}

const c = (text: string, nth = 0) => lineOf(CODE.c, text, nth);
const cpp = (text: string) => lineOf(CODE.cpp, text);
const java = (text: string) => lineOf(CODE.java, text);
const py = (text: string) => lineOf(CODE.python, text);

const C_PUSH: Record<PushRef, number> = {
  'ins-index': c('int i = (*size)++;'),
  'ins-store': c('heap[i] = node;'),
  'su-loop': c('while (i > 0) {'),
  'su-parent': c('int parent = (i - 1) / 2;'),
  'su-check': c('if (heap[parent]->val <= heap[i]->val)'),
  'su-break': c('break;', 0),
  'su-swap': c('swap(&heap[parent], &heap[i]);'),
  'su-move': c('i = parent;'),
};
const C_POP: Record<PopRef, number> = {
  'pop-min': c('struct ListNode *min = heap[0];'),
  'pop-move-last': c('heap[0] = heap[--(*size)];'),
  'pop-shrink': c('heap[0] = heap[--(*size)];'),
  'pop-set-i': c('int i = 0;'),
  'sd-smallest': c('int smallest = i;'),
  'sd-left': c('int l = 2 * i + 1;'),
  'sd-right': c('int r = 2 * i + 2;'),
  'sd-check-left': c('if (l < *size && heap[l]->val < heap[smallest]->val)'),
  'sd-take-left': c('smallest = l;'),
  'sd-check-right': c('if (r < *size && heap[r]->val < heap[smallest]->val)'),
  'sd-take-right': c('smallest = r;'),
  'sd-check-done': c('if (smallest == i)'),
  'sd-break': c('break;', 1),
  'sd-swap': c('swap(&heap[i], &heap[smallest]);'),
  'sd-move': c('i = smallest;'),
  'pop-return': c('return min;'),
};

export const mergeKSortedListsDefinition: AlgorithmDefinition = {
  id: 'heap-merge-k-sorted-lists',
  name: 'Merge k Sorted Lists',
  category: 'HEAP',
  visual: 'k-lists',
  subtitle: 'A min heap of list heads gives the next smallest node in O(log k).',
  description:
    'Given k linked lists, each sorted in ascending order, link all their nodes into one sorted list. The next node of the merged list is always the smallest of the lists’ first unmerged nodes, so only those k nodes need to be compared. A min heap holds them: the head of every non-empty list goes in first; then, while the heap is not empty, the smallest node is popped, linked after the tail of the merged list, and replaced in the heap by its successor in its own list, if it has one. Each of the N nodes is pushed once and popped once from a heap of at most k nodes: O(N log k) time and O(k) extra space. No node is created: the merged list is made of the input nodes. The C listing writes the heap out and the steps follow it; C++ and Java use their priority queue with a comparator, and Python uses heapq with (value, list index, node) entries. Nodes of equal value may leave a library queue in another order than shown here; the merged values are the same.',
  complexity: {
    best: 'O(N log k)',
    average: 'O(N log k)',
    worst: 'O(N log k)',
    space: 'O(k)',
    bestFor: 'Merging many sorted sequences: only k candidates are compared at a time',
  },
  defaultInput: [],
  inputSpec: MERGE_K_INPUT_SPEC,

  code: CODE,

  // C: every step on its own statement. The library listings: a step inside push or pop highlights the library call it
  // belongs to (C++ reads the smallest node with top() and removes it with pop(): pop's first step is the top() line,
  // the rest the pop() line).
  lineMap: {
    c: {
      'init-heap': c('struct ListNode *heap[listsSize > 0 ? listsSize : 1];'),
      'set-size': c('int size = 0;'),
      'build-loop': c('for (int i = 0; i < listsSize; i++) {'),
      'check-head': c('if (lists[i] != NULL) {'),
      'push-head': c('push(heap, &size, lists[i]);'),
      'init-dummy': c('dummy.next = NULL;'),
      'init-tail': c('struct ListNode *tail = &dummy;'),
      'merge-loop': c('while (size > 0) {'),
      'pop-node': c('struct ListNode *node = pop(heap, &size);'),
      'link-node': c('tail->next = node;'),
      'advance-tail': c('tail = node;'),
      'check-next': c('if (node->next != NULL) {'),
      'push-next': c('push(heap, &size, node->next);'),
      'return-result': c('return dummy.next;'),
      ...siteLines(
        ref => C_PUSH[ref],
        ref => C_POP[ref]
      ),
    },
    cpp: {
      'init-heap': cpp('priority_queue<ListNode *, vector<ListNode *>, Compare> pq;'),
      'set-size': cpp('priority_queue<ListNode *, vector<ListNode *>, Compare> pq;'),
      'build-loop': cpp('for (int i = 0; i < (int)lists.size(); i++) {'),
      'check-head': cpp('if (lists[i] != nullptr) {'),
      'push-head': cpp('pq.push(lists[i]);'),
      'init-dummy': cpp('ListNode dummy(0);'),
      'init-tail': cpp('ListNode *tail = &dummy;'),
      'merge-loop': cpp('while (!pq.empty()) {'),
      'pop-node': cpp('ListNode *node = pq.top();'),
      'link-node': cpp('tail->next = node;'),
      'advance-tail': cpp('tail = node;'),
      'check-next': cpp('if (node->next != nullptr) {'),
      'push-next': cpp('pq.push(node->next);'),
      'return-result': cpp('return dummy.next;'),
      ...siteLines(
        (_ref, site) => cpp(site === 'head' ? 'pq.push(lists[i]);' : 'pq.push(node->next);'),
        ref => cpp(ref === 'pop-min' ? 'ListNode *node = pq.top();' : 'pq.pop();')
      ),
    },
    java: {
      'init-heap': java('PriorityQueue<ListNode> pq ='),
      'set-size': java('PriorityQueue<ListNode> pq ='),
      'build-loop': java('for (int i = 0; i < lists.length; i++) {'),
      'check-head': java('if (lists[i] != null) {'),
      'push-head': java('pq.add(lists[i]);'),
      'init-dummy': java('ListNode dummy = new ListNode(0);'),
      'init-tail': java('ListNode tail = dummy;'),
      'merge-loop': java('while (!pq.isEmpty()) {'),
      'pop-node': java('ListNode node = pq.poll();'),
      'link-node': java('tail.next = node;'),
      'advance-tail': java('tail = node;'),
      'check-next': java('if (node.next != null) {'),
      'push-next': java('pq.add(node.next);'),
      'return-result': java('return dummy.next;'),
      ...siteLines(
        (_ref, site) => java(site === 'head' ? 'pq.add(lists[i]);' : 'pq.add(node.next);'),
        () => java('ListNode node = pq.poll();')
      ),
    },
    python: {
      'init-heap': py('heap = []'),
      'set-size': py('heap = []'),
      'build-loop': py('for i in range(len(lists)):'),
      'check-head': py('if lists[i] is not None:'),
      'push-head': py('heapq.heappush(heap, (lists[i].val, i, lists[i]))'),
      'init-dummy': py('dummy = ListNode()'),
      'init-tail': py('tail = dummy'),
      'merge-loop': py('while heap:'),
      'pop-node': py('val, i, node = heapq.heappop(heap)'),
      'link-node': py('tail.next = node'),
      'advance-tail': py('tail = node'),
      'check-next': py('if node.next is not None:'),
      'push-next': py('heapq.heappush(heap, (node.next.val, i, node.next))'),
      'return-result': py('return dummy.next'),
      ...siteLines(
        (_ref, site) => py(site === 'head' ? 'heapq.heappush(heap, (lists[i].val, i, lists[i]))' : 'heapq.heappush(heap, (node.next.val, i, node.next))'),
        () => py('val, i, node = heapq.heappop(heap)')
      ),
    },
  },

  // Java declares its priority queue over two lines: the steps that create it highlight both.
  lineSpans: {
    java: { 'init-heap': 2, 'set-size': 2 },
  },
  // C declares the dummy node on the line before the one that clears its next pointer: one step, both lines.
  lineLeads: {
    c: { 'init-dummy': 1 },
  },

  generateSteps: generateMergeKSteps,
};
