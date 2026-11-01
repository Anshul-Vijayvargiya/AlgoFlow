import type { AlgorithmDefinition, ExecutionStep, TreeBuildView, TreeCallFrame, TreeNodeView } from '../../../types/algorithm';
import { levelOrderText } from '../../tree/binaryTree';
import { PY_TREE_NODE } from './treeTrace';

/**
 * Build a Binary Search Tree, recursively: buildBST calls root = insert(root, value) for each value in order, and
 * insert(node, value) returns the root of the subtree after inserting value into it:
 *
 *   an empty subtree (the base case) returns a new node;
 *   a smaller value goes into the left subtree: node.left = insert(node.left, value);
 *   a larger value into the right one: node.right = insert(node.right, value);
 *   an equal value is a duplicate and is skipped (the subtree is returned unchanged);
 *   every call returns its node, so each caller re-links the child it called on.
 *
 * It builds the same tree as the iterative version (same order, same duplicate policy). An ordinary, unbalanced BST:
 * one insertion makes h + 1 calls, so it takes O(h) time and O(h) call-stack space — O(log n) on a roughly balanced
 * tree, O(n) on a skewed one; building takes O(n log n) on average and O(n²) at worst; the tree takes O(n) space.
 *
 * The trace is made by running that recursion: every call pushes a frame, every return pops it, and each step keeps a
 * frozen copy of the stack at that moment (at most h + 2 frame references). The tree grows as in the iterative build:
 * a new nodes array only when a node is linked, replacing only the parent that gains it, so earlier steps never change.
 */
function generateBuildBstRecursiveSteps(input: number[]): ExecutionStep[] {
  if (input.some(v => !Number.isInteger(v))) throw new TypeError('Build a Binary Search Tree (Recursive): every value must be a whole number.');
  const values: readonly number[] = Object.freeze([...input]);
  const n = values.length;
  const steps: ExecutionStep[] = [];
  const NO_VISITS: readonly string[] = Object.freeze([]);

  let nodes: readonly TreeNodeView[] = Object.freeze([]);
  let root: string | null = null;
  const byId = new Map<string, TreeNodeView>();
  let skipped: readonly number[] = Object.freeze([]);
  /** the calls in progress, outermost first (frames are frozen; each step copies the array of references) */
  const calls: TreeCallFrame[] = [];

  const node = (id: string) => byId.get(id)!;
  const show = (id: string | null) => (id === null ? 'null' : `node ${node(id).value}`);
  const shape = () => levelOrderText({ nodes, root });
  const callText = (f: TreeCallFrame, value: number) => `insert(${f.via === 'root' ? 'root' : `node.${f.via}`}, ${value})`;

  /** links a created leaf below parent (or as the root); the parent is replaced, every other node is kept */
  const link = (leaf: TreeNodeView, parent: string | null, side: 'left' | 'right') => {
    byId.set(leaf.id, leaf);
    if (parent === null) {
      root = leaf.id;
      nodes = Object.freeze([leaf]);
      return;
    }
    const updated: TreeNodeView = Object.freeze({ ...node(parent), [side]: leaf.id });
    byId.set(parent, updated);
    nodes = Object.freeze([...nodes.map(x => (x.id === parent ? updated : x)), leaf]);
  };

  interface Focus {
    index: number | null;
    current?: string | null;
    slot?: TreeBuildView['slot'];
    created?: TreeNodeView;
    inserted?: string;
    duplicate?: string;
    result?: string;
  }
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, f: Focus) => {
    const top = calls.at(-1);
    // the node pointer of the running call, and the caller's node it was called from
    const pointers = top ? [{ name: 'node', node: top.node }] : [];
    steps.push({
      id: steps.length,
      state: [],
      ...s,
      tree: {
        nodes,
        root,
        ...(f.current ? { current: f.current } : {}),
        visited: NO_VISITS,
        pointers,
        ...(f.result ? { result: { kind: 'answer' as const, text: f.result } } : {}),
        build: {
          values,
          index: f.index,
          // the search path is the chain of subtrees the calls in progress work on
          path: Object.freeze(calls.flatMap(c => (c.node === null ? [] : [c.node]))),
          skipped,
          calls: Object.freeze([...calls]),
          ...(f.slot ? { slot: f.slot } : {}),
          ...(f.created ? { created: f.created } : {}),
          ...(f.inserted ? { inserted: f.inserted } : {}),
          ...(f.duplicate ? { duplicate: f.duplicate } : {}),
        },
      },
    });
  };

  /** the empty child a base-case call stands for: its caller's node and side (or the empty tree's root) */
  const slotOf = (depth: number): TreeBuildView['slot'] => {
    const f = calls[depth];
    return f.via === 'root' ? { parent: null, side: 'root' } : { parent: calls[depth - 1].node, side: f.via };
  };

  /**
   * insert(node, value) for values[i], as the listings write it: the frame for this call is calls[depth]. Returns the
   * subtree root, and the node it created (when the base case was reached below), so the caller can link it.
   */
  function insert(i: number, depth: number): { returns: string; created: TreeNodeView | null } {
    const value = values[i];
    const frame = calls[depth];
    const here = frame.node;

    // base case: an empty subtree becomes a new node
    const empty = here === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-null',
        variables: { call: callText(frame, value), node: show(here), depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `${callText(frame, value)}: node == null?  node = ${show(here)} → ${empty}`,
        explanation: empty
          ? `Base case: this subtree is empty, so ${value} belongs exactly here. Without this case the calls would never stop.`
          : `The subtree is not empty: compare ${value} with its root, ${node(here!).value}.`,
        actionLabel: empty ? 'Base case' : 'Not empty',
      },
      { index: i, ...(here ? { current: here } : { slot: slotOf(depth) }) }
    );

    if (empty) {
      const created: TreeNodeView = Object.freeze({ id: `n${i}`, value, left: null, right: null });
      calls[depth] = Object.freeze({ ...frame, returns: created.id });
      push(
        {
          type: 'return',
          codeRef: 'base-create',
          variables: { returns: `new node(${value})`, depth: depth + 1 },
          message: `return new node(${value})`,
          explanation:
            depth === 0
              ? `The new node goes back to buildBST, which makes it the root.`
              : `The new node is handed back to the caller, which links it as its ${frame.via} child.`,
          actionLabel: 'Create node',
        },
        { index: i, slot: slotOf(depth), created }
      );
      return { returns: created.id, created };
    }

    const nv = node(here!).value;
    const smaller = value < nv;
    push(
      {
        type: 'condition',
        codeRef: 'check-less',
        variables: { value, 'node.val': nv },
        comparedValues: { val1: value, val2: nv },
        result: smaller ? 'true' : 'false',
        message: `value < node.val?  ${value} < ${nv} → ${smaller ? 'true — recurse left' : 'false'}`,
        explanation: smaller
          ? `${value} is smaller than ${nv}: every smaller value lives in ${nv}'s left subtree, so insert it there.`
          : `${value} is not smaller than ${nv}.`,
        actionLabel: smaller ? 'Smaller' : 'Not smaller',
      },
      { index: i, current: here }
    );

    let side: 'left' | 'right' | null = smaller ? 'left' : null;
    if (!smaller) {
      const larger = value > nv;
      if (!larger) skipped = Object.freeze([...skipped, i]);
      push(
        {
          type: 'condition',
          codeRef: 'check-greater',
          variables: { value, 'node.val': nv },
          comparedValues: { val1: value, val2: nv },
          result: larger ? 'true' : 'false',
          message: `value > node.val?  ${value} > ${nv} → ${larger ? 'true — recurse right' : 'false — equal: a duplicate'}`,
          explanation: larger
            ? `${value} is larger than ${nv}: every larger value lives in ${nv}'s right subtree, so insert it there.`
            : `${value} equals ${nv}: it is already in the tree. Duplicates are skipped, so no call is made and the subtree stays as it is.`,
          actionLabel: larger ? 'Larger' : 'Duplicate',
        },
        { index: i, current: here, ...(larger ? {} : { duplicate: here! }) }
      );
      side = larger ? 'right' : null;
    }

    if (side) {
      const child = node(here!)[side];
      calls.push(Object.freeze({ node: child, via: side }));
      push(
        {
          type: 'update',
          codeRef: side === 'left' ? 'recurse-left' : 'recurse-right',
          variables: { call: `insert(node.${side}, ${value})`, [`node.${side}`]: show(child), depth: depth + 2 },
          message: `call insert(node.${side}, ${value})  — node.${side} = ${show(child)}`,
          explanation: `${nv}'s call waits while a new call handles its ${side} subtree${child ? ` (rooted at ${node(child).value})` : ', which is empty'}.`,
          actionLabel: side === 'left' ? 'Recurse left' : 'Recurse right',
        },
        { index: i, ...(child ? { current: child } : { slot: { parent: here, side } }) }
      );

      const got = insert(i, depth + 1);
      calls.pop();
      // only a base-case call one level down hands back a node that is not in the tree yet
      const created = got.created && got.returns === got.created.id ? got.created : null;
      const linksNew = created !== null && node(here!)[side] === null;
      if (linksNew) link(created!, here, side);
      push(
        {
          type: 'assign',
          codeRef: side === 'left' ? 'attach-left' : 'attach-right',
          variables: { [`node.${side}`]: show(got.returns), tree: shape() },
          message: `node.${side} = ${show(got.returns)}  (returned by the call)`,
          explanation: linksNew
            ? `The returned subtree is the new node: assigning it to node.${side} links ${value} as ${nv}'s ${side} child.`
            : `The call returned ${nv}'s ${side} subtree root, ${node(got.returns).value}, the same node as before: the link is re-assigned unchanged.`,
          actionLabel: linksNew ? `Link ${side}` : `Re-link ${side}`,
        },
        { index: i, current: here, ...(linksNew ? { inserted: created!.id } : {}) }
      );
    }

    calls[depth] = Object.freeze({ ...frame, returns: here! });
    push(
      {
        type: 'return',
        codeRef: 'return-node',
        variables: { returns: show(here), depth: depth + 1 },
        message: `return node (${show(here)})  — ${callText(frame, value)} ends`,
        explanation:
          side === null
            ? `Nothing was inserted below ${nv}: return it so the caller's link stays the same.`
            : depth === 0
              ? `Return the root, ${nv}, to buildBST: the whole tree, now holding ${value}.`
              : `Return ${nv}, the root of this subtree, to the caller, which re-links it.`,
        actionLabel: 'Return',
      },
      { index: i, current: here, ...(side === null ? { duplicate: here! } : {}) }
    );
    return { returns: here!, created: null };
  }

  push(
    {
      type: 'init',
      codeRef: 'init-root',
      variables: { root: 'null', values: `[${values.join(', ')}]` },
      message: `root = null — insert ${n} value${n === 1 ? '' : 's'} in order: [${values.join(', ')}]`,
      explanation:
        n === 0
          ? 'There are no values: the tree stays empty.'
          : 'Each value is inserted by calling insert(root, value). Each call handles one subtree and returns its root, calling itself on the left or right child until it reaches an empty one.',
      actionLabel: 'Start',
    },
    { index: null }
  );

  for (let i = 0; ; i++) {
    const more = i < n;
    push(
      {
        type: 'loop-condition',
        codeRef: 'next-value',
        variables: more ? { i, value: values[i] } : { i },
        result: more ? 'true' : 'false',
        message: more ? `next value: values[${i}] = ${values[i]}` : `no value left: all ${n} value${n === 1 ? '' : 's'} handled`,
        explanation: more ? `Insert ${values[i]}.` : n === 0 ? 'The input is empty.' : 'Every value has been inserted or skipped.',
        actionLabel: more ? `Insert ${values[i]}` : 'Loop ends',
      },
      { index: more ? i : null }
    );
    if (!more) break;

    const value = values[i];
    calls.push(Object.freeze({ node: root, via: 'root' }));
    push(
      {
        type: 'update',
        codeRef: 'call-root',
        variables: { call: `insert(root, ${value})`, root: show(root), depth: 1 },
        message: `call insert(root, ${value})  — root = ${show(root)}`,
        explanation: root ? `The first call works on the whole tree, rooted at ${node(root).value}.` : 'The tree is empty, so the first call is already the base case.',
        actionLabel: 'Call insert',
      },
      { index: i, ...(root ? { current: root } : { slot: { parent: null, side: 'root' } }) }
    );

    const got = insert(i, 0);
    calls.pop();
    const newRoot = root === null && got.created !== null;
    if (newRoot) link(got.created!, null, 'left');
    push(
      {
        type: 'assign',
        codeRef: 'assign-root',
        variables: { root: show(got.returns), tree: shape() },
        message: `root = ${show(got.returns)}  (returned by insert)`,
        explanation: newRoot
          ? `The tree was empty: the returned new node becomes the root.`
          : skipped.at(-1) === i
            ? `${value} was a duplicate: the tree came back unchanged, with the same root.`
            : `The call returned the same root, now with ${value} somewhere below it.`,
        actionLabel: newRoot ? 'Root set' : 'Root kept',
      },
      { index: i, ...(newRoot ? { inserted: got.returns } : {}) }
    );
  }

  const count = nodes.length;
  const sorted = nodes.map(x => x.value).sort((a, b) => a - b);
  const dups = skipped.length;
  const text =
    count === 0
      ? 'Empty tree: no values to insert'
      : `BST of ${count} node${count === 1 ? '' : 's'}; inorder: [${sorted.join(', ')}]${dups ? `; ${dups} duplicate${dups === 1 ? '' : 's'} skipped` : ''}`;
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { root: show(root), tree: shape(), nodes: count },
      message: `return root — ${shape()}`,
      explanation:
        'Each insertion made one call per level it passed, plus the base case: O(h) time and O(h) call-stack space each, so building took O(n log n) on average and O(n²) at worst. The tree itself takes O(n) space.',
      actionLabel: 'Return',
      outcomeText: text,
    },
    { index: null, result: text }
  );

  return steps;
}

export const buildBstRecursiveDefinition: AlgorithmDefinition = {
  id: 'build-bst-recursive',
  name: 'Build a Binary Search Tree (Recursive)',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'insert(node, value) recurses left or right, then returns the subtree root.',
  description:
    'Builds a binary search tree by calling root = insert(root, value) for each value in order. insert returns a new node for an empty subtree (the base case); otherwise it recurses into the left subtree for a smaller value or the right one for a larger value, re-links the child it called on, and returns its own node. An equal value is a duplicate and is skipped. This is an ordinary, unbalanced BST: one insertion takes O(h) time and O(h) call-stack space — O(log n) on a roughly balanced tree, O(n) on a skewed one — so building takes O(n log n) on average and O(n²) at worst (for example, sorted input); the tree takes O(n) space. AVL and Red-Black trees rebalance to guarantee O(log n); this tree does not.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(n)',
    bestFor: 'Learning recursion on trees: O(h) call stack per insertion (O(log n) balanced, O(n) skewed), besides the O(n) tree',
  },
  defaultInput: [50, 30, 70, 20, 40, 60, 80],

  code: {
    c: `#include <stdlib.h>

struct TreeNode {
    int val;
    struct TreeNode* left;
    struct TreeNode* right;
};

struct TreeNode* createNode(int value, int* failed) {
    struct TreeNode* newNode =
        (struct TreeNode*)malloc(sizeof(struct TreeNode));

    if (newNode == NULL) {
        *failed = 1;  // reported; the caller's empty child stays NULL
        return NULL;
    }

    newNode->val = value;
    newNode->left = NULL;
    newNode->right = NULL;

    return newNode;
}

struct TreeNode* insert(struct TreeNode* node, int value, int* failed) {

    // Base case
    if (node == NULL) {
        return createNode(value, failed);
    }

    // Insert into the left subtree
    if (value < node->val) {
        node->left = insert(node->left, value, failed);
    }

    // Insert into the right subtree
    else if (value > node->val) {
        node->right = insert(node->right, value, failed);
    }

    // Duplicate values are skipped
    return node;
}

// sets *failed to 1 if a node cannot be allocated, and returns the tree built before that
struct TreeNode* buildBST(int values[], int n, int* failed) {
    struct TreeNode* root = NULL;
    *failed = 0;

    for (int i = 0; i < n; i++) {
        root = insert(root, values[i], failed);
        if (*failed) {
            break;
        }
    }

    return root;
}`,
    cpp: `struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;

    TreeNode(int val) {
        this->val = val;
        left = nullptr;
        right = nullptr;
    }
};

class BuildBSTRecursive {
public:
    TreeNode* insert(TreeNode* node, int value) {

        // Base case
        if (node == nullptr) {
            return new TreeNode(value);
        }

        // Insert into the left subtree
        if (value < node->val) {
            node->left = insert(node->left, value);
        }

        // Insert into the right subtree
        else if (value > node->val) {
            node->right = insert(node->right, value);
        }

        // Duplicate values are skipped
        return node;
    }

    TreeNode* buildBST(int values[], int n) {
        TreeNode* root = nullptr;

        for (int i = 0; i < n; i++) {
            root = insert(root, values[i]);
        }

        return root;
    }
};`,
    java: `class TreeNode {
    int val;
    TreeNode left, right;

    TreeNode(int val) {
        this.val = val;
    }
}

public class BuildBSTRecursive {

    static TreeNode insert(TreeNode node, int value) {

        // Base case
        if (node == null) {
            return new TreeNode(value);
        }

        // Insert into the left subtree
        if (value < node.val) {
            node.left = insert(node.left, value);
        }

        // Insert into the right subtree
        else if (value > node.val) {
            node.right = insert(node.right, value);
        }

        // Duplicate values are skipped
        return node;
    }

    public static TreeNode buildBST(int[] values) {
        TreeNode root = null;

        for (int value : values) {
            root = insert(root, value);
        }

        return root;
    }
}`,
    python: `${PY_TREE_NODE}
# inserts value into the subtree and returns the subtree's root; a value already there is skipped
def insert(node, value):
    if node is None:
        return TreeNode(value)
    if value < node.val:
        node.left = insert(node.left, value)
    elif value > node.val:
        node.right = insert(node.right, value)
    return node

def build_bst(values):
    root = None
    for value in values:
        root = insert(root, value)
    return root`,
  },

  // A recursive call and the assignment of what it returns are one statement: the call step and the link step after
  // the return share its line. Every listing gives each test and what it leads to a line of its own.
  lineMap: {
    c: {
      'check-null': 28, 'base-create': 29, 'check-less': 33, 'recurse-left': 34, 'attach-left': 34, 'check-greater': 38, 'recurse-right': 39,
      'attach-right': 39, 'return-node': 43, 'init-root': 48, 'next-value': 51, 'call-root': 52, 'assign-root': 52, return: 58,
    },
    cpp: {
      'check-null': 18, 'base-create': 19, 'check-less': 23, 'recurse-left': 24, 'attach-left': 24, 'check-greater': 28, 'recurse-right': 29,
      'attach-right': 29, 'return-node': 33, 'init-root': 37, 'next-value': 39, 'call-root': 40, 'assign-root': 40, return: 43,
    },
    java: {
      'check-null': 15, 'base-create': 16, 'check-less': 20, 'recurse-left': 21, 'attach-left': 21, 'check-greater': 25, 'recurse-right': 26,
      'attach-right': 26, 'return-node': 30, 'init-root': 34, 'next-value': 36, 'call-root': 37, 'assign-root': 37, return: 40,
    },
    python: {
      'check-null': 9, 'base-create': 10, 'check-less': 11, 'recurse-left': 12, 'attach-left': 12, 'check-greater': 13, 'recurse-right': 14,
      'attach-right': 14, 'return-node': 15, 'init-root': 18, 'next-value': 19, 'call-root': 20, 'assign-root': 20, return: 21,
    },
  },

  // C's setup is root = NULL and resetting the allocation-failure flag
  lineSpans: { c: { 'init-root': 2 } },

  generateSteps: generateBuildBstRecursiveSteps,
};
