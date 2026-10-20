import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { dropPointer, listFromValues, nodeById, setPointer } from '../../linkedList/listSnapshot';
import { createListTrace, describeNode, positionsOf, valueAt } from '../../linkedList/listTrace';

/**
 * Traverse: curr = head; while (curr != NULL) { visit curr; curr = curr->next; } — including the final FALSE check.
 * Nothing is linked or unlinked, so no step has `changed`.
 */
function generateTraverseSteps(input: number[]): ExecutionStep[] {
  const t = createListTrace(listFromValues(input));
  const n = input.length;

  t.emit({
    type: 'init',
    codeRef: 'fn-entry',
    variables: { length: n },
    message: `Call traverse() on a list of ${n} node${n === 1 ? '' : 's'}`,
    explanation: 'A singly linked list can only be walked forward: start at HEAD and follow each next pointer until NULL.',
    actionLabel: 'Initialize',
  });

  t.update(setPointer(t.snap, 'curr', t.snap.head));
  t.emit({
    type: 'assign',
    codeRef: 'set-curr',
    variables: { curr: valueAt(t.snap, t.snap.head) },
    indices: positionsOf(t.snap, t.snap.head),
    message: `curr = head → ${describeNode(t.snap, t.snap.head)}`,
    explanation: n ? 'curr starts at the first node.' : 'The list is empty, so HEAD is NULL and curr starts as NULL.',
    actionLabel: 'curr = head',
  });

  const output: number[] = [];
  for (;;) {
    const curr = t.snap.pointers.curr;
    const go = curr !== null;
    t.emit({
      type: 'loop-condition',
      codeRef: 'loop',
      variables: { curr: valueAt(t.snap, curr) },
      indices: positionsOf(t.snap, curr),
      result: go ? 'true' : 'false',
      message: `while (curr != NULL) → ${go ? 'TRUE' : 'FALSE — reached the end'}`,
      explanation: go ? `curr points to ${describeNode(t.snap, curr)}.` : 'curr is NULL: every node has been visited.',
      actionLabel: go ? 'While TRUE' : 'While FALSE',
    });
    if (!go) break;

    const node = nodeById(t.snap, curr)!;
    output.push(node.value);
    t.emit({
      type: 'update',
      codeRef: 'visit',
      variables: { 'curr.data': node.value, output: output.join(' ') },
      indices: positionsOf(t.snap, curr),
      message: `Visit ${node.value} — output so far: ${output.join(' ')}`,
      explanation: `The value of the current node is printed.`,
      actionLabel: 'Visit',
    });

    t.update(setPointer(t.snap, 'curr', node.next));
    t.emit({
      type: 'assign',
      codeRef: 'advance',
      variables: { curr: valueAt(t.snap, node.next) },
      indices: positionsOf(t.snap, node.next),
      message: `curr = curr.next → ${describeNode(t.snap, node.next)}`,
      explanation: node.next === null ? 'The last node points to NULL.' : 'Follow the next pointer to the following node.',
      actionLabel: 'curr = next',
    });
  }

  t.update(dropPointer(t.snap, 'curr'));
  t.emit({
    type: 'complete',
    codeRef: 'fn-entry',
    variables: { output: output.join(' ') || '(nothing)' },
    message: `Traversal complete — visited ${output.length} node${output.length === 1 ? '' : 's'}`,
    explanation: 'traverse() returns; the list itself is unchanged.',
    actionLabel: 'Complete',
  });
  return t.steps;
}

export const llTraverseDefinition: AlgorithmDefinition = {
  id: 'll-traverse',
  name: 'Traverse Linked List',
  category: 'LINKED_LIST',
  subtitle: 'Follows next pointers from HEAD to NULL, visiting every node.',
  description:
    'Traversal visits every node of a singly linked list in order: a pointer starts at HEAD and follows each node’s next link until it reaches NULL.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', bestFor: 'Printing, summing or inspecting every node in order' },
  defaultInput: [4, 7, 1, 9],
  visual: 'linked-list',

  code: {
    c: `void traverse(List* list) {
    Node* curr = list->head;
    while (curr != NULL) {
        printf("%d ", curr->data);
        curr = curr->next;
    }
}`,
    cpp: `void traverse() {
    Node* curr = head;
    while (curr != nullptr) {
        cout << curr->data << " ";
        curr = curr->next;
    }
}`,
    java: `void traverse() {
    Node curr = head;
    while (curr != null) {
        System.out.print(curr.data + " ");
        curr = curr.next;
    }
}`,
    python: `def traverse(self):
    curr = self.head
    while curr is not None:
        print(curr.data, end=" ")
        curr = curr.next`,
  },

  lineMap: {
    c: { 'fn-entry': 1, 'set-curr': 2, loop: 3, visit: 4, advance: 5 },
    cpp: { 'fn-entry': 1, 'set-curr': 2, loop: 3, visit: 4, advance: 5 },
    java: { 'fn-entry': 1, 'set-curr': 2, loop: 3, visit: 4, advance: 5 },
    python: { 'fn-entry': 1, 'set-curr': 2, loop: 3, visit: 4, advance: 5 },
  },

  generateSteps: generateTraverseSteps,
};
