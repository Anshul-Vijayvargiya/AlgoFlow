import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { attach, createNode, dropPointer, emptyList, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf } from '../../linkedList/listTrace';

/**
 * Build a list from an array of values: start empty, then append each value through TAIL. The first node becomes
 * HEAD; every later node is linked from the old tail. Each new node is "detached" from allocation until a link or
 * HEAD reaches it, so the snapshots show it outside the list for exactly one statement.
 */
function generateBuildSteps(input: number[]): ExecutionStep[] {
  const values = [...input];
  const n = values.length;
  const t = createListTrace(emptyList());

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { n, values: `[${values.join(', ')}]` },
    message: `Call build([${values.join(', ')}]) — ${n} value${n === 1 ? '' : 's'}`,
    explanation: 'The list is built by appending each value at the tail, so the nodes keep the order of the array.',
    actionLabel: 'Initialize',
  });

  t.emit({
    type: 'assign',
    codeRef: 'init-list',
    variables: { head: 'NULL', tail: 'NULL' },
    message: 'head = NULL, tail = NULL — the list starts empty',
    explanation: 'An empty list has no first and no last node.',
    actionLabel: 'Empty list',
  });

  t.emit({
    type: 'assign',
    codeRef: 'init-i',
    variables: { i: 0, n },
    message: 'i = 0',
    explanation: 'The loop index starts at the first value.',
    actionLabel: 'i = 0',
  });

  for (let i = 0; ; i++) {
    const go = i < n;
    t.emit({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { i, n },
      result: go ? 'true' : 'false',
      message: `i < n → ${i} < ${n} → ${go ? 'TRUE' : 'FALSE — every value has been added'}`,
      explanation: go ? `values[${i}] = ${values[i]} is next.` : `The list now holds all ${n} value${n === 1 ? '' : 's'}.`,
      actionLabel: go ? 'Loop TRUE' : 'Loop FALSE',
    });
    if (!go) break;

    const value = values[i];
    const created = createNode(t.snap, value);
    const node = created.id;
    t.update(setPointer(created.snapshot, 'node', node));
    t.emit({
      type: 'assign',
      codeRef: 'create-node',
      variables: { i, 'node.data': value, 'node.next': 'NULL' },
      message: `node = new node(${value})`,
      explanation: `A new node holding ${value} is allocated with next = NULL. It is not part of the list yet.`,
      actionLabel: 'Allocate',
    });

    const empty = t.snap.head === null;
    t.emit({
      type: 'condition',
      codeRef: 'check-empty',
      variables: { head: empty ? 'NULL' : 'set' },
      result: empty ? 'true' : 'false',
      message: `head == NULL → ${empty ? 'TRUE — this is the first node' : 'FALSE'}`,
      explanation: empty ? 'The list is empty, so the new node becomes HEAD.' : `The new node goes after the current last node, ${describeNode(t.snap, t.snap.tail)}.`,
      actionLabel: empty ? 'Condition TRUE' : 'Condition FALSE',
    });

    if (empty) {
      t.update(attach(setHead(t.snap, node), node));
      t.emit({
        type: 'update',
        codeRef: 'set-head',
        indices: positionsOf(t.snap, node),
        message: `head = node → ${describeNode(t.snap, node)}`,
        explanation: 'HEAD points to the first node. TAIL is still NULL until the next statement.',
        actionLabel: 'Set HEAD',
      });
    } else {
      const oldTail = t.snap.tail!;
      t.update(attach(setNext(t.snap, oldTail, node), node));
      t.emit({
        type: 'update',
        codeRef: 'link-tail',
        indices: positionsOf(t.snap, oldTail, node),
        message: `tail.next = node — ${describeNode(t.snap, oldTail)} now points to ${describeNode(t.snap, node)}`,
        explanation: 'The old last node links to the new node, which is now part of the list. TAIL moves next.',
        actionLabel: 'Link tail',
      });
    }

    t.update(setTail(t.snap, node));
    t.emit({
      type: 'update',
      codeRef: 'set-tail',
      indices: positionsOf(t.snap, node),
      message: `tail = node → ${describeNode(t.snap, node)}`,
      explanation: 'TAIL moves to the new last node.',
      actionLabel: 'Move TAIL',
    });

    t.emit({
      type: 'increment',
      codeRef: 'inc-i',
      variables: { i: i + 1, n },
      message: `i++ → i = ${i + 1}`,
      explanation: 'Move on to the next value.',
      actionLabel: 'i++',
    });
  }

  t.update(dropPointer(t.snap, 'node'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { length: n },
    message: n === 0 ? 'Build complete — the list is empty' : `Build complete — ${n} node${n === 1 ? '' : 's'}, HEAD → ${values[0]}, TAIL → ${values[n - 1]}`,
    explanation: 'Each value was appended in O(1) through TAIL, so building takes O(n).',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llBuildDefinition: AlgorithmDefinition = {
  id: 'll-build',
  name: 'Build Linked List',
  category: 'LINKED_LIST',
  subtitle: 'Creates a list from an array by appending each value at the tail.',
  description:
    'Building a linked list starts with HEAD and TAIL set to NULL. Each value gets a new node: the first node becomes HEAD, every later node is linked from the current last node, and TAIL moves to the new node. With a TAIL pointer every append is O(1), so the whole build is O(n).',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(n)', bestFor: 'Turning an array of values into a linked list' },
  defaultInput: [4, 7, 1, 9],
  visual: 'linked-list',

  code: {
    c: `void build(List* list, int values[], int n) {
    list->head = NULL;
    list->tail = NULL;
    for (int i = 0; i < n; i++) {
        Node* node = malloc(sizeof(Node));
        node->data = values[i];
        node->next = NULL;
        if (list->head == NULL) list->head = node;
        else list->tail->next = node;
        list->tail = node;
    }
}`,
    cpp: `void build(const vector<int>& values) {
    head = nullptr;
    tail = nullptr;
    for (size_t i = 0; i < values.size(); i++) {
        Node* node = new Node(values[i]);
        if (head == nullptr) head = node;
        else tail->next = node;
        tail = node;
    }
}`,
    java: `void build(int[] values) {
    head = null;
    tail = null;
    for (int i = 0; i < values.length; i++) {
        Node node = new Node(values[i]);
        if (head == null) head = node;
        else tail.next = node;
        tail = node;
    }
}`,
    python: `def build(self, values):
    self.head = None
    self.tail = None
    for i in range(len(values)):
        node = Node(values[i])
        if self.head is None:
            self.head = node
        else:
            self.tail.next = node
        self.tail = node`,
  },

  // The for header holds the initialisation, the condition and the increment, as in the array listings.
  lineMap: {
    c: { 'fn-entry': 1, 'init-list': 2, 'init-i': 4, loop: 4, 'create-node': 5, 'check-empty': 8, 'set-head': 8, 'link-tail': 9, 'set-tail': 10, 'inc-i': 4 },
    cpp: { 'fn-entry': 1, 'init-list': 2, 'init-i': 4, loop: 4, 'create-node': 5, 'check-empty': 6, 'set-head': 6, 'link-tail': 7, 'set-tail': 8, 'inc-i': 4 },
    java: { 'fn-entry': 1, 'init-list': 2, 'init-i': 4, loop: 4, 'create-node': 5, 'check-empty': 6, 'set-head': 6, 'link-tail': 7, 'set-tail': 8, 'inc-i': 4 },
    python: { 'fn-entry': 1, 'init-list': 2, 'init-i': 4, loop: 4, 'create-node': 5, 'check-empty': 6, 'set-head': 7, 'link-tail': 9, 'set-tail': 10, 'inc-i': 4 },
  },

  // head = NULL and tail = NULL are one step (the list starts empty); C allocates, sets data and sets next = NULL.
  lineSpans: {
    c: { 'init-list': 2, 'create-node': 3 },
    cpp: { 'init-list': 2 },
    java: { 'init-list': 2 },
    python: { 'init-list': 2 },
  },

  generateSteps: generateBuildSteps,
};
