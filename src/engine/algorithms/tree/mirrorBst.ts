import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, TextField, TreeMirrorCall, TreeMirrorSwap, TreeNodeView } from '../../../types/algorithm';
import { MAX_TREE_LEVELS, MAX_TREE_NODES, levelOrderText, treeFromLevelOrder } from '../../tree/binaryTree';
import { textInputs } from '../strings/textInput';
import { C_TREE_NODE, CPP_TREE_NODE, PY_TREE_NODE } from './treeTrace';

/**
 * Mirror a BST (Invert Binary Tree): swap the left and right children of every node, with a recursive DFS:
 *
 *   an empty subtree is its own mirror (return null);
 *   temp = node.left; node.left = node.right; node.right = temp (the swap; temp keeps the left subtree reachable);
 *   mirror(node.left); mirror(node.right) (the children, already swapped, are mirrored in turn);
 *   return node (the same node: the links are changed in place, no node is created).
 *
 * Every node is visited once: O(n) time; O(h) call-stack space, O(log n) for a balanced tree and O(n) for a skewed one.
 * The mirror of a BST with two or more nodes is not a BST under the usual rule: its values decrease from left to right.
 *
 * The trace is made by running that recursion on a copy of the parsed tree (the input is never changed): every call
 * pushes a frame and every return pops it. A step's nodes are the links as they stand; while a node's three swap
 * statements run, its real links are in mirror.swap and its drawn links stay the original ones until the swap is done
 * (just after `node.left = node.right` both of its links point to the same child, which is not a tree).
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

export const MIRROR_BST_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [BST_FIELD],
  textExamples: [
    ['[8, 5, 12, 3, 6, 10, 14]'],
    ['[20, 10, 30, 5, 15, null, 35, null, 7]'],
    ['[50, 30, 70, 20, 40]'],
    ['[-5, -10, 0, -12, -7, null, 3]'],
    ['[5, 4, null, 3, null, 2, null, 1]'],
    ['[1, null, 2, null, 3, null, 4, null, 5]'],
    ['[10, 5, 15, null, 7, 12]'],
    ['[2, 1, 3]'],
    ['[7]'],
  ],
};

function generateMirrorBstSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [treeText] = textInputs(MIRROR_BST_INPUT_SPEC, params, 'Mirror a BST');
  const input = treeFromLevelOrder(treeText);
  const root = input.root;
  const value = new Map(input.nodes.map(n => [n.id, n.value]));
  // the working copy: the links the code changes (the parsed tree's node objects are never written to)
  const links = new Map(input.nodes.map(n => [n.id, { left: n.left, right: n.right }]));
  // the links as drawn: a new frozen array each time a swap is completed
  const snapshot = (): readonly TreeNodeView[] => Object.freeze(input.nodes.map(n => Object.freeze({ id: n.id, value: n.value, ...links.get(n.id)! })));
  let nodes = snapshot();
  const original = levelOrderText(input);
  const shapeNow = () => levelOrderText({ nodes, root });

  const steps: ExecutionStep[] = [];
  const swapped: string[] = [];
  const completed: string[] = [];
  const calls: { -readonly [K in keyof TreeMirrorCall]: TreeMirrorCall[K] }[] = [];
  let swap: TreeMirrorSwap | undefined;

  const v = (id: string | null) => (id === null ? 'null' : String(value.get(id)));
  const show = (id: string | null) => (id === null ? 'null' : `node ${value.get(id)}`);
  const arg = (f: TreeMirrorCall) => (f.via === 'root' ? 'root' : `node.${f.via}`);

  /** a step: the node pointer is the running call's node (and temp, during a swap); the mirror view is a copy of everything so far */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, current: string | null, result?: string) => {
    const top = calls.at(-1);
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      tree: {
        nodes,
        root,
        ...(current ? { current } : {}),
        visited: [],
        pointers: [...(top ? [{ name: 'node', node: top.node }] : []), ...(swap ? [{ name: 'temp', node: swap.temp }] : [])],
        mirror: {
          swapped: [...swapped],
          completed: [...completed],
          ...(swap ? { swap: { ...swap } } : {}),
          calls: calls.map(f => ({ ...f })),
          original,
          shape: shapeNow(),
        },
        ...(result ? { result: { kind: 'answer' as const, text: result } } : {}),
      },
    });
  };

  /** mirror(node) for the call calls[depth], as the listings write it */
  function mirror(depth: number): void {
    const frame = calls[depth];
    const here = frame.node;
    const empty = here === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-null',
        variables: { call: `mirror(${arg(frame)})`, node: show(here), depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `mirror(${arg(frame)}): node == null?  node = ${show(here)} → ${empty}`,
        explanation: empty
          ? depth === 0
            ? 'The tree is empty: there is nothing to mirror.'
            : 'This subtree is empty. An empty subtree is its own mirror.'
          : `The subtree rooted at ${v(here)} is not empty: swap ${v(here)}'s children, then mirror both of them.`,
        actionLabel: empty ? 'Empty subtree' : `At ${v(here)}`,
      },
      here
    );
    if (empty) {
      frame.returned = true;
      push(
        {
          type: 'return',
          codeRef: 'return-null',
          variables: { returns: 'null', depth: depth + 1 },
          message: `return null: mirror(${arg(frame)}) ends`,
          explanation: depth === 0 ? 'The mirror of the empty tree is the empty tree.' : 'Back to the caller: nothing to swap in an empty subtree.',
          actionLabel: 'Return null',
        },
        null
      );
      return;
    }

    const id = here!;
    const x = v(id);
    const link = links.get(id)!;
    const originalLeft = link.left;
    const originalRight = link.right;
    const leaf = originalLeft === null && originalRight === null;

    // 1. temp = node.left
    const temp = link.left;
    swap = { node: id, originalLeft, originalRight, phase: 'temp', temp, left: link.left, right: link.right };
    push(
      {
        type: 'update',
        codeRef: 'save-temp',
        variables: { temp: show(temp), 'node.left': show(link.left), 'node.right': show(link.right) },
        message: `temp = node.left = ${show(temp)}`,
        explanation: leaf
          ? `${x} is a leaf: both of its children are null, so the swap changes nothing, but the three statements run all the same. temp = null.`
          : `Keep ${x}'s left child (${show(originalLeft)}) in temp before its link is overwritten: without temp, the left subtree would be lost.`,
        actionLabel: 'temp = left',
      },
      id
    );

    // 2. node.left = node.right
    link.left = link.right;
    swap = { ...swap, phase: 'left', left: link.left };
    push(
      {
        type: 'update',
        codeRef: 'set-left',
        variables: { temp: show(temp), 'node.left': show(link.left), 'node.right': show(link.right) },
        message: `node.left = node.right = ${show(link.left)}`,
        explanation: leaf
          ? `node.left = node.right: null again.`
          : originalRight === null
            ? `${x}'s left link now holds its right child, which is null. Its original left subtree (${show(originalLeft)}) is still reachable through temp.`
            : `${x}'s left link now points to ${v(originalRight)}. For a moment both links point to ${v(originalRight)}${
                originalLeft === null ? '' : `, and the original left subtree (${show(originalLeft)}) is reachable only through temp`
              }.`,
        actionLabel: 'left = right',
      },
      id
    );

    // 3. node.right = temp: the swap is done, and the tree is drawn with it
    link.right = temp;
    swap = { ...swap, phase: 'right', right: link.right };
    nodes = snapshot();
    swapped.push(id);
    push(
      {
        type: 'swap',
        codeRef: 'set-right',
        variables: { temp: show(temp), 'node.left': show(link.left), 'node.right': show(link.right) },
        message: `node.right = temp = ${show(link.right)}`,
        explanation: leaf
          ? `node.right = temp: null. Nothing moved, but ${x}'s children count as swapped.`
          : `${x}'s right link now points to ${show(temp)}. The children of ${x} are swapped: ${v(link.left)} on the left, ${v(link.right)} on the right. Only the two links changed: the nodes stay where they are in memory and keep their values.`,
        actionLabel: 'Swapped',
      },
      id
    );
    swap = undefined;

    // 4. mirror(node.left): the new left child, which was the right one
    calls.push({ node: link.left, via: 'left' });
    push(
      {
        type: 'update',
        codeRef: 'recurse-left',
        variables: { call: 'mirror(node.left)', 'node.left': show(link.left), depth: depth + 2 },
        message: `mirror(node.left), where node.left = ${show(link.left)}`,
        explanation: link.left
          ? `Mirror ${x}'s new left subtree, rooted at ${v(link.left)} (its right subtree before the swap). ${x}'s call waits.`
          : `${x}'s new left child is null: the call returns at once.`,
        actionLabel: 'Recurse left',
      },
      link.left
    );
    mirror(depth + 1);
    calls.pop();

    // 5. mirror(node.right): the new right child, which was the left one
    calls.push({ node: link.right, via: 'right' });
    push(
      {
        type: 'update',
        codeRef: 'recurse-right',
        variables: { call: 'mirror(node.right)', 'node.right': show(link.right), depth: depth + 2 },
        message: `mirror(node.right), where node.right = ${show(link.right)}`,
        explanation: link.right
          ? `Back in ${x}'s call, its left subtree is mirrored. Now mirror its new right subtree, rooted at ${v(link.right)} (its left subtree before the swap).`
          : `Back in ${x}'s call, its left subtree is mirrored. Its new right child is null: the call returns at once.`,
        actionLabel: 'Recurse right',
      },
      link.right
    );
    mirror(depth + 1);
    calls.pop();

    // 6. return node
    frame.returned = true;
    completed.push(id);
    push(
      {
        type: 'return',
        codeRef: 'return-node',
        variables: { returns: show(id), depth: depth + 1 },
        message: `return node: mirror(${arg(frame)}) returns ${show(id)}`,
        explanation: `The whole subtree rooted at ${x} is mirrored. The call returns the same node ${x} it was given: its links changed, the node did not.`,
        actionLabel: `Return ${x}`,
      },
      id
    );
  }

  calls.push({ node: root, via: 'root' });
  push(
    {
      type: 'init',
      codeRef: 'call-root',
      variables: { root: original },
      message: `mirror(root), where root = ${original}`,
      explanation:
        'Mirroring swaps the left and right children of every node, so the tree reads the same as in a mirror. Each call swaps its node\'s children, then mirrors both of them. No node is created: only the links change.',
      actionLabel: 'Start',
    },
    root
  );
  mirror(0);
  calls.pop();

  const total = input.nodes.length;
  const mirrored = shapeNow();
  const text =
    total === 0
      ? 'Mirrored tree: [] (the empty tree is its own mirror)'
      : total === 1
        ? `Mirrored tree: ${mirrored} (a single node is its own mirror)`
        : `Mirrored tree: ${mirrored} (values now decrease from left to right: not a valid BST)`;
  push(
    {
      type: 'complete',
      codeRef: 'done',
      variables: { original, mirrored, nodes: total, swaps: swapped.length },
      message: `mirror(root) returns ${show(root)}: ${original} → ${mirrored}`,
      explanation:
        total <= 1
          ? `A tree with ${total === 0 ? 'no node' : 'one node'} looks the same in a mirror, so it is still a valid BST. O(n) time, O(h) call-stack space.`
          : `Every node's children were swapped once: O(n) time, and O(h) call-stack space (O(log n) for a balanced tree, O(n) for a skewed one). The mirror is not a valid binary search tree under the usual rule: every left subtree now holds larger values and every right subtree smaller ones, so an inorder walk reads the values in decreasing order.`,
      actionLabel: 'Mirrored',
      outcomeText: text,
    },
    null,
    text
  );
  return steps;
}

export const bstMirrorDefinition: AlgorithmDefinition = {
  id: 'bst-mirror',
  name: 'Mirror a BST',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Invert a binary tree: swap the children of every node with a recursive DFS.',
  description:
    'Mirrors (inverts) a binary search tree: the left and right children of every node are swapped, so the tree reads the same as in a mirror. A recursive depth-first search swaps a node\'s two child links using a temporary variable, then mirrors its left and right subtrees, and returns the same node. No node is created or copied: only the child references change, and every value stays in its node. Every node is visited once, so it takes O(n) time, with O(h) call-stack space, where h is the height: O(log n) for a balanced tree and O(n) for a skewed one. The mirror of a BST with two or more nodes is not a valid BST under the usual rule (left < node < right): its values decrease from left to right.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(h)',
    bestFor: 'Inverting a tree in place: swaps child references, creates no nodes; O(log n) stack when balanced, O(n) when skewed',
  },
  defaultInput: [],
  inputSpec: MIRROR_BST_INPUT_SPEC,

  code: {
    c: `${C_TREE_NODE}
struct TreeNode* mirror(struct TreeNode *node) {
    if (node == NULL) {
        return NULL;
    }
    struct TreeNode *temp = node->left;
    node->left = node->right;
    node->right = temp;
    mirror(node->left);
    mirror(node->right);
    return node;
}`,
    cpp: `${CPP_TREE_NODE}
TreeNode* mirror(TreeNode* node) {
    if (node == nullptr) {
        return nullptr;
    }
    TreeNode* temp = node->left;
    node->left = node->right;
    node->right = temp;
    mirror(node->left);
    mirror(node->right);
    return node;
}`,
    java: `class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class MirrorBST {
    static TreeNode mirror(TreeNode node) {
        if (node == null) {
            return null;
        }
        TreeNode temp = node.left;
        node.left = node.right;
        node.right = temp;
        mirror(node.left);
        mirror(node.right);
        return node;
    }
}`,
    python: `${PY_TREE_NODE}
def mirror(node):
    if node is None:
        return None
    temp = node.left
    node.left = node.right
    node.right = temp
    mirror(node.left)
    mirror(node.right)
    return node`,
  },

  // The first call and the end of the whole mirror are the function itself: both name its first line.
  lineMap: {
    c: { 'call-root': 7, 'check-null': 8, 'return-null': 9, 'save-temp': 11, 'set-left': 12, 'set-right': 13, 'recurse-left': 14, 'recurse-right': 15, 'return-node': 16, done: 7 },
    cpp: { 'call-root': 7, 'check-null': 8, 'return-null': 9, 'save-temp': 11, 'set-left': 12, 'set-right': 13, 'recurse-left': 14, 'recurse-right': 15, 'return-node': 16, done: 7 },
    java: { 'call-root': 8, 'check-null': 9, 'return-null': 10, 'save-temp': 12, 'set-left': 13, 'set-right': 14, 'recurse-left': 15, 'recurse-right': 16, 'return-node': 17, done: 8 },
    python: { 'call-root': 7, 'check-null': 8, 'return-null': 9, 'save-temp': 10, 'set-left': 11, 'set-right': 12, 'recurse-left': 13, 'recurse-right': 14, 'return-node': 15, done: 7 },
  },

  generateSteps: generateMirrorBstSteps,
};
