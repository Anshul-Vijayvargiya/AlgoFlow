import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { attach, createNode, dropPointer, listFromValues, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, readValueParam } from '../../linkedList/listTrace';

const DEFAULT_VALUE = 12;

/**
 * Insert at tail with a maintained TAIL pointer (O(1), no traversal): an empty list gets the node as head and tail;
 * otherwise the old tail links to it and TAIL moves to it.
 */
function generateInsertTailSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const value = readValueParam(params, 'value', DEFAULT_VALUE, 'Insert at Tail');
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { value, length: n },
    message: `Call insertTail(${value}) on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'Because the list keeps a TAIL pointer, appending needs no traversal: the old last node links to the new one.',
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
    explanation: `A new node holding ${value} is allocated with next = NULL: it will be the last node.`,
    actionLabel: 'Allocate',
  });

  const empty = t.snap.tail === null;
  t.emit({
    type: 'condition',
    codeRef: 'check-empty',
    variables: { tail: empty ? 'NULL' : 'set' },
    result: empty ? 'true' : 'false',
    message: `tail == NULL → ${empty ? 'TRUE — the list is empty' : 'FALSE'}`,
    explanation: empty ? 'An empty list: the new node becomes both HEAD and TAIL.' : `The current last node is ${describeNode(t.snap, t.snap.tail)}.`,
    actionLabel: empty ? 'Condition TRUE' : 'Condition FALSE',
  });

  if (empty) {
    t.update(attach(setHead(t.snap, node), node));
    t.emit({
      type: 'update',
      codeRef: 'set-head-empty',
      indices: positionsOf(t.snap, node),
      message: `head = node → ${describeNode(t.snap, node)}`,
      explanation: 'HEAD points to the only node.',
      actionLabel: 'Set HEAD',
    });
    t.update(setTail(t.snap, node));
    t.emit({
      type: 'update',
      codeRef: 'set-tail-empty',
      indices: positionsOf(t.snap, node),
      message: `tail = node → ${describeNode(t.snap, node)}`,
      explanation: 'TAIL points to the same node.',
      actionLabel: 'Set TAIL',
    });
  } else {
    const oldTail = t.snap.tail!;
    t.update(attach(setNext(t.snap, oldTail, node), node));
    t.emit({
      type: 'update',
      codeRef: 'link-tail',
      indices: positionsOf(t.snap, oldTail, node),
      message: `tail.next = node — ${describeNode(t.snap, oldTail)} now points to ${describeNode(t.snap, node)}`,
      explanation: 'The old last node links to the new node, which is now part of the list.',
      actionLabel: 'Link tail',
    });
    t.update(setTail(t.snap, node));
    t.emit({
      type: 'update',
      codeRef: 'set-tail',
      indices: positionsOf(t.snap, node),
      message: `tail = node → ${describeNode(t.snap, node)}`,
      explanation: 'TAIL moves to the new last node.',
      actionLabel: 'Move TAIL',
    });
  }

  t.update(dropPointer(t.snap, 'node'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { value, length: n + 1 },
    message: `Insert complete — ${value} is the new tail (${n + 1} node${n + 1 === 1 ? '' : 's'})`,
    explanation: 'insertTail() returns in O(1) thanks to the TAIL pointer.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llInsertTailDefinition: AlgorithmDefinition = {
  id: 'll-insert-tail',
  name: 'Insert at Tail',
  category: 'LINKED_LIST',
  subtitle: 'Appends a node through the TAIL pointer in O(1).',
  description:
    'Inserting at the tail creates a node with next = NULL. With a TAIL pointer there is no traversal: the old last node links to the new node and TAIL moves to it. An empty list gets the node as both HEAD and TAIL.',
  complexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)', space: 'O(1)', bestFor: 'Queues and appending without traversal' },
  defaultInput: [4, 7, 9],
  inputSpec: { addsNode: true, value: { label: 'New value', hint: 'Value of the new last node', defaultValue: DEFAULT_VALUE } },
  visual: 'linked-list',

  code: {
    c: `void insertTail(List* list, int value) {
    Node* node = malloc(sizeof(Node));
    node->data = value;
    node->next = NULL;
    if (list->tail == NULL) {
        list->head = node;
        list->tail = node;
    } else {
        list->tail->next = node;
        list->tail = node;
    }
}`,
    cpp: `void insertTail(int value) {
    Node* node = new Node(value);
    if (tail == nullptr) {
        head = node;
        tail = node;
    } else {
        tail->next = node;
        tail = node;
    }
}`,
    java: `void insertTail(int value) {
    Node node = new Node(value);
    if (tail == null) {
        head = node;
        tail = node;
    } else {
        tail.next = node;
        tail = node;
    }
}`,
    python: `def insert_tail(self, value):
    node = Node(value)
    if self.tail is None:
        self.head = node
        self.tail = node
    else:
        self.tail.next = node
        self.tail = node`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'create-node': 2, 'check-empty': 5, 'set-head-empty': 6, 'set-tail-empty': 7, 'link-tail': 9, 'set-tail': 10 },
    cpp: { 'fn-entry': 1, 'create-node': 2, 'check-empty': 3, 'set-head-empty': 4, 'set-tail-empty': 5, 'link-tail': 7, 'set-tail': 8 },
    java: { 'fn-entry': 1, 'create-node': 2, 'check-empty': 3, 'set-head-empty': 4, 'set-tail-empty': 5, 'link-tail': 7, 'set-tail': 8 },
    python: { 'fn-entry': 1, 'create-node': 2, 'check-empty': 3, 'set-head-empty': 4, 'set-tail-empty': 5, 'link-tail': 7, 'set-tail': 8 },
  },

  // C allocates, sets the data and sets next = NULL in three statements; the other languages construct the node in one.
  lineSpans: { c: { 'create-node': 3 } },

  generateSteps: generateInsertTailSteps,
};
