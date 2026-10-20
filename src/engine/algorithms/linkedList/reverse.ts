import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { dropPointer, listFromValues, nodeById, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, valueAt } from '../../linkedList/listTrace';

/**
 * Iterative reversal: prev starts at NULL and curr at HEAD; each iteration saves curr.next, points curr back at prev,
 * then moves prev and curr one node forward. The old head becomes TAIL (set before the loop, while HEAD still names
 * it) and HEAD moves to prev after the loop. Mid-loop the nodes form two chains — the reversed part from HEAD and
 * the rest held by `next`/`curr` — so every node stays reachable and no step is cyclic.
 */
function generateReverseSteps(input: number[]): ExecutionStep[] {
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { length: n },
    message: `Call reverse() on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'Each node’s next pointer is turned around to point at the node before it. No node is created or moved.',
    actionLabel: 'Initialize',
  });

  let prev: string | null = null;
  t.update(setPointer(t.snap, 'prev', prev));
  t.emit({
    type: 'assign',
    codeRef: 'set-prev',
    variables: { prev: 'NULL' },
    message: 'prev = NULL',
    explanation: 'prev is the start of the reversed part, which is empty so far. The first node will point to NULL.',
    actionLabel: 'prev = NULL',
  });

  let curr = t.snap.head;
  t.update(setPointer(t.snap, 'curr', curr));
  t.emit({
    type: 'assign',
    codeRef: 'set-curr',
    variables: { curr: valueAt(t.snap, curr) },
    indices: positionsOf(t.snap, curr),
    message: `curr = head → ${describeNode(t.snap, curr)}`,
    explanation: 'curr is the next node to turn around.',
    actionLabel: 'curr = head',
  });

  const oldHead = t.snap.head;
  t.update(setTail(t.snap, oldHead));
  t.emit({
    type: 'update',
    codeRef: 'set-tail',
    indices: positionsOf(t.snap, oldHead),
    message: `tail = head → ${describeNode(t.snap, oldHead)}`,
    explanation:
      n <= 1
        ? 'With at most one node, the first node is already the last node: TAIL does not change.'
        : 'The current first node will be the last node after reversing. HEAD still points to it until the loop ends.',
    actionLabel: 'tail = head',
  });

  for (;;) {
    const go = curr !== null;
    t.emit({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { curr: valueAt(t.snap, curr), prev: valueAt(t.snap, prev) },
      indices: positionsOf(t.snap, curr),
      result: go ? 'true' : 'false',
      message: `while (curr != NULL) → ${go ? 'TRUE' : 'FALSE — every node has been turned around'}`,
      explanation: go
        ? `${describeNode(t.snap, curr)} still points forward.`
        : prev === null
          ? 'The list is empty: there is nothing to turn around.'
          : `prev is the old last node, node ${valueAt(t.snap, prev)}, which becomes the new head.`,
      actionLabel: go ? 'While TRUE' : 'While FALSE',
    });
    if (!go) break;

    const c: string = curr!;
    const next = nodeById(t.snap, c)!.next;
    t.update(setPointer(t.snap, 'next', next));
    t.emit({
      type: 'assign',
      codeRef: 'save-next',
      variables: { next: valueAt(t.snap, next) },
      indices: positionsOf(t.snap, next),
      message: `next = curr.next → ${describeNode(t.snap, next)}`,
      explanation: 'Save the rest of the list before curr’s pointer is turned around, or it would be lost.',
      actionLabel: 'Save next',
    });

    t.update(setNext(t.snap, c, prev));
    t.emit({
      type: 'update',
      codeRef: 'reverse-link',
      variables: { 'curr.next': valueAt(t.snap, prev) },
      indices: positionsOf(t.snap, c, prev),
      message: `curr.next = prev — node ${valueAt(t.snap, c)} now points to ${prev === null ? 'NULL' : `node ${valueAt(t.snap, prev)}`}`,
      explanation:
        prev === null
          ? `The first node becomes the last: its next is NULL. The rest of the list is still reachable through next.`
          : `node ${valueAt(t.snap, c)} now points backwards, joining the reversed part.`,
      actionLabel: 'Reverse link',
    });

    prev = c;
    t.update(setPointer(t.snap, 'prev', prev));
    t.emit({
      type: 'assign',
      codeRef: 'advance-prev',
      variables: { prev: valueAt(t.snap, prev) },
      message: `prev = curr → node ${valueAt(t.snap, prev)}`,
      explanation: 'The reversed part now starts at this node.',
      actionLabel: 'prev = curr',
    });

    curr = next;
    t.update(setPointer(t.snap, 'curr', curr));
    t.emit({
      type: 'assign',
      codeRef: 'advance-curr',
      variables: { curr: valueAt(t.snap, curr) },
      message: `curr = next → ${curr === null ? 'NULL' : `node ${valueAt(t.snap, curr)}`}`,
      explanation: curr === null ? 'There are no nodes left to turn around.' : 'Move on to the next node to turn around.',
      actionLabel: 'curr = next',
    });
  }

  t.update(setHead(t.snap, prev));
  t.emit({
    type: 'update',
    codeRef: 'set-head',
    indices: positionsOf(t.snap, prev),
    message: `head = prev → ${describeNode(t.snap, prev)}`,
    explanation: n <= 1 ? 'HEAD does not change: a list of at most one node is its own reverse.' : 'HEAD moves to the old last node: the list now reads in reverse order.',
    actionLabel: 'Move HEAD',
  });

  t.update(dropPointer(dropPointer(dropPointer(t.snap, 'prev'), 'curr'), 'next'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { length: n },
    message: `Reverse complete — ${n === 0 ? 'the list is empty' : `[${[...input].reverse().join(' → ')}]`}`,
    explanation: 'reverse() visits each node once: O(n) time and O(1) extra space.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const reverseLinkedListDefinition: AlgorithmDefinition = {
  id: 'reverse-linked-list',
  name: 'Reverse Linked List',
  category: 'LINKED_LIST',
  subtitle: 'Turns every next pointer around iteratively in O(n).',
  description:
    'Iterative reversal walks the list once with three pointers. For each node, next saves the rest of the list, the node’s next is turned to point at prev, and prev and curr move forward. The old head becomes TAIL and, after the loop, HEAD moves to the old last node.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Reversing a list in place without extra memory' },
  defaultInput: [4, 7, 1, 9],
  visual: 'linked-list',

  code: {
    c: `void reverse(List* list) {
    Node* prev = NULL;
    Node* curr = list->head;
    list->tail = list->head;
    while (curr != NULL) {
        Node* next = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next;
    }
    list->head = prev;
}`,
    cpp: `void reverse() {
    Node* prev = nullptr;
    Node* curr = head;
    tail = head;
    while (curr != nullptr) {
        Node* next = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next;
    }
    head = prev;
}`,
    java: `void reverse() {
    Node prev = null;
    Node curr = head;
    tail = head;
    while (curr != null) {
        Node next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    head = prev;
}`,
    python: `def reverse(self):
    prev = None
    curr = self.head
    self.tail = self.head
    while curr is not None:
        next_node = curr.next
        curr.next = prev
        prev = curr
        curr = next_node
    self.head = prev`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'set-prev': 2, 'set-curr': 3, 'set-tail': 4, loop: 5, 'save-next': 6, 'reverse-link': 7, 'advance-prev': 8, 'advance-curr': 9, 'set-head': 11 },
    cpp: { 'fn-entry': 1, 'set-prev': 2, 'set-curr': 3, 'set-tail': 4, loop: 5, 'save-next': 6, 'reverse-link': 7, 'advance-prev': 8, 'advance-curr': 9, 'set-head': 11 },
    java: { 'fn-entry': 1, 'set-prev': 2, 'set-curr': 3, 'set-tail': 4, loop: 5, 'save-next': 6, 'reverse-link': 7, 'advance-prev': 8, 'advance-curr': 9, 'set-head': 11 },
    python: { 'fn-entry': 1, 'set-prev': 2, 'set-curr': 3, 'set-tail': 4, loop: 5, 'save-next': 6, 'reverse-link': 7, 'advance-prev': 8, 'advance-curr': 9, 'set-head': 10 },
  },

  generateSteps: generateReverseSteps,
};
