import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { dropPointer, listFromValues, nodeById, setPointer } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, readValueParam, valueAt } from '../../linkedList/listTrace';

const DEFAULT_VALUE = 7;

/**
 * Search: walk from HEAD comparing each node with the value; return the FIRST matching position, or -1.
 * The step before `complete` is `found` or `not-found` (the outcome banner reads it).
 */
function generateSearchSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const value = readValueParam(params, 'value', DEFAULT_VALUE, 'Search Linked List');
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { value, length: n },
    message: `Call search(${value}) on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'Search walks the list from HEAD and returns the position of the first node holding the value, or -1.',
    actionLabel: 'Initialize',
  });

  t.update(setPointer(t.snap, 'curr', t.snap.head));
  t.emit({
    type: 'assign',
    codeRef: 'set-curr',
    variables: { value, curr: valueAt(t.snap, t.snap.head) },
    indices: positionsOf(t.snap, t.snap.head),
    message: `curr = head → ${describeNode(t.snap, t.snap.head)}`,
    explanation: n ? 'Start at the first node.' : 'The list is empty: curr starts as NULL.',
    actionLabel: 'curr = head',
  });

  let index = 0;
  t.emit({
    type: 'assign',
    codeRef: 'set-index',
    variables: { value, index },
    indices: positionsOf(t.snap, t.snap.pointers.curr),
    message: 'index = 0',
    explanation: 'index counts the position of curr from HEAD.',
    actionLabel: 'index = 0',
  });

  let found = -1;
  for (;;) {
    const curr = t.snap.pointers.curr;
    const go = curr !== null;
    t.emit({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { value, index, curr: valueAt(t.snap, curr) },
      indices: positionsOf(t.snap, curr),
      result: go ? 'true' : 'false',
      message: `while (curr != NULL) → ${go ? 'TRUE' : 'FALSE — reached the end'}`,
      explanation: go ? `curr points to ${describeNode(t.snap, curr)}.` : `No node holds ${value}.`,
      actionLabel: go ? 'While TRUE' : 'While FALSE',
    });
    if (!go) break;

    const node = nodeById(t.snap, curr)!;
    const match = node.value === value;
    t.emit({
      type: 'condition',
      codeRef: 'check-match',
      variables: { value, index, 'curr.data': node.value },
      indices: positionsOf(t.snap, curr),
      comparedValues: { val1: node.value, val2: value },
      result: match ? 'true' : 'false',
      message: `curr.data (${node.value}) == ${value} → ${match ? 'TRUE' : 'FALSE'}`,
      explanation: match ? `Found ${value} at position ${index}.` : `${node.value} is not ${value}; move on.`,
      actionLabel: match ? 'Condition TRUE' : 'Condition FALSE',
    });
    if (match) {
      found = index;
      t.emit({
        type: 'found',
        codeRef: 'return-index',
        variables: { value, index },
        indices: positionsOf(t.snap, curr),
        message: `return ${index} ← ${value} found at position ${index}`,
        explanation: 'The first node holding the value wins; later duplicates are not examined.',
        actionLabel: 'Found',
      });
      break;
    }

    t.update(setPointer(t.snap, 'curr', node.next));
    t.emit({
      type: 'assign',
      codeRef: 'advance',
      variables: { value, index, curr: valueAt(t.snap, node.next) },
      indices: positionsOf(t.snap, node.next),
      message: `curr = curr.next → ${describeNode(t.snap, node.next)}`,
      explanation: 'Follow the next pointer.',
      actionLabel: 'curr = next',
    });
    index++;
    t.emit({
      type: 'increment',
      codeRef: 'inc-index',
      variables: { value, index },
      indices: positionsOf(t.snap, t.snap.pointers.curr),
      message: `index++ → index = ${index}`,
      explanation: 'index follows curr.',
      actionLabel: 'index++',
    });
  }

  if (found < 0) {
    t.emit({
      type: 'not-found',
      codeRef: 'return-none',
      variables: { value },
      message: `return -1 ← ${value} is not in the list`,
      explanation: 'The walk reached NULL without a match.',
      actionLabel: 'Not Found',
    });
  }

  t.update(dropPointer(t.snap, 'curr'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { value, result: found },
    message: found >= 0 ? `Search complete — ${value} found at position ${found}` : `Search complete — ${value} not found`,
    explanation: 'search() returns; the list itself is unchanged.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llSearchDefinition: AlgorithmDefinition = {
  id: 'll-search',
  name: 'Search Linked List',
  category: 'LINKED_LIST',
  subtitle: 'Walks from HEAD and returns the position of the first matching node.',
  description:
    'Search compares each node with the value while following next pointers from HEAD. It returns the position of the first match, or -1 when it reaches NULL.',
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Finding a value in an unsorted list' },
  defaultInput: [4, 7, 1, 7, 9],
  inputSpec: { value: { label: 'Target value', hint: 'Value to search for (the first match is returned)', defaultValue: DEFAULT_VALUE } },
  visual: 'linked-list',

  code: {
    c: `int search(List* list, int value) {
    Node* curr = list->head;
    int index = 0;
    while (curr != NULL) {
        if (curr->data == value) return index;
        curr = curr->next;
        index++;
    }
    return -1;
}`,
    cpp: `int search(int value) {
    Node* curr = head;
    int index = 0;
    while (curr != nullptr) {
        if (curr->data == value) return index;
        curr = curr->next;
        index++;
    }
    return -1;
}`,
    java: `int search(int value) {
    Node curr = head;
    int index = 0;
    while (curr != null) {
        if (curr.data == value) return index;
        curr = curr.next;
        index++;
    }
    return -1;
}`,
    python: `def search(self, value):
    curr = self.head
    index = 0
    while curr is not None:
        if curr.data == value:
            return index
        curr = curr.next
        index += 1
    return -1`,
  },

  // C, C++ and Java return on the same line as the comparison; Python returns on its own line.
  lineMap: {
    c: { 'fn-entry': 1, 'set-curr': 2, 'set-index': 3, loop: 4, 'check-match': 5, 'return-index': 5, advance: 6, 'inc-index': 7, 'return-none': 9 },
    cpp: { 'fn-entry': 1, 'set-curr': 2, 'set-index': 3, loop: 4, 'check-match': 5, 'return-index': 5, advance: 6, 'inc-index': 7, 'return-none': 9 },
    java: { 'fn-entry': 1, 'set-curr': 2, 'set-index': 3, loop: 4, 'check-match': 5, 'return-index': 5, advance: 6, 'inc-index': 7, 'return-none': 9 },
    python: { 'fn-entry': 1, 'set-curr': 2, 'set-index': 3, loop: 4, 'check-match': 5, 'return-index': 6, advance: 7, 'inc-index': 8, 'return-none': 9 },
  },

  generateSteps: generateSearchSteps,
};
