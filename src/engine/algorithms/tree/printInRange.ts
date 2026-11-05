import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, TextField, TreeRangeCall } from '../../../types/algorithm';
import { MAX_TREE_LEVELS, MAX_TREE_NODES, levelOrderText, subtreeIds, treeFromLevelOrder } from '../../tree/binaryTree';
import { textInputs } from '../strings/textInput';
import { PY_TREE_NODE, treeRecorder } from './treeTrace';

/**
 * Print in Range (BST): print every value of a binary search tree that lies in [low, high], in ascending order, with
 * the recursive inorder walk that skips what cannot be in range:
 *
 *   an empty subtree prints nothing;
 *   node.val > low: the left subtree may hold values ≥ low, so visit it (otherwise all of it is < low: skipped);
 *   low ≤ node.val ≤ high: print the node (between its left and right subtrees, so the output is ascending);
 *   node.val < high: the right subtree may hold values ≤ high, so visit it (otherwise all of it is > high: skipped).
 *
 * It visits the h nodes on the paths to low and high, plus the k nodes it prints: O(h + k) time on the pruned walk,
 * O(n) at worst (every node in range, or a tall tree), and O(h) call-stack space.
 *
 * The trace is made by running that recursion: every call pushes a frame and every return pops it; each step keeps a
 * copy of the frames in progress. A skipped subtree is marked at the test that skips it.
 */

/** the tree, which must be a binary search tree (no value repeats) */
const BST_FIELD: TextField = {
  label: 'root',
  hint: `A binary search tree in level order: whole numbers from -999 to 999, null for a missing child; every left subtree smaller and every right subtree larger than its node, no value repeated, e.g. [8, 5, 12, 3, 6, 10, 14]; [] is the empty tree. At most ${MAX_TREE_NODES} nodes and ${MAX_TREE_LEVELS} levels`,
  defaultValue: '[8, 5, 12, 3, 6, 10, 14]',
  minLength: 1,
  maxLength: 160,
  chars: { pattern: '[\\s\\S]', description: 'any characters' },
  rule: 'level-order-bst',
};

const bound = (label: 'low' | 'high', defaultValue: string): TextField => ({
  label,
  hint: `The ${label === 'low' ? 'lower' : 'upper'} end of the range (included): a whole number from -999 to 999`,
  defaultValue,
  minLength: 1,
  maxLength: 4,
  chars: { pattern: '[-0-9 ]', description: 'digits and a minus sign' },
  rule: 'whole-number',
});

export const PRINT_IN_RANGE_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [BST_FIELD, bound('low', '5'), bound('high', '12')],
  textRange: { low: 1, high: 2 },
  textExamples: [
    ['[8, 5, 12, 3, 6, 10, 14]', '5', '12'],
    ['[8, 5, 12, 3, 6, 10, 14]', '9', '11'],
    ['[20, 10, 30, 5, 15, 25, 35, null, 7, 12]', '6', '26'],
    ['[50, 30, 70, 20, 40, 60, 80]', '0', '100'],
    ['[-5, -10, 0, -12, -7, null, 3]', '-8', '-1'],
    ['[10, 5, 15, 3, 7, 12, 18]', '7', '7'],
    ['[10, 5, 15]', '16', '20'],
    ['[1, null, 2, null, 3, null, 4]', '2', '3'],
  ],
};

function generatePrintInRangeSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [treeText, lowText, highText] = textInputs(PRINT_IN_RANGE_INPUT_SPEC, params, 'Print in Range (BST)');
  const tree = treeFromLevelOrder(treeText);
  const low = Number(lowText.trim());
  const high = Number(highText.trim());
  const { steps, push: record, node, values, show } = treeRecorder(tree);

  const printed: string[] = [];
  const outside: string[] = [];
  const pruned: string[] = [];
  const calls: TreeRangeCall[] = [];

  const printedText = () => (printed.length ? printed.map(id => node(id).value).join(' ') : 'nothing yet');
  const callText = (f: TreeRangeCall) => `printInRange(${f.via === 'root' ? 'root' : `node.${f.via}`}, ${low}, ${high})`;
  const count = (n: number) => `${n} node${n === 1 ? '' : 's'}`;

  /** a step: the node pointer is the running call's node; the range view is a copy of everything so far */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, current: string | null, result?: string) => {
    const top = calls.at(-1);
    record(s, {
      ...(current ? { current } : {}),
      visited: printed,
      pointers: top ? [{ name: 'node', node: top.node }] : [],
      range: { low, high, outside: [...outside], pruned: [...pruned], calls: calls.map(f => ({ ...f })) },
      ...(result ? { result: { kind: 'answer' as const, text: result } } : {}),
    });
  };

  /** marks the subtree below a test that skips it; returns how it is said in the explanation */
  const prune = (child: string | null, side: 'left' | 'right', parentValue: number): string => {
    if (child === null) return `${parentValue} has no ${side} subtree anyway.`;
    const ids = subtreeIds(tree, child);
    pruned.push(...ids);
    return `Its ${side} subtree (${count(ids.length)}: ${values(ids).slice(1, -1)}) is skipped without being visited.`;
  };

  /** printInRange(node, low, high) for the call calls[depth], as the listings write it */
  function visit(depth: number) {
    const frame = calls[depth];
    const here = frame.node;

    const empty = here === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-null',
        variables: { call: callText(frame), node: show(here), depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `${callText(frame)}: node == null?  node = ${show(here)} → ${empty}`,
        explanation: empty ? 'This subtree is empty: there is nothing to print here.' : `The subtree is not empty: look at its root, ${node(here!).value}.`,
        actionLabel: empty ? 'Empty subtree' : `At ${node(here!).value}`,
      },
      here
    );
    if (empty) {
      push(
        {
          type: 'return',
          codeRef: 'return-null',
          variables: { node: 'null', depth: depth + 1 },
          message: `return — ${callText(frame)} ends`,
          explanation: depth === 0 ? 'The tree is empty, so nothing is printed.' : 'Back to the caller, which carries on where it left off.',
          actionLabel: 'Return',
        },
        null
      );
      return;
    }

    const n = node(here!);
    const v = n.value;

    // 1. the left subtree holds only values smaller than v: worth visiting only if v > low
    const goLeft = v > low;
    const leftNote = goLeft ? '' : prune(n.left, 'left', v);
    push(
      {
        type: 'condition',
        codeRef: 'check-left',
        variables: { 'node.val': v, low },
        comparedValues: { val1: v, val2: low },
        result: goLeft ? 'true' : 'false',
        message: `node.val > low?  ${v} > ${low} → ${goLeft ? 'true — visit the left subtree' : 'false — skip the left subtree'}`,
        explanation: goLeft
          ? `${v} is above low, so ${v}'s left subtree may hold values from ${low} up: visit it first (smaller values are printed first).`
          : `${v} ≤ low (${low}): everything in ${v}'s left subtree is smaller than ${v}, so smaller than ${low} too — none of it can be in range. ${leftNote}`,
        actionLabel: goLeft ? 'Go left' : 'Prune left',
      },
      here
    );
    if (goLeft) {
      calls.push({ node: n.left, via: 'left' });
      push(
        {
          type: 'update',
          codeRef: 'recurse-left',
          variables: { call: `printInRange(node.left, ${low}, ${high})`, 'node.left': show(n.left), depth: depth + 2 },
          message: `call printInRange(node.left, ${low}, ${high})  — node.left = ${show(n.left)}`,
          explanation: `${v}'s call waits while a new call prints the left subtree${n.left ? ` (rooted at ${node(n.left).value})` : ', which is empty'}.`,
          actionLabel: 'Recurse left',
        },
        n.left
      );
      visit(depth + 1);
      calls.pop();
    }

    // 2. the node itself, between its two subtrees
    const inRange = low <= v && v <= high;
    if (!inRange) outside.push(here!);
    push(
      {
        type: 'condition',
        codeRef: 'check-range',
        variables: { low, 'node.val': v, high },
        result: inRange ? 'true' : 'false',
        message: `low <= node.val <= high?  ${low} <= ${v} <= ${high} → ${inRange}`,
        explanation: `${goLeft ? `Back in ${v}'s call: its left subtree is done. ` : ''}${
          inRange ? `${v} is in [${low}, ${high}]: print it.` : `${v} is ${v < low ? `below low (${low})` : `above high (${high})`}: it is not printed.`
        }`,
        actionLabel: inRange ? 'In range' : 'Out of range',
      },
      here
    );
    if (inRange) {
      printed.push(here!);
      push(
        {
          type: 'update',
          codeRef: 'print',
          variables: { printed: printedText() },
          message: `print ${v}  →  printed so far: ${printedText()}`,
          explanation: `${v} is printed after every smaller value in range (its left subtree) and before every larger one (its right subtree), so the output stays in ascending order.`,
          actionLabel: `Print ${v}`,
        },
        here
      );
    }

    // 3. the right subtree holds only values larger than v: worth visiting only if v < high
    const goRight = v < high;
    const rightNote = goRight ? '' : prune(n.right, 'right', v);
    push(
      {
        type: 'condition',
        codeRef: 'check-right',
        variables: { 'node.val': v, high },
        comparedValues: { val1: v, val2: high },
        result: goRight ? 'true' : 'false',
        message: `node.val < high?  ${v} < ${high} → ${goRight ? 'true — visit the right subtree' : 'false — skip the right subtree'}`,
        explanation: goRight
          ? `${v} is below high, so ${v}'s right subtree may hold values up to ${high}: visit it.`
          : `${v} ≥ high (${high}): everything in ${v}'s right subtree is larger than ${v}, so larger than ${high} too — none of it can be in range. ${rightNote}${
              depth === 0 ? '' : ` ${v}'s call ends here.`
            }`,
        actionLabel: goRight ? 'Go right' : 'Prune right',
      },
      here
    );
    if (goRight) {
      calls.push({ node: n.right, via: 'right' });
      push(
        {
          type: 'update',
          codeRef: 'recurse-right',
          variables: { call: `printInRange(node.right, ${low}, ${high})`, 'node.right': show(n.right), depth: depth + 2 },
          message: `call printInRange(node.right, ${low}, ${high})  — node.right = ${show(n.right)}`,
          explanation: `A new call prints ${v}'s right subtree${n.right ? ` (rooted at ${node(n.right).value})` : ', which is empty'}; ${v}'s call ends when it returns.`,
          actionLabel: 'Recurse right',
        },
        n.right
      );
      visit(depth + 1);
      calls.pop();
    }
  }

  calls.push({ node: tree.root, via: 'root' });
  push(
    {
      type: 'init',
      codeRef: 'call-root',
      variables: { root: levelOrderText(tree), low, high },
      message: `printInRange(root, ${low}, ${high})  — root = ${levelOrderText(tree)}`,
      explanation:
        'Print the values from low to high (both included) in ascending order: an inorder walk (left subtree, node, right subtree) that skips any subtree whose values are all below low or all above high.',
      actionLabel: 'Start',
    },
    tree.root
  );
  visit(0);
  calls.pop();

  const out = printed.map(id => node(id).value);
  const text = out.length
    ? `Printed in ascending order: ${out.join(' ')}`
    : tree.root === null
      ? 'Empty tree: nothing to print'
      : `No value of the tree is in [${low}, ${high}]: nothing printed`;
  const skipped = pruned.length;
  push(
    {
      type: 'complete',
      codeRef: 'done',
      variables: { printed: out.length ? out.join(' ') : 'nothing', count: out.length, skipped },
      message: `printInRange(root, ${low}, ${high}) returns — ${out.length ? `printed ${out.join(' ')}` : 'nothing printed'}`,
      explanation: `${count(tree.nodes.length - skipped)} visited and ${count(skipped)} skipped by pruning. The walk follows the paths towards low and high plus the nodes it prints: O(h + k) time on the pruned walk (O(n) at worst), and O(h) call-stack space.`,
      actionLabel: 'Done',
      outcomeText: text,
    },
    null,
    text
  );
  return steps;
}

export const bstPrintInRangeDefinition: AlgorithmDefinition = {
  id: 'bst-print-in-range',
  name: 'Print in Range (BST)',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Print the values in [low, high], skipping subtrees that cannot hold any.',
  description:
    'Prints every value of a binary search tree from low to high (both included), in ascending order. It is an inorder walk (left subtree, node, right subtree) that uses the BST order to prune: the left subtree is visited only when node.val > low, and the right subtree only when node.val < high, because otherwise every value there is out of range. It takes O(h + k) time on the pruned walk, where h is the height and k the number of values printed (O(n) at worst), and O(h) call-stack space.',
  complexity: {
    best: 'O(h + k)',
    average: 'O(h + k)',
    worst: 'O(n)',
    space: 'O(h)',
    bestFor: 'Range queries on a BST: only the subtrees that can hold values in [low, high] are visited',
  },
  defaultInput: [],
  inputSpec: PRINT_IN_RANGE_INPUT_SPEC,

  code: {
    c: `#include <stdio.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

void printInRange(struct TreeNode *node, int low, int high) {
    if (node == NULL) {
        return;
    }
    if (node->val > low) {
        printInRange(node->left, low, high);
    }
    if (low <= node->val && node->val <= high) {
        printf("%d ", node->val);
    }
    if (node->val < high) {
        printInRange(node->right, low, high);
    }
}`,
    cpp: `#include <iostream>
using namespace std;

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
};

void printInRange(TreeNode* node, int low, int high) {
    if (node == nullptr) {
        return;
    }
    if (node->val > low) {
        printInRange(node->left, low, high);
    }
    if (low <= node->val && node->val <= high) {
        cout << node->val << " ";
    }
    if (node->val < high) {
        printInRange(node->right, low, high);
    }
}`,
    java: `class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class PrintInRange {
    static void printInRange(TreeNode node, int low, int high) {
        if (node == null) {
            return;
        }
        if (node.val > low) {
            printInRange(node.left, low, high);
        }
        if (low <= node.val && node.val <= high) {
            System.out.print(node.val + " ");
        }
        if (node.val < high) {
            printInRange(node.right, low, high);
        }
    }
}`,
    python: `${PY_TREE_NODE}
def print_in_range(node, low, high):
    if node is None:
        return
    if node.val > low:
        print_in_range(node.left, low, high)
    if low <= node.val <= high:
        print(node.val, end=" ")
    if node.val < high:
        print_in_range(node.right, low, high)`,
  },

  // The first call and the end of the whole walk are the function itself: both name its signature line.
  lineMap: {
    c: { 'call-root': 9, 'check-null': 10, 'return-null': 11, 'check-left': 13, 'recurse-left': 14, 'check-range': 16, print: 17, 'check-right': 19, 'recurse-right': 20, done: 9 },
    cpp: { 'call-root': 10, 'check-null': 11, 'return-null': 12, 'check-left': 14, 'recurse-left': 15, 'check-range': 17, print: 18, 'check-right': 20, 'recurse-right': 21, done: 10 },
    java: { 'call-root': 8, 'check-null': 9, 'return-null': 10, 'check-left': 12, 'recurse-left': 13, 'check-range': 15, print: 16, 'check-right': 18, 'recurse-right': 19, done: 8 },
    python: { 'call-root': 7, 'check-null': 8, 'return-null': 9, 'check-left': 10, 'recurse-left': 11, 'check-range': 12, print: 13, 'check-right': 14, 'recurse-right': 15, done: 7 },
  },

  generateSteps: generatePrintInRangeSteps,
};
