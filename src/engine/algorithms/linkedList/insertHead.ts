import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { attach, createNode, dropPointer, listFromValues, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, readValueParam } from '../../linkedList/listTrace';

const DEFAULT_VALUE = 2;

/**
 * Insert at head: allocate a node, point it at the old head, make it the head; an empty list also gets it as tail.
 * The new node is "detached" from allocation until HEAD points to it.
 */
function generateInsertHeadSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const value = readValueParam(params, 'value', DEFAULT_VALUE, 'Insert at Head');
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { value, length: n },
    message: `Call insertHead(${value}) on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'The new node becomes the first node: it points to the old head, then HEAD points to it. No traversal is needed.',
    actionLabel: 'Initialize',
  });

  const created = createNode(t.snap, value);
  const node = created.id;
  t.update(setPointer(created.snapshot, 'node', node));
  t.emit({
    type: 'assign',
    codeRef: 'create-node',
    variables: { value, 'node.data': value, 'node.next': 'NULL' },
    message: `node = new node(${value})`,
    explanation: `A new node holding ${value} is allocated. It is not part of the list yet, and its next pointer is NULL.`,
    actionLabel: 'Allocate',
  });

  const oldHead = t.snap.head;
  t.update(setNext(t.snap, node, oldHead));
  t.emit({
    type: 'update',
    codeRef: 'link-node',
    variables: { 'node.next': oldHead === null ? 'NULL' : 'head' },
    indices: positionsOf(t.snap, oldHead),
    message: `node.next = head → ${describeNode(t.snap, oldHead)}`,
    explanation: oldHead === null ? 'The list is empty, so the new node’s next stays NULL.' : 'The new node now points to the current first node; the list itself has not changed yet.',
    actionLabel: 'Link node',
  });

  t.update(attach(setHead(t.snap, node), node));
  t.emit({
    type: 'update',
    codeRef: 'set-head',
    indices: positionsOf(t.snap, node),
    message: `head = node → ${describeNode(t.snap, node)}`,
    explanation: `HEAD moves to the new node, which is now the first node of the list.`,
    actionLabel: 'Move HEAD',
  });

  const tailEmpty = t.snap.tail === null;
  t.emit({
    type: 'condition',
    codeRef: 'check-tail',
    variables: { tail: tailEmpty ? 'NULL' : 'set' },
    result: tailEmpty ? 'true' : 'false',
    message: `tail == NULL → ${tailEmpty ? 'TRUE — the list was empty' : 'FALSE'}`,
    explanation: tailEmpty ? 'The list was empty, so the new node is also the last node.' : 'The tail is unchanged: the last node is still the same.',
    actionLabel: tailEmpty ? 'Condition TRUE' : 'Condition FALSE',
  });
  if (tailEmpty) {
    t.update(setTail(t.snap, node));
    t.emit({
      type: 'update',
      codeRef: 'set-tail',
      indices: positionsOf(t.snap, node),
      message: `tail = node → ${describeNode(t.snap, node)}`,
      explanation: 'TAIL points to the only node.',
      actionLabel: 'Set TAIL',
    });
  }

  t.update(dropPointer(t.snap, 'node'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { value, length: n + 1 },
    message: `Insert complete — ${value} is the new head (${n + 1} node${n + 1 === 1 ? '' : 's'})`,
    explanation: 'insertHead() returns in O(1): no node was traversed.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llInsertHeadDefinition: AlgorithmDefinition = {
  id: 'll-insert-head',
  name: 'Insert at Head',
  category: 'LINKED_LIST',
  subtitle: 'Allocates a node, points it at the old head and moves HEAD to it in O(1).',
  description:
    'Inserting at the head creates a node, links it in front of the current first node and moves HEAD to it. When the list was empty, the node also becomes the tail.',
  complexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)', space: 'O(1)', bestFor: 'Stacks and prepending without traversal' },
  defaultInput: [4, 7, 9],
  inputSpec: { addsNode: true, value: { label: 'New value', hint: 'Value of the new first node', defaultValue: DEFAULT_VALUE } },
  visual: 'linked-list',

  code: {
    c: `void insertHead(List* list, int value) {
    Node* node = malloc(sizeof(Node));
    node->data = value;
    node->next = NULL;
    node->next = list->head;
    list->head = node;
    if (list->tail == NULL) list->tail = node;
}`,
    cpp: `void insertHead(int value) {
    Node* node = new Node(value);
    node->next = head;
    head = node;
    if (tail == nullptr) tail = node;
}`,
    java: `void insertHead(int value) {
    Node node = new Node(value);
    node.next = head;
    head = node;
    if (tail == null) tail = node;
}`,
    python: `def insert_head(self, value):
    node = Node(value)
    node.next = self.head
    self.head = node
    if self.tail is None:
        self.tail = node`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'create-node': 2, 'link-node': 5, 'set-head': 6, 'check-tail': 7, 'set-tail': 7 },
    cpp: { 'fn-entry': 1, 'create-node': 2, 'link-node': 3, 'set-head': 4, 'check-tail': 5, 'set-tail': 5 },
    java: { 'fn-entry': 1, 'create-node': 2, 'link-node': 3, 'set-head': 4, 'check-tail': 5, 'set-tail': 5 },
    python: { 'fn-entry': 1, 'create-node': 2, 'link-node': 3, 'set-head': 4, 'check-tail': 5, 'set-tail': 6 },
  },

  // C allocates (malloc) and initialises data and next in three statements, so next is never shown as NULL while it
  // is really uninitialised; the other languages construct the node (next = null) in one.
  lineSpans: { c: { 'create-node': 3 } },

  generateSteps: generateInsertHeadSteps,
};
