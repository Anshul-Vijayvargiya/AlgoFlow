import type { AlgorithmDefinition, ExecutionStep, TreeBuildView, TreeNodeView } from '../../../types/algorithm';
import { levelOrderText } from '../../tree/binaryTree';
import { PY_TREE_NODE } from './treeTrace';

/**
 * Build a Binary Search Tree: insert the values one by one, in input order. Each value starts at the root and moves
 * left (smaller) or right (larger) until it reaches an empty child, where it becomes a new leaf. Duplicate policy: a
 * value already in the tree is skipped (the search stops at the equal node), so every value appears once.
 *
 * An ordinary, unbalanced BST: an insertion follows one root-to-leaf path, O(h) — O(log n) when the tree stays roughly
 * balanced, O(n) when it degenerates into a chain (sorted input). Building from n values: O(n log n) on average,
 * O(n²) at worst; the tree takes O(n) space. (AVL and Red-Black trees rebalance to guarantee O(log n); this does not.)
 *
 * The trace grows the tree: each step holds the nodes inserted so far. A node id is the input position of its value
 * (n0 is the first value, the root). A new nodes array is made only when a node is inserted, and only the parent that
 * gains a child is replaced, so the steps share every node object that did not change and no step is ever altered
 * by a later one.
 */
function generateBuildBstSteps(input: number[]): ExecutionStep[] {
  if (input.some(v => !Number.isInteger(v))) throw new TypeError('Build a Binary Search Tree: every value must be a whole number.');
  const values: readonly number[] = Object.freeze([...input]);
  const n = values.length;
  const steps: ExecutionStep[] = [];
  const NO_VISITS: readonly string[] = Object.freeze([]);

  let nodes: readonly TreeNodeView[] = Object.freeze([]);
  let root: string | null = null;
  const byId = new Map<string, TreeNodeView>();
  let skipped: readonly number[] = Object.freeze([]);

  const node = (id: string) => byId.get(id)!;
  const show = (id: string | null) => (id === null ? 'null' : `node ${node(id).value}`);
  /** the tree written in level order, as the steps' variables show it */
  const shape = () => levelOrderText({ nodes, root });

  /** links a new leaf for values[i] into the empty child slot; the parent is replaced, every other node is kept */
  const link = (i: number, parent: string | null, side: 'left' | 'right') => {
    const leaf: TreeNodeView = Object.freeze({ id: `n${i}`, value: values[i], left: null, right: null });
    byId.set(leaf.id, leaf);
    if (parent === null) {
      root = leaf.id;
      nodes = Object.freeze([leaf]);
    } else {
      const updated: TreeNodeView = Object.freeze({ ...node(parent), [side]: leaf.id });
      byId.set(parent, updated);
      nodes = Object.freeze([...nodes.map(x => (x.id === parent ? updated : x)), leaf]);
    }
    return leaf.id;
  };

  interface Focus {
    index: number | null;
    path?: readonly string[];
    current?: string | null;
    parent?: string | null;
    curr?: string | null;
    slot?: TreeBuildView['slot'];
    inserted?: string;
    duplicate?: string;
    result?: string;
  }
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, f: Focus) => {
    const pointers =
      f.parent !== undefined || f.curr !== undefined
        ? [
            ...(f.parent !== undefined ? [{ name: 'parent', node: f.parent }] : []),
            ...(f.curr !== undefined ? [{ name: 'curr', node: f.curr }] : []),
          ]
        : [];
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
          path: Object.freeze([...(f.path ?? [])]),
          skipped,
          ...(f.slot ? { slot: f.slot } : {}),
          ...(f.inserted ? { inserted: f.inserted } : {}),
          ...(f.duplicate ? { duplicate: f.duplicate } : {}),
        },
      },
    });
  };

  push(
    {
      type: 'init',
      codeRef: 'init-root',
      variables: { root: 'null', values: `[${values.join(', ')}]` },
      message: `root = null — insert ${n} value${n === 1 ? '' : 's'} in order: [${values.join(', ')}]`,
      explanation:
        n === 0
          ? 'There are no values: the tree stays empty.'
          : 'Each value walks down from the root — left when it is smaller than a node, right when it is larger — and becomes a new leaf where it finds an empty child. A value already in the tree is skipped.',
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
    /** the empty child the search ends in, below parent (or the empty tree's root) */
    const slotFor = (p: string | null): TreeBuildView['slot'] => (p === null ? { parent: null, side: 'root' } : { parent: p, side: value < node(p).value ? 'left' : 'right' });
    const path: string[] = [];
    let parent: string | null = null;
    let curr: string | null = root;
    push(
      {
        type: 'assign',
        codeRef: 'init-search',
        variables: { value, parent: 'null', curr: show(curr) },
        message: `parent = null, curr = root (${show(curr)})`,
        explanation: root ? `The search for ${value}'s place starts at the root, ${node(root).value}.` : `The tree is empty, so ${value} will become the root.`,
        actionLabel: 'Start search',
      },
      { index: i, parent, curr }
    );

    for (;;) {
      if (curr !== null) path.push(curr);
      const go = curr !== null && node(curr).value !== value;
      push(
        {
          type: 'loop-condition',
          codeRef: 'search-loop',
          variables: { value, curr: show(curr), ...(curr ? { 'curr.val': node(curr).value } : {}) },
          result: go ? 'true' : 'false',
          message:
            curr === null
              ? 'curr != null and curr.val != value?  curr = null → false'
              : `curr != null and curr.val != value?  ${node(curr).value} != ${value} → ${go}`,
          explanation:
            curr === null
              ? `curr is null: the empty child where ${value} belongs has been found.`
              : go
                ? `Compare ${value} with ${node(curr).value} to choose a side.`
                : `${value} is already in the tree: the search stops at the equal node.`,
          actionLabel: go ? 'Compare' : curr === null ? 'Empty spot' : 'Equal value',
        },
        { index: i, path, current: curr, parent, curr, ...(curr === null ? { slot: slotFor(parent) } : {}) }
      );
      if (!go) break;

      parent = curr;
      push(
        {
          type: 'assign',
          codeRef: 'set-parent',
          variables: { parent: show(parent) },
          message: `parent = curr (${show(parent)})`,
          explanation: `Remember ${node(parent!).value}: if the next child is empty, the new node hangs below it.`,
          actionLabel: 'parent = curr',
        },
        { index: i, path, current: curr!, parent, curr }
      );

      const cv: number = node(curr!).value;
      const smaller: boolean = value < cv;
      push(
        {
          type: 'condition',
          codeRef: 'compare',
          variables: { value, 'curr.val': cv },
          comparedValues: { val1: value, val2: cv },
          result: smaller ? 'true' : 'false',
          message: `value < curr.val?  ${value} < ${cv} → ${smaller ? 'true — go left' : 'false — go right'}`,
          explanation: smaller
            ? `${value} is smaller than ${cv}, so it belongs in ${cv}'s left subtree.`
            : `${value} is larger than ${cv}, so it belongs in ${cv}'s right subtree.`,
          actionLabel: smaller ? 'Smaller' : 'Larger',
        },
        { index: i, path, current: curr!, parent, curr }
      );

      curr = smaller ? node(curr!).left : node(curr!).right;
      push(
        {
          type: 'assign',
          codeRef: smaller ? 'go-left' : 'go-right',
          variables: { curr: show(curr) },
          message: `curr = curr.${smaller ? 'left' : 'right'} → ${show(curr)}`,
          explanation: curr ? `Continue the search at ${node(curr).value}.` : `${cv} has no ${smaller ? 'left' : 'right'} child: ${value} goes there.`,
          actionLabel: smaller ? 'Go left' : 'Go right',
        },
        { index: i, path, ...(curr ? { current: curr } : {}), parent, curr, ...(curr ? {} : { slot: slotFor(parent) }) }
      );
    }

    const duplicate = curr !== null;
    const slot = duplicate ? undefined : slotFor(parent);
    push(
      {
        type: 'condition',
        codeRef: 'check-dup',
        variables: { curr: show(curr) },
        result: duplicate ? 'true' : 'false',
        message: `curr != null?  curr = ${show(curr)} → ${duplicate}`,
        explanation: duplicate
          ? `The search stopped at a node holding ${value}: it is a duplicate.`
          : `The search ended at an empty child: ${value} is new.`,
        actionLabel: duplicate ? 'Duplicate' : 'New value',
      },
      { index: i, path, ...(duplicate ? { current: curr!, duplicate: curr! } : { slot }), parent, curr }
    );

    if (duplicate) {
      skipped = Object.freeze([...skipped, i]);
      push(
        {
          type: 'increment',
          codeRef: 'skip-dup',
          variables: { value },
          message: `continue — ${value} is already in the tree`,
          explanation: 'Duplicate policy: a value already in the BST is skipped, so the tree holds each value once and stays the same.',
          actionLabel: 'Skip duplicate',
        },
        { index: i, path, current: curr!, duplicate: curr!, parent, curr }
      );
      continue;
    }

    const isRoot = parent === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-root',
        variables: { parent: show(parent) },
        result: isRoot ? 'true' : 'false',
        message: `parent == null?  parent = ${show(parent)} → ${isRoot}`,
        explanation: isRoot ? `No node was passed: the tree is empty, so ${value} becomes the root.` : `${value} becomes a child of ${node(parent!).value}.`,
        actionLabel: isRoot ? 'Empty tree' : 'Has parent',
      },
      { index: i, path, slot, parent, curr }
    );

    if (isRoot) {
      const id = link(i, null, 'left');
      push(
        {
          type: 'assign',
          codeRef: 'insert-root',
          variables: { root: show(id), tree: shape() },
          message: `root = new node(${value})`,
          explanation: `${value} is the root of the tree.`,
          actionLabel: 'Insert root',
        },
        { index: i, path, current: id, inserted: id, parent, curr }
      );
      continue;
    }

    const pv = node(parent!).value;
    const left = value < pv;
    push(
      {
        type: 'condition',
        codeRef: 'check-side',
        variables: { value, 'parent.val': pv },
        comparedValues: { val1: value, val2: pv },
        result: left ? 'true' : 'false',
        message: `value < parent.val?  ${value} < ${pv} → ${left ? 'true — left child' : 'false — right child'}`,
        explanation: `${value} is ${left ? 'smaller' : 'larger'} than ${pv}, so it becomes ${pv}'s ${left ? 'left' : 'right'} child.`,
        actionLabel: left ? 'Left child' : 'Right child',
      },
      { index: i, path, slot, parent, curr }
    );

    const id = link(i, parent, left ? 'left' : 'right');
    push(
      {
        type: 'assign',
        codeRef: left ? 'insert-left' : 'insert-right',
        variables: { [`parent.${left ? 'left' : 'right'}`]: show(id), tree: shape() },
        message: `parent.${left ? 'left' : 'right'} = new node(${value})`,
        explanation: `${value} is linked in as ${pv}'s ${left ? 'left' : 'right'} child, after ${path.length} comparison${path.length === 1 ? '' : 's'}.`,
        actionLabel: left ? 'Insert left' : 'Insert right',
      },
      { index: i, path, current: id, inserted: id, parent, curr }
    );
  }

  const count = nodes.length;
  const sorted = [...nodes].map(x => x.value).sort((a, b) => a - b);
  const dups = skipped.length;
  const text =
    count === 0
      ? 'Empty tree: no values to insert'
      : `BST of ${count} node${count === 1 ? '' : 's'}; inorder: [${sorted.join(', ')}]${dups ? `; ${dups} duplicate${dups === 1 ? '' : 's'} skipped` : ''}`;
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { root: root ? show(root) : 'null', tree: shape(), nodes: count },
      message: `return root — ${shape()}`,
      explanation:
        'Every value was inserted by one walk from the root, so building took O(n log n) on average and O(n²) at worst (sorted input makes a chain). The tree stores each distinct value once: O(n) space.',
      actionLabel: 'Return',
      outcomeText: text,
    },
    { index: null, result: text }
  );

  return steps;
}

export const buildBstDefinition: AlgorithmDefinition = {
  id: 'build-bst',
  name: 'Build a Binary Search Tree',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Insert values in order: smaller goes left, larger goes right.',
  description:
    'Builds a binary search tree by inserting the values in their given order. Each value walks down from the root, going left when it is smaller than a node and right when it is larger, and becomes a new leaf at the first empty child. A value already in the tree is skipped. This is an ordinary, unbalanced BST: each insertion takes O(h) — O(log n) on a roughly balanced tree, O(n) on a skewed one — so building takes O(n log n) on average and O(n²) at worst (for example, sorted input). AVL and Red-Black trees rebalance to guarantee O(log n); this tree does not.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(n)',
    bestFor: 'Ordered storage with fast average search and insertion (O(log n) per value when balanced, O(n) when skewed)',
  },
  defaultInput: [50, 30, 70, 20, 40, 60, 80],

  code: {
    c: `#include <stdlib.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

static struct TreeNode *newNode(int val) {
    struct TreeNode *node = malloc(sizeof(struct TreeNode));
    node->val = val;
    node->left = node->right = NULL;
    return node;
}

/* inserts the values in order; a value already in the tree is skipped */
struct TreeNode *buildBST(const int values[], int n) {
    struct TreeNode *root = NULL;
    for (int i = 0; i < n; i++) {
        int value = values[i];
        struct TreeNode *parent = NULL, *curr = root;
        while (curr != NULL && curr->val != value) {
            parent = curr;
            curr = value < curr->val ? curr->left : curr->right;
        }
        if (curr != NULL) continue;
        if (parent == NULL) root = newNode(value);
        else if (value < parent->val) parent->left = newNode(value);
        else parent->right = newNode(value);
    }
    return root;
}`,
    cpp: `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode(int v) : val(v), left(nullptr), right(nullptr) {}
};

// inserts the values in order; a value already in the tree is skipped
TreeNode* buildBST(const vector<int>& values) {
    TreeNode* root = nullptr;
    for (int value : values) {
        TreeNode *parent = nullptr, *curr = root;
        while (curr != nullptr && curr->val != value) {
            parent = curr;
            curr = value < curr->val ? curr->left : curr->right;
        }
        if (curr != nullptr) continue;
        if (parent == nullptr) root = new TreeNode(value);
        else if (value < parent->val) parent->left = new TreeNode(value);
        else parent->right = new TreeNode(value);
    }
    return root;
}`,
    java: `class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class BuildBST {
    // inserts the values in order; a value already in the tree is skipped
    public static TreeNode buildBST(int[] values) {
        TreeNode root = null;
        for (int value : values) {
            TreeNode parent = null, curr = root;
            while (curr != null && curr.val != value) {
                parent = curr;
                curr = value < curr.val ? curr.left : curr.right;
            }
            if (curr != null) continue;
            if (parent == null) root = new TreeNode(value);
            else if (value < parent.val) parent.left = new TreeNode(value);
            else parent.right = new TreeNode(value);
        }
        return root;
    }
}`,
    python: `${PY_TREE_NODE}
# inserts the values in order; a value already in the tree is skipped
def build_bst(values):
    root = None
    for value in values:
        parent, curr = None, root
        while curr and curr.val != value:
            parent = curr
            curr = curr.left if value < curr.val else curr.right
        if curr:
            continue
        if parent is None:
            root = TreeNode(value)
        elif value < parent.val:
            parent.left = TreeNode(value)
        else:
            parent.right = TreeNode(value)
    return root`,
  },

  // The search's test, step and side choice are one line each; in the C family the duplicate's continue and each insertion
  // sit on their condition's line. C reads the next value in two statements (the loop header and values[i]).
  lineMap: {
    c: {
      'init-root': 18, 'next-value': 19, 'init-search': 21, 'search-loop': 22, 'set-parent': 23, compare: 24, 'go-left': 24, 'go-right': 24,
      'check-dup': 26, 'skip-dup': 26, 'check-root': 27, 'insert-root': 27, 'check-side': 28, 'insert-left': 28, 'insert-right': 29, return: 31,
    },
    cpp: {
      'init-root': 10, 'next-value': 11, 'init-search': 12, 'search-loop': 13, 'set-parent': 14, compare: 15, 'go-left': 15, 'go-right': 15,
      'check-dup': 17, 'skip-dup': 17, 'check-root': 18, 'insert-root': 18, 'check-side': 19, 'insert-left': 19, 'insert-right': 20, return: 22,
    },
    java: {
      'init-root': 10, 'next-value': 11, 'init-search': 12, 'search-loop': 13, 'set-parent': 14, compare: 15, 'go-left': 15, 'go-right': 15,
      'check-dup': 17, 'skip-dup': 17, 'check-root': 18, 'insert-root': 18, 'check-side': 19, 'insert-left': 19, 'insert-right': 20, return: 22,
    },
    python: {
      'init-root': 9, 'next-value': 10, 'init-search': 11, 'search-loop': 12, 'set-parent': 13, compare: 14, 'go-left': 14, 'go-right': 14,
      'check-dup': 15, 'skip-dup': 16, 'check-root': 17, 'insert-root': 18, 'check-side': 19, 'insert-left': 20, 'insert-right': 22, return: 23,
    },
  },
  lineSpans: { c: { 'next-value': 2 } },

  generateSteps: generateBuildBstSteps,
};
