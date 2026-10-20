import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { detach, dropPointer, listFromValues, nodeById, removeNode, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, valueAt } from '../../linkedList/listTrace';

/**
 * Delete at tail. A singly linked list cannot step backwards, so finding the node before TAIL needs a walk from HEAD
 * (O(n)) even with a TAIL pointer. Empty list: return. One node: HEAD and TAIL are cleared, then the node is released.
 * Otherwise: prev walks to the node before TAIL, unlinks the tail, TAIL moves back, and the old tail is released.
 */
function generateDeleteTailSteps(input: number[]): ExecutionStep[] {
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { length: n },
    message: `Call deleteTail() on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'To remove the last node, the node before it must point to NULL. A singly linked list finds that node by walking from HEAD.',
    actionLabel: 'Initialize',
  });

  const empty = t.snap.head === null;
  t.emit({
    type: 'condition',
    codeRef: 'check-empty',
    variables: { head: empty ? 'NULL' : 'set' },
    result: empty ? 'true' : 'false',
    message: `head == NULL → ${empty ? 'TRUE — nothing to delete' : 'FALSE'}`,
    explanation: empty ? 'The list is empty, so there is no last node to delete.' : `The last node is ${describeNode(t.snap, t.snap.tail)}.`,
    actionLabel: empty ? 'Condition TRUE' : 'Condition FALSE',
  });

  if (empty) {
    t.emit({
      type: 'return',
      codeRef: 'return-empty',
      message: 'return — the empty list is unchanged',
      explanation: 'deleteTail() returns early.',
      actionLabel: 'Return',
    });
  } else {
    const single = t.snap.head === t.snap.tail;
    t.emit({
      type: 'condition',
      codeRef: 'check-single',
      result: single ? 'true' : 'false',
      indices: positionsOf(t.snap, t.snap.head, t.snap.tail),
      message: `head == tail → ${single ? 'TRUE — only one node' : 'FALSE'}`,
      explanation: single ? 'HEAD and TAIL point to the same node: deleting it empties the list.' : 'There are at least two nodes: find the node before TAIL.',
      actionLabel: single ? 'Condition TRUE' : 'Condition FALSE',
    });

    if (single) {
      const temp = t.snap.head!;
      const value = nodeById(t.snap, temp)!.value;
      t.update(setPointer(t.snap, 'temp', temp));
      t.emit({
        type: 'assign',
        codeRef: 'single-temp',
        variables: { 'temp.data': value },
        indices: positionsOf(t.snap, temp),
        message: `temp = head → ${describeNode(t.snap, temp)}`,
        explanation: 'temp keeps the node so it can be released after HEAD and TAIL are cleared.',
        actionLabel: 'temp = head',
      });
      t.update(detach(setHead(t.snap, null), temp));
      t.emit({
        type: 'update',
        codeRef: 'single-clear-head',
        message: 'head = NULL',
        explanation: 'HEAD is cleared. TAIL still points to the node until the next statement.',
        actionLabel: 'Clear HEAD',
      });
      t.update(setTail(t.snap, null));
      t.emit({
        type: 'update',
        codeRef: 'single-clear-tail',
        message: 'tail = NULL',
        explanation: 'HEAD and TAIL are both NULL: the list is empty.',
        actionLabel: 'Clear TAIL',
      });
      t.update(removeNode(t.snap, temp));
      t.emit({
        type: 'update',
        codeRef: 'single-release',
        variables: { released: value },
        message: `Release node ${value}`,
        explanation: 'C frees the memory, C++ deletes the node, and in Java and Python dropping the last reference lets the garbage collector reclaim it.',
        actionLabel: 'Release',
      });
      t.emit({
        type: 'return',
        codeRef: 'single-return',
        message: 'return — the list is now empty',
        explanation: 'deleteTail() returns.',
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
        explanation: 'prev walks forward until the node after it is TAIL.',
        actionLabel: 'prev = head',
      });
      for (;;) {
        const nextOfPrev = nodeById(t.snap, prev)!.next;
        const go = nextOfPrev !== t.snap.tail;
        t.emit({
          type: 'loop-condition',
          codeRef: 'loop',
          variables: { prev: valueAt(t.snap, prev), 'prev.next': valueAt(t.snap, nextOfPrev) },
          indices: positionsOf(t.snap, prev, nextOfPrev),
          result: go ? 'true' : 'false',
          message: `while (prev.next != tail) → ${go ? 'TRUE' : 'FALSE — prev is just before TAIL'}`,
          explanation: go ? `${describeNode(t.snap, nextOfPrev)} is not the last node; keep walking.` : `${describeNode(t.snap, prev)} is the node before TAIL.`,
          actionLabel: go ? 'While TRUE' : 'While FALSE',
        });
        if (!go) break;
        prev = nextOfPrev!;
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
      }

      const temp = t.snap.tail!;
      const value = nodeById(t.snap, temp)!.value;
      t.update(setPointer(t.snap, 'temp', temp));
      t.emit({
        type: 'assign',
        codeRef: 'set-temp',
        variables: { 'temp.data': value },
        indices: positionsOf(t.snap, temp),
        message: `temp = tail → ${describeNode(t.snap, temp)}`,
        explanation: 'temp keeps the last node so it can be released after it is unlinked.',
        actionLabel: 'temp = tail',
      });
      t.update(detach(setNext(t.snap, prev, null), temp));
      t.emit({
        type: 'update',
        codeRef: 'unlink',
        indices: positionsOf(t.snap, prev),
        message: `prev.next = NULL — ${describeNode(t.snap, prev)} is now the last node`,
        explanation: `The old last node ${value} is no longer part of the list. TAIL still points to it until the next statement.`,
        actionLabel: 'Unlink',
      });
      t.update(setTail(t.snap, prev));
      t.emit({
        type: 'update',
        codeRef: 'set-tail',
        indices: positionsOf(t.snap, prev),
        message: `tail = prev → ${describeNode(t.snap, prev)}`,
        explanation: 'TAIL moves back to the new last node.',
        actionLabel: 'Move TAIL',
      });
      t.update(removeNode(t.snap, temp));
      t.emit({
        type: 'update',
        codeRef: 'release',
        variables: { released: value },
        message: `Release node ${value}`,
        explanation: 'C frees the memory, C++ deletes the node, and in Java and Python dropping the last reference lets the garbage collector reclaim it.',
        actionLabel: 'Release',
      });
    }
  }

  t.update(dropPointer(dropPointer(t.snap, 'prev'), 'temp'));
  const left = t.snap.nodes.length;
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { length: left },
    message: empty ? 'Delete complete — the list was already empty' : `Delete complete — ${left} node${left === 1 ? '' : 's'} left`,
    explanation: 'deleteTail() returns: O(n) because of the walk to the node before TAIL.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llDeleteTailDefinition: AlgorithmDefinition = {
  id: 'll-delete-tail',
  name: 'Delete at Tail',
  category: 'LINKED_LIST',
  subtitle: 'Walks to the node before TAIL, unlinks the last node and releases it in O(n).',
  description:
    'Deleting the tail of a singly linked list needs the node before it, which is found by walking from HEAD. That node’s next becomes NULL, TAIL moves back to it, and the old tail is released. A one-node list becomes empty.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Removing the last element when no back pointer exists' },
  defaultInput: [4, 7, 9, 3],
  visual: 'linked-list',

  code: {
    c: `void deleteTail(List* list) {
    if (list->head == NULL) return;
    if (list->head == list->tail) {
        Node* temp = list->head;
        list->head = NULL;
        list->tail = NULL;
        free(temp);
        return;
    }
    Node* prev = list->head;
    while (prev->next != list->tail) prev = prev->next;
    Node* temp = list->tail;
    prev->next = NULL;
    list->tail = prev;
    free(temp);
}`,
    cpp: `void deleteTail() {
    if (head == nullptr) return;
    if (head == tail) {
        Node* temp = head;
        head = nullptr;
        tail = nullptr;
        delete temp;
        return;
    }
    Node* prev = head;
    while (prev->next != tail) prev = prev->next;
    Node* temp = tail;
    prev->next = nullptr;
    tail = prev;
    delete temp;
}`,
    java: `void deleteTail() {
    if (head == null) return;
    if (head == tail) {
        Node temp = head;
        head = null;
        tail = null;
        temp = null; // last reference dropped: the GC reclaims the node
        return;
    }
    Node prev = head;
    while (prev.next != tail) prev = prev.next;
    Node temp = tail;
    prev.next = null;
    tail = prev;
    temp = null; // last reference dropped: the GC reclaims the node
}`,
    python: `def delete_tail(self):
    if self.head is None:
        return
    if self.head is self.tail:
        temp = self.head
        self.head = None
        self.tail = None
        del temp  # last reference dropped: the node is garbage
        return
    prev = self.head
    while prev.next is not self.tail:
        prev = prev.next
    temp = self.tail
    prev.next = None
    self.tail = prev
    del temp  # last reference dropped: the node is garbage`,
  },

  // C, C++ and Java return on the empty check's line and advance prev on the loop's line; Python uses separate lines.
  lineMap: {
    c: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 2, 'check-single': 3, 'single-temp': 4, 'single-clear-head': 5, 'single-clear-tail': 6, 'single-release': 7, 'single-return': 8, 'set-prev': 10, loop: 11, 'advance-prev': 11, 'set-temp': 12, unlink: 13, 'set-tail': 14, release: 15 },
    cpp: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 2, 'check-single': 3, 'single-temp': 4, 'single-clear-head': 5, 'single-clear-tail': 6, 'single-release': 7, 'single-return': 8, 'set-prev': 10, loop: 11, 'advance-prev': 11, 'set-temp': 12, unlink: 13, 'set-tail': 14, release: 15 },
    java: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 2, 'check-single': 3, 'single-temp': 4, 'single-clear-head': 5, 'single-clear-tail': 6, 'single-release': 7, 'single-return': 8, 'set-prev': 10, loop: 11, 'advance-prev': 11, 'set-temp': 12, unlink: 13, 'set-tail': 14, release: 15 },
    python: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 3, 'check-single': 4, 'single-temp': 5, 'single-clear-head': 6, 'single-clear-tail': 7, 'single-release': 8, 'single-return': 9, 'set-prev': 10, loop: 11, 'advance-prev': 12, 'set-temp': 13, unlink: 14, 'set-tail': 15, release: 16 },
  },

  generateSteps: generateDeleteTailSteps,
};
