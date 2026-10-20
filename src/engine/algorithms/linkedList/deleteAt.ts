import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { detach, dropPointer, listFromValues, nodeById, removeNode, setHead, setNext, setPointer, setTail } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, readIndexParam, valueAt } from '../../linkedList/listTrace';

const DEFAULT_INDEX = 2;
const RELEASE_EXPLANATION =
  'C frees the memory, C++ deletes the node, and in Java and Python dropping the last reference lets the garbage collector reclaim it.';

/**
 * Delete at a position (0..length−1; the list is non-empty, validated before the call). Index 0 moves HEAD forward
 * (and clears TAIL when the list empties). Otherwise prev walks to the node before the position, prev's next skips
 * the deleted node, and TAIL moves back when the last node was deleted. The node is released last in both cases.
 */
function generateDeleteAtSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const index = readIndexParam(params, llDeleteAtDefinition.inputSpec!.index!, input.length, 'Delete at Position');
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { index, length: n },
    message: `Call deleteAt(${index}) on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation:
      index === 0
        ? 'Position 0 is the first node: HEAD moves past it.'
        : `The node before position ${index} is found by walking from HEAD, then it skips over the deleted node.`,
    actionLabel: 'Initialize',
  });

  const atHead = index === 0;
  t.emit({
    type: 'condition',
    codeRef: 'check-zero',
    variables: { index },
    result: atHead ? 'true' : 'false',
    message: `index == 0 → ${atHead ? 'TRUE — delete the head' : 'FALSE'}`,
    explanation: atHead ? 'The first node is removed by moving HEAD.' : 'Find the node before the position first.',
    actionLabel: atHead ? 'Condition TRUE' : 'Condition FALSE',
  });

  let released: number;
  if (atHead) {
    const temp = t.snap.head!;
    released = nodeById(t.snap, temp)!.value;
    t.update(setPointer(t.snap, 'temp', temp));
    t.emit({
      type: 'assign',
      codeRef: 'head-temp',
      variables: { 'temp.data': released },
      indices: positionsOf(t.snap, temp),
      message: `temp = head → ${describeNode(t.snap, temp)}`,
      explanation: 'temp keeps the first node so it can be released after HEAD moves.',
      actionLabel: 'temp = head',
    });
    const second = nodeById(t.snap, temp)!.next;
    t.update(detach(setHead(t.snap, second), temp));
    const nowEmpty = second === null;
    t.emit({
      type: 'update',
      codeRef: 'advance-head',
      indices: positionsOf(t.snap, second),
      message: `head = temp.next → ${describeNode(t.snap, second)}`,
      explanation: nowEmpty
        ? `The list is now empty. TAIL still points to node ${released} until it is cleared below.`
        : `HEAD skips over node ${released}, which is no longer part of the list.`,
      actionLabel: 'Move HEAD',
    });
    t.emit({
      type: 'condition',
      codeRef: 'check-last',
      variables: { head: nowEmpty ? 'NULL' : 'set' },
      result: nowEmpty ? 'true' : 'false',
      message: `head == NULL → ${nowEmpty ? 'TRUE — the list is now empty' : 'FALSE'}`,
      explanation: nowEmpty ? 'The deleted node was also the last node, so TAIL must be cleared.' : 'TAIL is unchanged.',
      actionLabel: nowEmpty ? 'Condition TRUE' : 'Condition FALSE',
    });
    if (nowEmpty) {
      t.update(setTail(t.snap, null));
      t.emit({
        type: 'update',
        codeRef: 'clear-tail',
        message: 'tail = NULL',
        explanation: 'HEAD and TAIL are both NULL: the list is empty.',
        actionLabel: 'Clear TAIL',
      });
    }
    t.update(removeNode(t.snap, temp));
    t.emit({
      type: 'update',
      codeRef: 'head-release',
      variables: { released },
      message: `Release node ${released}`,
      explanation: RELEASE_EXPLANATION,
      actionLabel: 'Release',
    });
    t.emit({
      type: 'return',
      codeRef: 'head-return',
      message: 'return — deleted the head',
      explanation: 'deleteAt() returns without walking the list: O(1) at position 0.',
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
      explanation: `prev walks ${index - 1} step${index - 1 === 1 ? '' : 's'} to reach position ${index - 1}, the node before the one to delete.`,
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

    const temp = nodeById(t.snap, prev)!.next!;
    released = nodeById(t.snap, temp)!.value;
    t.update(setPointer(t.snap, 'temp', temp));
    t.emit({
      type: 'assign',
      codeRef: 'set-temp',
      variables: { 'temp.data': released },
      indices: positionsOf(t.snap, temp),
      message: `temp = prev.next → ${describeNode(t.snap, temp)}`,
      explanation: 'temp holds the node to delete so it can be released after it is unlinked.',
      actionLabel: 'temp = prev.next',
    });
    const after = nodeById(t.snap, temp)!.next;
    t.update(detach(setNext(t.snap, prev, after), temp));
    t.emit({
      type: 'update',
      codeRef: 'unlink',
      indices: positionsOf(t.snap, prev, after),
      message: `prev.next = temp.next → ${describeNode(t.snap, after)}`,
      explanation:
        after === null
          ? `${describeNode(t.snap, prev)} is now the last node. TAIL still points to node ${released} until it moves below.`
          : `${describeNode(t.snap, prev)} skips over node ${released}, which is no longer part of the list.`,
      actionLabel: 'Unlink',
    });
    const wasTail = temp === t.snap.tail;
    t.emit({
      type: 'condition',
      codeRef: 'check-tail',
      variables: { 'temp.data': released, tail: valueAt(t.snap, t.snap.tail) },
      result: wasTail ? 'true' : 'false',
      message: `temp == tail → ${wasTail ? 'TRUE — the last node was deleted' : 'FALSE'}`,
      explanation: wasTail ? 'TAIL must move back to prev.' : 'TAIL is unchanged.',
      actionLabel: wasTail ? 'Condition TRUE' : 'Condition FALSE',
    });
    if (wasTail) {
      t.update(setTail(t.snap, prev));
      t.emit({
        type: 'update',
        codeRef: 'set-tail',
        indices: positionsOf(t.snap, prev),
        message: `tail = prev → ${describeNode(t.snap, prev)}`,
        explanation: 'TAIL moves back to the new last node.',
        actionLabel: 'Move TAIL',
      });
    }
    t.update(removeNode(t.snap, temp));
    t.emit({
      type: 'update',
      codeRef: 'release',
      variables: { released },
      message: `Release node ${released}`,
      explanation: RELEASE_EXPLANATION,
      actionLabel: 'Release',
    });
  }

  t.update(dropPointer(dropPointer(t.snap, 'prev'), 'temp'));
  const left = t.snap.nodes.length;
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { index, length: left },
    message: `Delete complete — removed ${released} from position ${index} (${left} node${left === 1 ? '' : 's'} left)`,
    explanation: 'deleteAt() is O(index): it walks to the node before the position, then relinks one pointer.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llDeleteAtDefinition: AlgorithmDefinition = {
  id: 'll-delete-at',
  name: 'Delete at Position',
  category: 'LINKED_LIST',
  subtitle: 'Walks to the node before the position, unlinks the node and releases it in O(n).',
  description:
    'Deleting at position i walks a prev pointer from HEAD to position i − 1. prev’s next then skips over the deleted node, which is released. Position 0 moves HEAD instead (clearing TAIL if the list empties), and deleting the last node moves TAIL back to prev.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Removing an element at a known position without shifting' },
  defaultInput: [4, 7, 1, 9],
  inputSpec: {
    index: { label: 'Position', hint: 'Which node to delete (0 = first)', defaultValue: DEFAULT_INDEX, bound: 'delete' },
  },
  visual: 'linked-list',

  code: {
    c: `void deleteAt(List* list, int index) {
    if (index == 0) {
        Node* temp = list->head;
        list->head = temp->next;
        if (list->head == NULL) list->tail = NULL;
        free(temp);
        return;
    }
    Node* prev = list->head;
    int i = 0;
    while (i < index - 1) {
        prev = prev->next;
        i++;
    }
    Node* temp = prev->next;
    prev->next = temp->next;
    if (temp == list->tail) list->tail = prev;
    free(temp);
}`,
    cpp: `void deleteAt(int index) {
    if (index == 0) {
        Node* temp = head;
        head = temp->next;
        if (head == nullptr) tail = nullptr;
        delete temp;
        return;
    }
    Node* prev = head;
    int i = 0;
    while (i < index - 1) {
        prev = prev->next;
        i++;
    }
    Node* temp = prev->next;
    prev->next = temp->next;
    if (temp == tail) tail = prev;
    delete temp;
}`,
    java: `void deleteAt(int index) {
    if (index == 0) {
        Node temp = head;
        head = temp.next;
        if (head == null) tail = null;
        temp = null; // last reference dropped: the GC reclaims the node
        return;
    }
    Node prev = head;
    int i = 0;
    while (i < index - 1) {
        prev = prev.next;
        i++;
    }
    Node temp = prev.next;
    prev.next = temp.next;
    if (temp == tail) tail = prev;
    temp = null; // last reference dropped: the GC reclaims the node
}`,
    python: `def delete_at(self, index):
    if index == 0:
        temp = self.head
        self.head = temp.next
        if self.head is None:
            self.tail = None
        del temp  # last reference dropped: the node is garbage
        return
    prev = self.head
    i = 0
    while i < index - 1:
        prev = prev.next
        i += 1
    temp = prev.next
    prev.next = temp.next
    if temp is self.tail:
        self.tail = prev
    del temp  # last reference dropped: the node is garbage`,
  },

  // C, C++ and Java test and set TAIL on one line; Python uses two.
  lineMap: {
    c: { 'fn-entry': 1, 'check-zero': 2, 'head-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 5, 'head-release': 6, 'head-return': 7, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'set-temp': 15, unlink: 16, 'check-tail': 17, 'set-tail': 17, release: 18 },
    cpp: { 'fn-entry': 1, 'check-zero': 2, 'head-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 5, 'head-release': 6, 'head-return': 7, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'set-temp': 15, unlink: 16, 'check-tail': 17, 'set-tail': 17, release: 18 },
    java: { 'fn-entry': 1, 'check-zero': 2, 'head-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 5, 'head-release': 6, 'head-return': 7, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'set-temp': 15, unlink: 16, 'check-tail': 17, 'set-tail': 17, release: 18 },
    python: { 'fn-entry': 1, 'check-zero': 2, 'head-temp': 3, 'advance-head': 4, 'check-last': 5, 'clear-tail': 6, 'head-release': 7, 'head-return': 8, 'set-prev': 9, 'set-i': 10, loop: 11, 'advance-prev': 12, 'inc-i': 13, 'set-temp': 14, unlink: 15, 'check-tail': 16, 'set-tail': 17, release: 18 },
  },

  generateSteps: generateDeleteAtSteps,
};
