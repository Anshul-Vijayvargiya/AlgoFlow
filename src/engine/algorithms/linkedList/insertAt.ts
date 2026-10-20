import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { attach, createNode, dropPointer, listFromValues, nodeById, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, readIndexParam, readValueParam, valueAt } from '../../linkedList/listTrace';

const DEFAULT_VALUE = 5;
const DEFAULT_INDEX = 2;

/**
 * Insert at a position (0..length). Index 0 is an insert at head (an empty list also gets the node as TAIL).
 * Otherwise prev walks index − 1 steps to the node before the position, the new node takes over prev's next, prev
 * links to it, and TAIL moves when the node was appended after the old tail. The index is validated before the call.
 */
function generateInsertAtSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const value = readValueParam(params, 'value', DEFAULT_VALUE, 'Insert at Position');
  const index = readIndexParam(params, llInsertAtDefinition.inputSpec!.index!, input.length, 'Insert at Position');
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { index, value, length: n },
    message: `Call insertAt(${index}, ${value}) on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation:
      index === 0
        ? 'Position 0 is the front of the list: the new node becomes the head.'
        : `The new node goes after the node at position ${index - 1}, which is found by walking from HEAD.`,
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
    explanation: `A new node holding ${value} is allocated with next = NULL. It is not part of the list yet.`,
    actionLabel: 'Allocate',
  });

  const atHead = index === 0;
  t.emit({
    type: 'condition',
    codeRef: 'check-zero',
    variables: { index },
    result: atHead ? 'true' : 'false',
    message: `index == 0 → ${atHead ? 'TRUE — insert at the head' : 'FALSE'}`,
    explanation: atHead ? 'The new node becomes the first node.' : 'Find the node before the position first.',
    actionLabel: atHead ? 'Condition TRUE' : 'Condition FALSE',
  });

  if (atHead) {
    const oldHead = t.snap.head;
    t.update(setNext(t.snap, node, oldHead));
    t.emit({
      type: 'update',
      codeRef: 'link-head',
      variables: { 'node.next': oldHead === null ? 'NULL' : 'head' },
      indices: positionsOf(t.snap, oldHead),
      message: `node.next = head → ${describeNode(t.snap, oldHead)}`,
      explanation: oldHead === null ? 'The list is empty, so the new node’s next stays NULL.' : 'The new node points to the current first node; the list itself has not changed yet.',
      actionLabel: 'Link node',
    });
    t.update(attach(setHead(t.snap, node), node));
    t.emit({
      type: 'update',
      codeRef: 'set-head',
      indices: positionsOf(t.snap, node),
      message: `head = node → ${describeNode(t.snap, node)}`,
      explanation: oldHead === null ? 'HEAD points to the only node. TAIL is still NULL until it is set below.' : 'HEAD moves to the new node, which is now the first node.',
      actionLabel: 'Move HEAD',
    });
    const tailEmpty = t.snap.tail === null;
    t.emit({
      type: 'condition',
      codeRef: 'check-tail-empty',
      variables: { tail: tailEmpty ? 'NULL' : 'set' },
      result: tailEmpty ? 'true' : 'false',
      message: `tail == NULL → ${tailEmpty ? 'TRUE — the list was empty' : 'FALSE'}`,
      explanation: tailEmpty ? 'The new node is also the last node.' : 'TAIL is unchanged: the last node is still the last node.',
      actionLabel: tailEmpty ? 'Condition TRUE' : 'Condition FALSE',
    });
    if (tailEmpty) {
      t.update(setTail(t.snap, node));
      t.emit({
        type: 'update',
        codeRef: 'set-tail-empty',
        indices: positionsOf(t.snap, node),
        message: `tail = node → ${describeNode(t.snap, node)}`,
        explanation: 'HEAD and TAIL both point to the only node.',
        actionLabel: 'Set TAIL',
      });
    }
    t.emit({
      type: 'return',
      codeRef: 'return-head',
      message: 'return — inserted at the head',
      explanation: 'insertAt() returns without walking the list: O(1) at position 0.',
      actionLabel: 'Return',
    });
  } else {
    let prev = t.snap.head!;
    t.update(setPointer(t.snap, 'prev', prev));
    t.emit({
      type: 'assign',
      codeRef: 'set-prev',
      variables: { prev: valueAt(t.snap, prev) },
      indices: positionsOf(t.snap, prev),
      message: `prev = head → ${describeNode(t.snap, prev)}`,
      explanation: `prev walks ${index - 1} step${index - 1 === 1 ? '' : 's'} to reach position ${index - 1}, the node before the new one.`,
      actionLabel: 'prev = head',
    });
    t.emit({
      type: 'assign',
      codeRef: 'set-i',
      variables: { i: 0 },
      message: 'i = 0',
      explanation: 'i counts how far prev has walked.',
      actionLabel: 'i = 0',
    });
    for (let i = 0; ; i++) {
      const go = i < index - 1;
      t.emit({
        type: 'loop-condition',
        codeRef: 'loop',
        variables: { i, 'index - 1': index - 1, prev: valueAt(t.snap, prev) },
        indices: positionsOf(t.snap, prev),
        result: go ? 'true' : 'false',
        message: `while (i < index - 1) → ${i} < ${index - 1} → ${go ? 'TRUE' : `FALSE — prev is at position ${index - 1}`}`,
        explanation: go ? 'prev has not reached the node before the position yet.' : `${describeNode(t.snap, prev)} is the node before position ${index}.`,
        actionLabel: go ? 'While TRUE' : 'While FALSE',
      });
      if (!go) break;
      prev = nodeById(t.snap, prev)!.next!;
      t.update(setPointer(t.snap, 'prev', prev));
      t.emit({
        type: 'assign',
        codeRef: 'advance-prev',
        variables: { prev: valueAt(t.snap, prev) },
        indices: positionsOf(t.snap, prev),
        message: `prev = prev.next → ${describeNode(t.snap, prev)}`,
        explanation: 'Follow the next pointer.',
        actionLabel: 'prev = next',
      });
      t.emit({
        type: 'increment',
        codeRef: 'inc-i',
        variables: { i: i + 1 },
        message: `i++ → i = ${i + 1}`,
        explanation: `prev is now at position ${i + 1}.`,
        actionLabel: 'i++',
      });
    }

    const after = nodeById(t.snap, prev)!.next;
    t.update(setNext(t.snap, node, after));
    t.emit({
      type: 'update',
      codeRef: 'link-node',
      variables: { 'node.next': valueAt(t.snap, after) },
      indices: positionsOf(t.snap, after),
      message: `node.next = prev.next → ${describeNode(t.snap, after)}`,
      explanation:
        after === null
          ? 'prev is the last node, so the new node’s next stays NULL: it will be the new last node.'
          : 'The new node points to the node that will follow it. The list itself has not changed yet.',
      actionLabel: 'Link node',
    });
    t.update(attach(setNext(t.snap, prev, node), node));
    t.emit({
      type: 'update',
      codeRef: 'link-prev',
      indices: positionsOf(t.snap, prev, node),
      message: `prev.next = node — ${describeNode(t.snap, prev)} now points to ${describeNode(t.snap, node)}`,
      explanation: `The new node is now part of the list at position ${index}.`,
      actionLabel: 'Link prev',
    });
    const wasTail = prev === t.snap.tail;
    t.emit({
      type: 'condition',
      codeRef: 'check-tail',
      variables: { prev: valueAt(t.snap, prev), tail: valueAt(t.snap, t.snap.tail) },
      indices: positionsOf(t.snap, prev),
      result: wasTail ? 'true' : 'false',
      message: `prev == tail → ${wasTail ? 'TRUE — the node was appended' : 'FALSE'}`,
      explanation: wasTail ? 'The new node is after the old last node, so TAIL must move to it.' : 'The new node is in the middle: TAIL is unchanged.',
      actionLabel: wasTail ? 'Condition TRUE' : 'Condition FALSE',
    });
    if (wasTail) {
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
  }

  t.update(dropPointer(dropPointer(t.snap, 'prev'), 'node'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { index, value, length: n + 1 },
    message: `Insert complete — ${value} is at position ${index} (${n + 1} node${n + 1 === 1 ? '' : 's'})`,
    explanation: 'insertAt() is O(index): it walks to the node before the position, then relinks two pointers.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llInsertAtDefinition: AlgorithmDefinition = {
  id: 'll-insert-at',
  name: 'Insert at Position',
  category: 'LINKED_LIST',
  subtitle: 'Walks to the node before the position and links a new node in O(n).',
  description:
    'Inserting at position i walks a prev pointer from HEAD to position i − 1. The new node points to prev’s next node, then prev points to the new node. Position 0 updates HEAD instead, and appending after the last node also moves TAIL.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Inserting at a known position without shifting elements' },
  defaultInput: [4, 7, 9],
  inputSpec: {
    addsNode: true,
    value: { label: 'New value', hint: 'Value of the new node', defaultValue: DEFAULT_VALUE },
    index: { label: 'Position', hint: 'Where the new node goes (0 = front, length = end)', defaultValue: DEFAULT_INDEX, bound: 'insert' },
  },
  visual: 'linked-list',

  code: {
    c: `void insertAt(List* list, int index, int value) {
    Node* node = malloc(sizeof(Node));
    node->data = value;
    node->next = NULL;
    if (index == 0) {
        node->next = list->head;
        list->head = node;
        if (list->tail == NULL) list->tail = node;
        return;
    }
    Node* prev = list->head;
    int i = 0;
    while (i < index - 1) {
        prev = prev->next;
        i++;
    }
    node->next = prev->next;
    prev->next = node;
    if (prev == list->tail) list->tail = node;
}`,
    cpp: `void insertAt(int index, int value) {
    Node* node = new Node(value);
    if (index == 0) {
        node->next = head;
        head = node;
        if (tail == nullptr) tail = node;
        return;
    }
    Node* prev = head;
    int i = 0;
    while (i < index - 1) {
        prev = prev->next;
        i++;
    }
    node->next = prev->next;
    prev->next = node;
    if (prev == tail) tail = node;
}`,
    java: `void insertAt(int index, int value) {
    Node node = new Node(value);
    if (index == 0) {
        node.next = head;
        head = node;
        if (tail == null) tail = node;
        return;
    }
    Node prev = head;
    int i = 0;
    while (i < index - 1) {
        prev = prev.next;
        i++;
    }
    node.next = prev.next;
    prev.next = node;
    if (prev == tail) tail = node;
}`,
    python: `def insert_at(self, index, value):
    node = Node(value)
    if index == 0:
        node.next = self.head
        self.head = node
        if self.tail is None:
            self.tail = node
        return
    prev = self.head
    i = 0
    while i < index - 1:
        prev = prev.next
        i += 1
    node.next = prev.next
    prev.next = node
    if prev is self.tail:
        self.tail = node`,
  },

  // C, C++ and Java test and set TAIL on one line; Python uses two.
  lineMap: {
    c: { 'fn-entry': 1, 'create-node': 2, 'check-zero': 5, 'link-head': 6, 'set-head': 7, 'check-tail-empty': 8, 'set-tail-empty': 8, 'return-head': 9, 'set-prev': 11, 'set-i': 12, loop: 13, 'advance-prev': 14, 'inc-i': 15, 'link-node': 17, 'link-prev': 18, 'check-tail': 19, 'set-tail': 19 },
    cpp: { 'fn-entry': 1, 'create-node': 2, 'check-zero': 3, 'link-head': 4, 'set-head': 5, 'check-tail-empty': 6, 'set-tail-empty': 6, 'return-head': 7, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'link-node': 15, 'link-prev': 16, 'check-tail': 17, 'set-tail': 17 },
    java: { 'fn-entry': 1, 'create-node': 2, 'check-zero': 3, 'link-head': 4, 'set-head': 5, 'check-tail-empty': 6, 'set-tail-empty': 6, 'return-head': 7, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'link-node': 15, 'link-prev': 16, 'check-tail': 17, 'set-tail': 17 },
    python: { 'fn-entry': 1, 'create-node': 2, 'check-zero': 3, 'link-head': 4, 'set-head': 5, 'check-tail-empty': 6, 'set-tail-empty': 7, 'return-head': 8, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'link-node': 14, 'link-prev': 15, 'check-tail': 16, 'set-tail': 17 },
  },

  // C allocates, sets the data and sets next = NULL (so next is never uninitialised); the others construct the node in one.
  lineSpans: { c: { 'create-node': 3 } },

  generateSteps: generateInsertAtSteps,
};
