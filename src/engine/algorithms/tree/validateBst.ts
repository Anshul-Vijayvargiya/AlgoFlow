import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, TreeValidateCall } from '../../../types/algorithm';
import { levelOrderText, treeFromLevelOrder } from '../../tree/binaryTree';
import { textInputs } from '../strings/textInput';
import { PY_TREE_NODE, TREE_FIELD, treeRecorder } from './treeTrace';

/**
 * Validate Binary Search Tree: is a binary tree a BST? A recursive DFS where each call is given the exclusive range
 * (min, max) that its ancestors allow:
 *
 *   an empty subtree is a valid BST (return true);
 *   a node outside its range (node.val <= min or node.val >= max) breaks the rule (return false);
 *   the left subtree must lie in (min, node.val), the right one in (node.val, max);
 *   the first false stops the whole validation: every caller passes it straight back up.
 *
 * The bounds carry every ancestor's constraint down the tree, so a node is checked against all of its ancestors, not
 * only its parent. Strict comparisons make a repeated value invalid. Each node is checked at most once: O(n) time,
 * fewer steps when an invalid node is found early; O(h) call-stack space (O(n) for a skewed tree).
 *
 * The trace is made by running that recursion: every call pushes a frame (with its bounds) and every return pops it;
 * each step keeps a copy of the frames in progress.
 */

/** any binary tree (no BST rule on the field: checking that is the algorithm's job), with a valid BST as the default */
export const VALIDATE_BST_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [
    {
      ...TREE_FIELD,
      hint: `${TREE_FIELD.hint}. Any binary tree: the algorithm checks whether it is a binary search tree (repeated values make it invalid)`,
      defaultValue: '[10, 5, 15, 2, 7, 12, 20]',
    },
  ],
  textExamples: [
    ['[10, 5, 15, 2, 7, 12, 20]'],
    ['[10, 5, 15, null, null, 6, 20]'],
    ['[5, 1, 4, null, null, 3, 6]'],
    ['[10, 5, 15, 5]'],
    ['[10, 5, 15, null, 10]'],
    ['[-5, -10, 0, -12, -7, null, 3]'],
    ['[5, 4, null, 3, null, 2, null, 1]'],
    ['[1, null, 2, null, 3, null, 4, null, 5]'],
    ['[-999, null, 999]'],
    ['[1]'],
  ],
};

const MINUS_INF = '−∞';
const PLUS_INF = '+∞';

function generateValidateBstSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [treeText] = textInputs(VALIDATE_BST_INPUT_SPEC, params, 'Validate Binary Search Tree');
  const tree = treeFromLevelOrder(treeText);
  const { steps, push: record, node, show } = treeRecorder(tree);

  type Frame = { -readonly [K in keyof TreeValidateCall]: TreeValidateCall[K] };
  const passed: string[] = [];
  const completed: string[] = [];
  const calls: Frame[] = [];
  let invalid: string | undefined;
  let conflict: string | undefined;
  let violation: string | undefined;
  let verdict: 'valid' | 'invalid' | undefined;

  const lo = (f: Frame) => (f.min === null ? MINUS_INF : String(f.min));
  const hi = (f: Frame) => (f.max === null ? PLUS_INF : String(f.max));
  const arg = (f: Frame) => (f.via === 'root' ? 'root' : `node.${f.via}`);
  const callText = (f: Frame) => `isValidBST(${arg(f)}, ${lo(f)}, ${hi(f)})`;
  const count = (n: number) => `${n} node${n === 1 ? '' : 's'}`;

  /** a step: the node pointer is the running call's node; the validate view is a copy of everything so far */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, current: string | null, result?: string) => {
    const top = calls.at(-1);
    record(s, {
      ...(current ? { current } : {}),
      visited: [],
      pointers: top ? [{ name: 'node', node: top.node }] : [],
      validate: {
        passed: [...passed],
        completed: [...completed],
        ...(invalid ? { invalid } : {}),
        ...(conflict ? { conflict } : {}),
        ...(violation ? { violation } : {}),
        calls: calls.map(f => ({ ...f })),
        ...(verdict ? { verdict } : {}),
      },
      ...(result ? { result: { kind: 'answer' as const, text: result } } : {}),
    });
  };

  /** isValidBST(node, min, max) for the call calls[depth], as the listings write it; returns what the call returns */
  function check(depth: number): boolean {
    const frame = calls[depth];
    const here = frame.node;
    const bounds = { min: lo(frame), max: hi(frame) };

    const empty = here === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-null',
        variables: { call: callText(frame), node: show(here), ...bounds, depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `${callText(frame)}: node == null?  node = ${show(here)} → ${empty}`,
        explanation: empty
          ? depth === 0
            ? 'The tree is empty. An empty tree has no node that could break the rule.'
            : 'This subtree is empty. It has no node that could break the rule, so it is a valid BST.'
          : `The subtree is not empty. Check its root, ${node(here!).value}, against the range its ancestors allow: (${bounds.min}, ${bounds.max}).`,
        actionLabel: empty ? 'Empty subtree' : `At ${node(here!).value}`,
      },
      here
    );
    if (empty) {
      frame.returns = true;
      push(
        {
          type: 'return',
          codeRef: 'return-null',
          variables: { returns: 'true', depth: depth + 1 },
          message: `return true: ${callText(frame)} ends`,
          explanation: depth === 0 ? 'An empty tree is a valid binary search tree.' : 'Back to the caller with true: an empty subtree is always valid.',
          actionLabel: 'Return true',
        },
        null
      );
      return true;
    }

    const n = node(here!);
    const v = n.value;

    // 1. the node itself: min < v < max, strictly (an equal value is a repeat, which a BST does not allow)
    const tooSmall = frame.min !== null && v <= frame.min;
    const tooLarge = frame.max !== null && v >= frame.max;
    const bad = tooSmall || tooLarge;
    let reason = '';
    if (bad) {
      const bound = tooSmall ? frame.min! : frame.max!;
      const from = tooSmall ? frame.minFrom! : frame.maxFrom!;
      const repeat = v === bound ? ' (values cannot repeat)' : '';
      reason = tooSmall
        ? `${v} is in the right subtree of ${bound}, so it must be greater than ${bound}${repeat}`
        : `${v} is in the left subtree of ${bound}, so it must be smaller than ${bound}${repeat}`;
      // the bound comes from a higher ancestor than the parent: the parent alone would accept the node
      const parent = calls[depth - 1].node!;
      const missed =
        from === parent
          ? ''
          : ` Its parent ${node(parent).value} alone would allow it (${v} is ${frame.via === 'left' ? 'smaller' : 'greater'} than ${node(parent).value}). Only the bound passed down from the ancestor ${bound} catches it, which a parent-child comparison would miss.`;
      invalid = here!;
      conflict = from;
      violation = reason;
      push(
        {
          type: 'condition',
          codeRef: 'check-range',
          variables: { 'node.val': v, ...bounds },
          comparedValues: { val1: v, val2: bound },
          result: 'true',
          message: `node.val <= min || node.val >= max?  ${v} <= ${bounds.min} || ${v} >= ${bounds.max} → true`,
          explanation: `${v} is outside its allowed range (${bounds.min}, ${bounds.max}): ${reason}.${missed}`,
          actionLabel: 'Out of range',
        },
        here
      );
      frame.returns = false;
      push(
        {
          type: 'return',
          codeRef: 'return-invalid',
          variables: { returns: 'false', depth: depth + 1 },
          message: `return false: ${v} breaks the BST rule`,
          explanation: 'Validation stops at the first invalid node. Every caller passes false straight back up without checking anything else.',
          actionLabel: 'Return false',
        },
        here
      );
      return false;
    }
    passed.push(here!);
    push(
      {
        type: 'condition',
        codeRef: 'check-range',
        variables: { 'node.val': v, ...bounds },
        result: 'false',
        message: `node.val <= min || node.val >= max?  ${v} <= ${bounds.min} || ${v} >= ${bounds.max} → false`,
        explanation: `${bounds.min} < ${v} < ${bounds.max}: ${v} is inside its allowed range. Its left subtree must stay between ${bounds.min} and ${v}, its right subtree between ${v} and ${bounds.max}.`,
        actionLabel: 'In range',
      },
      here
    );

    // 2. the left subtree: the upper bound becomes v, the lower bound is inherited
    calls.push({ node: n.left, via: 'left', min: frame.min, max: v, minFrom: frame.minFrom, maxFrom: here });
    push(
      {
        type: 'update',
        codeRef: 'recurse-left',
        variables: { call: `isValidBST(node.left, ${bounds.min}, ${v})`, 'node.left': show(n.left), depth: depth + 2 },
        message: `leftValid = isValidBST(node.left, ${bounds.min}, ${v}), where node.left = ${show(n.left)}`,
        explanation: `Everything in ${v}'s left subtree must be smaller than ${v} and still greater than ${bounds.min}: the upper bound becomes ${v}, the lower bound is passed down unchanged. ${v}'s call waits${
          n.left ? '.' : ' (the left subtree is empty).'
        }`,
        actionLabel: 'Recurse left',
      },
      n.left
    );
    const leftValid = check(depth + 1);
    calls.pop();
    push(
      {
        type: 'condition',
        codeRef: 'check-left',
        variables: { leftValid: String(leftValid) },
        result: leftValid ? 'false' : 'true',
        message: `!leftValid?  leftValid = ${leftValid} → ${!leftValid}`,
        explanation: leftValid
          ? `Back in ${v}'s call: its left subtree is a valid BST. Now check the right subtree.`
          : `Back in ${v}'s call: its left subtree is not a valid BST, so the subtree rooted at ${v} is not one either.`,
        actionLabel: leftValid ? 'Left valid' : 'Left invalid',
      },
      here
    );
    if (!leftValid) {
      frame.returns = false;
      push(
        {
          type: 'return',
          codeRef: 'return-left-false',
          variables: { returns: 'false', depth: depth + 1 },
          message: `return false: ${callText(frame)} ends`,
          explanation: `Pass false up without checking ${v}'s right subtree: one invalid node is enough.`,
          actionLabel: 'Return false',
        },
        here
      );
      return false;
    }

    // 3. the right subtree: the lower bound becomes v, the upper bound is inherited
    calls.push({ node: n.right, via: 'right', min: v, max: frame.max, minFrom: here, maxFrom: frame.maxFrom });
    push(
      {
        type: 'update',
        codeRef: 'recurse-right',
        variables: { call: `isValidBST(node.right, ${v}, ${bounds.max})`, 'node.right': show(n.right), depth: depth + 2 },
        message: `rightValid = isValidBST(node.right, ${v}, ${bounds.max}), where node.right = ${show(n.right)}`,
        explanation: `Everything in ${v}'s right subtree must be greater than ${v} and still smaller than ${bounds.max}: the lower bound becomes ${v}, the upper bound is passed down unchanged${
          n.right ? '.' : ' (the right subtree is empty).'
        }`,
        actionLabel: 'Recurse right',
      },
      n.right
    );
    const rightValid = check(depth + 1);
    calls.pop();
    if (rightValid) completed.push(here!);
    frame.returns = rightValid;
    push(
      {
        type: 'return',
        codeRef: 'return-right',
        variables: { rightValid: String(rightValid), returns: String(rightValid), depth: depth + 1 },
        message: `return rightValid: ${rightValid}`,
        explanation: rightValid
          ? `${v} is in range and both of its subtrees are valid BSTs: the subtree rooted at ${v} is a valid BST.`
          : `${v}'s right subtree is not a valid BST: return false.`,
        actionLabel: `Return ${rightValid}`,
      },
      here
    );
    return rightValid;
  }

  calls.push({ node: tree.root, via: 'root', min: null, max: null, minFrom: null, maxFrom: null });
  push(
    {
      type: 'init',
      codeRef: 'call-root',
      variables: { root: levelOrderText(tree), min: MINUS_INF, max: PLUS_INF },
      message: `isValidBST(root, ${MINUS_INF}, ${PLUS_INF}), where root = ${levelOrderText(tree)}`,
      explanation:
        'A binary search tree needs every value in a left subtree smaller than its node and every value in a right subtree greater. Each call is given the range (min, max) its ancestors allow. The root may hold any value, so its range is (−∞, +∞).',
      actionLabel: 'Start',
    },
    tree.root
  );
  const valid = check(0);
  calls.pop();

  verdict = valid ? 'valid' : 'invalid';
  const total = tree.nodes.length;
  const checked = passed.length + (invalid ? 1 : 0);
  const text = valid
    ? total === 0
      ? 'VALID BST: the empty tree is a valid binary search tree'
      : total === 1
        ? 'VALID BST: a single node is always a valid binary search tree'
        : `VALID BST: all ${total} nodes are inside the ranges their ancestors allow`
    : `INVALID BST: ${violation}`;
  push(
    {
      type: 'complete',
      codeRef: 'done',
      variables: { result: String(valid), checked, nodes: total },
      message: `isValidBST(root, ${MINUS_INF}, ${PLUS_INF}) returns ${valid}`,
      explanation: valid
        ? `Every node was checked once against the range its ancestors allow: O(n) time, and O(h) call-stack space, where h is the height (O(n) for a skewed tree).`
        : `Validation stopped at the first invalid node after checking ${count(checked)} of ${total}; ${count(total - checked)} were never checked. O(n) time at worst, and O(h) call-stack space.`,
      actionLabel: valid ? 'Valid BST' : 'Invalid BST',
      outcomeText: text,
    },
    null,
    text
  );
  return steps;
}

export const treeValidateBstDefinition: AlgorithmDefinition = {
  id: 'tree-validate-bst',
  name: 'Validate Binary Search Tree',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Is it a BST? Recursive DFS that passes each subtree its allowed (min, max) range.',
  description:
    'Checks whether a binary tree is a binary search tree: every value in a left subtree smaller than its node and every value in a right subtree greater, so no value repeats. A recursive depth-first search passes each call the exclusive range (min, max) its ancestors allow. The root gets (−∞, +∞), a left child gets (min, node.val) and a right child gets (node.val, max). A node outside its range makes the tree invalid, and validation stops there. Comparing a node only with its parent is not enough: the bounds also catch a node that breaks the rule of a higher ancestor. It takes O(n) time, stopping early at the first invalid node, and O(h) call-stack space, where h is the height (O(n) for a skewed tree).',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(h)',
    bestFor: 'Checking the BST property, including ancestor constraints; stops early at the first invalid node',
  },
  defaultInput: [],
  inputSpec: VALIDATE_BST_INPUT_SPEC,

  code: {
    c: `#include <limits.h>
#include <stdbool.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

// min and max are exclusive; a long long holds every int, so LLONG_MIN and LLONG_MAX act as -inf and +inf
bool isValidBST(struct TreeNode *node, long long min, long long max) {
    if (node == NULL) {
        return true;
    }
    if (node->val <= min || node->val >= max) {
        return false;
    }
    bool leftValid = isValidBST(node->left, min, node->val);
    if (!leftValid) {
        return false;
    }
    bool rightValid = isValidBST(node->right, node->val, max);
    return rightValid;
}

bool isBinarySearchTree(struct TreeNode *root) {
    return isValidBST(root, LLONG_MIN, LLONG_MAX);
}`,
    cpp: `#include <climits>

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
};

// min and max are exclusive; a long long holds every int, so LLONG_MIN and LLONG_MAX act as -inf and +inf
bool isValidBST(TreeNode* node, long long min, long long max) {
    if (node == nullptr) {
        return true;
    }
    if (node->val <= min || node->val >= max) {
        return false;
    }
    bool leftValid = isValidBST(node->left, min, node->val);
    if (!leftValid) {
        return false;
    }
    bool rightValid = isValidBST(node->right, node->val, max);
    return rightValid;
}

bool isBinarySearchTree(TreeNode* root) {
    return isValidBST(root, LLONG_MIN, LLONG_MAX);
}`,
    java: `class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class ValidateBST {
    // min and max are exclusive; a long holds every int, so Long.MIN_VALUE and Long.MAX_VALUE act as -inf and +inf
    static boolean isValidBST(TreeNode node, long min, long max) {
        if (node == null) {
            return true;
        }
        if (node.val <= min || node.val >= max) {
            return false;
        }
        boolean leftValid = isValidBST(node.left, min, node.val);
        if (!leftValid) {
            return false;
        }
        boolean rightValid = isValidBST(node.right, node.val, max);
        return rightValid;
    }

    public static boolean isBinarySearchTree(TreeNode root) {
        return isValidBST(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }
}`,
    python: `${PY_TREE_NODE}
# min_val and max_val are exclusive bounds
def is_valid_bst(node, min_val, max_val):
    if node is None:
        return True
    if node.val <= min_val or node.val >= max_val:
        return False
    left_valid = is_valid_bst(node.left, min_val, node.val)
    if not left_valid:
        return False
    right_valid = is_valid_bst(node.right, node.val, max_val)
    return right_valid

def is_binary_search_tree(root):
    # float("-inf") and float("inf") are below and above every value
    return is_valid_bst(root, float("-inf"), float("inf"))`,
  },

  // The first call and the end of the whole check are the wrapper's one statement: both name that line.
  lineMap: {
    c: { 'call-root': 27, 'check-null': 12, 'return-null': 13, 'check-range': 15, 'return-invalid': 16, 'recurse-left': 18, 'check-left': 19, 'return-left-false': 20, 'recurse-right': 22, 'return-right': 23, done: 27 },
    cpp: { 'call-root': 26, 'check-null': 11, 'return-null': 12, 'check-range': 14, 'return-invalid': 15, 'recurse-left': 17, 'check-left': 18, 'return-left-false': 19, 'recurse-right': 21, 'return-right': 22, done: 26 },
    java: { 'call-root': 25, 'check-null': 10, 'return-null': 11, 'check-range': 13, 'return-invalid': 14, 'recurse-left': 16, 'check-left': 17, 'return-left-false': 18, 'recurse-right': 20, 'return-right': 21, done: 25 },
    python: { 'call-root': 21, 'check-null': 9, 'return-null': 10, 'check-range': 11, 'return-invalid': 12, 'recurse-left': 13, 'check-left': 14, 'return-left-false': 15, 'recurse-right': 16, 'return-right': 17, done: 21 },
  },

  generateSteps: generateValidateBstSteps,
};
