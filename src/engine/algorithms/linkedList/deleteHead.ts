import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { detach, dropPointer, listFromValues, nodeById, removeNode, setHead, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf } from '../../linkedList/listTrace';

/**
 * Delete at head: an empty list returns at once. Otherwise temp holds the first node, HEAD moves to the second, an
 * emptied list also clears TAIL, and only then is the node released (free / delete / last reference dropped), so no
 * step ever shows a dangling pointer.
 */
function generateDeleteHeadSteps(input: number[]): ExecutionStep[] {
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { length: n },
    message: `Call deleteHead() on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'The first node is unlinked by moving HEAD to the second node; then its memory is released.',
    actionLabel: 'Initialize',
  });

  const empty = t.snap.head === null;
  t.emit({
    type: 'condition',
    codeRef: 'check-empty',
    variables: { head: empty ? 'NULL' : 'set' },
    result: empty ? 'true' : 'false',
    message: `head == NULL → ${empty ? 'TRUE — nothing to delete' : 'FALSE'}`,
    explanation: empty ? 'The list is empty, so there is no first node to delete.' : `The first node is ${describeNode(t.snap, t.snap.head)}.`,
    actionLabel: empty ? 'Condition TRUE' : 'Condition FALSE',
  });

  if (empty) {
    t.emit({
      type: 'return',
      codeRef: 'return-empty',
      message: 'return — the empty list is unchanged',
      explanation: 'deleteHead() returns early.',
      actionLabel: 'Return',
    });
  } else {
    const temp = t.snap.head!;
    const value = nodeById(t.snap, temp)!.value;
    t.update(setPointer(t.snap, 'temp', temp));
    t.emit({
      type: 'assign',
      codeRef: 'set-temp',
      variables: { 'temp.data': value },
      indices: positionsOf(t.snap, temp),
      message: `temp = head → ${describeNode(t.snap, temp)}`,
      explanation: 'temp keeps the first node so it can be released after it is unlinked.',
      actionLabel: 'temp = head',
    });

    const second = nodeById(t.snap, temp)!.next;
    t.update(detach(setHead(t.snap, second), temp));
    t.emit({
      type: 'update',
      codeRef: 'advance-head',
      indices: positionsOf(t.snap, second),
      message: `head = head.next → ${describeNode(t.snap, second)}`,
      explanation:
        second === null
          ? `HEAD becomes NULL: ${value} was the only node. TAIL still points to it until the next statement.`
          : `HEAD skips the old first node ${value}, which is no longer part of the list.`,
      actionLabel: 'Move HEAD',
    });

    const nowEmpty = t.snap.head === null;
    t.emit({
      type: 'condition',
      codeRef: 'check-last',
      variables: { head: nowEmpty ? 'NULL' : 'set' },
      result: nowEmpty ? 'true' : 'false',
      message: `head == NULL → ${nowEmpty ? 'TRUE — the list is now empty' : 'FALSE'}`,
      explanation: nowEmpty ? 'The deleted node was also the last node, so TAIL must be cleared.' : 'TAIL still points to the last node, which did not change.',
      actionLabel: nowEmpty ? 'Condition TRUE' : 'Condition FALSE',
    });
    if (nowEmpty) {
      t.update(setTail(t.snap, null));
      t.emit({
        type: 'update',
        codeRef: 'clear-tail',
        message: 'tail = NULL',
        explanation: 'HEAD and TAIL are both NULL again: the list is empty.',
        actionLabel: 'Clear TAIL',
      });
    }

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

  t.update(dropPointer(t.snap, 'temp'));
  const left = t.snap.nodes.length;
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { length: left },
    message: empty ? 'Delete complete — the list was already empty' : `Delete complete — ${left} node${left === 1 ? '' : 's'} left`,
    explanation: 'deleteHead() returns in O(1).',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llDeleteHeadDefinition: AlgorithmDefinition = {
  id: 'll-delete-head',
  name: 'Delete at Head',
  category: 'LINKED_LIST',
  subtitle: 'Moves HEAD to the second node and releases the first in O(1).',
  description:
    'Deleting the head keeps the first node in a temporary pointer, moves HEAD to the second node, clears TAIL when the list becomes empty, and then releases the node.',
  complexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)', space: 'O(1)', bestFor: 'Stacks and queues: removing the first element' },
  defaultInput: [4, 7, 9],
  visual: 'linked-list',

  code: {
    c: `void deleteHead(List* list) {
    if (list->head == NULL) return;
    Node* temp = list->head;
    list->head = list->head->next;
    if (list->head == NULL) list->tail = NULL;
    free(temp);
}`,
    cpp: `void deleteHead() {
    if (head == nullptr) return;
    Node* temp = head;
    head = head->next;
    if (head == nullptr) tail = nullptr;
    delete temp;
}`,
    java: `void deleteHead() {
    if (head == null) return;
    Node temp = head;
    head = head.next;
    if (head == null) tail = null;
    temp = null; // last reference dropped: the GC reclaims the node
}`,
    python: `def delete_head(self):
    if self.head is None:
        return
    temp = self.head
    self.head = self.head.next
    if self.head is None:
        self.tail = None
    del temp  # last reference dropped: the node is garbage`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 2, 'set-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 5, release: 6 },
    cpp: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 2, 'set-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 5, release: 6 },
    java: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 2, 'set-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 5, release: 6 },
    python: { 'fn-entry': 1, 'check-empty': 2, 'return-empty': 3, 'set-temp': 4, 'advance-head': 5, 'check-last': 6, 'clear-tail': 7, release: 8 },
  },

  generateSteps: generateDeleteHeadSteps,
};
