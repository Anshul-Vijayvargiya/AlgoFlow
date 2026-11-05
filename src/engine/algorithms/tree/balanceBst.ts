import type {
  AlgorithmDefinition,
  AlgorithmInputSpec,
  ExecutionStep,
  TextField,
  TreeBalanceBuildCall,
  TreeBalanceInorderCall,
  TreeNodeView,
  TreeView,
} from '../../../types/algorithm';
import { MAX_TREE_LEVELS, MAX_TREE_NODES, levelOrderText, nodeMap, treeFromLevelOrder } from '../../tree/binaryTree';
import { textInputs } from '../strings/textInput';
import { PY_TREE_NODE } from './treeTrace';

/**
 * Convert BST to Balanced BST, in three stages:
 *
 *   1. inorder(root): the recursive inorder walk appends every value to an array, which comes out sorted because the
 *      input is a BST;
 *   2. buildBalanced(values, left, right): the middle value (mid = left + (right - left) / 2, which cannot overflow)
 *      becomes a new node, whose left subtree is built from values[left..mid-1] and right subtree from
 *      values[mid+1..right]; an empty range (left > right) is null;
 *   3. the new tree's root is returned. The input tree is left as it is.
 *
 * Each half differs in size by at most one, so the new tree is height-balanced (its height is ⌊log₂ n⌋ + 1). O(n)
 * time for each stage; O(n) extra space for the array, O(h) stack for the walk and O(log n) for the build.
 *
 * Duplicates: the input must be a BST under the repository's rule (no value repeats), so the array holds n distinct
 * values and the new tree holds exactly those.
 *
 * The trace is made by running both recursions. Stage 1 steps show the input tree; stage 2 and 3 steps show the new
 * tree as it is built: a node appears when it is created, and is linked to its parent when its call returns.
 */

/** the tree, which must be a binary search tree (no value repeats) */
const BST_FIELD: TextField = {
  label: 'root',
  hint: `A binary search tree in level order: whole numbers from -999 to 999, null for a missing child; every left subtree smaller and every right subtree larger than its node, no value repeated, e.g. [1, null, 2, null, 3, null, 4, null, 5]; [] is the empty tree. At most ${MAX_TREE_NODES} nodes and ${MAX_TREE_LEVELS} levels`,
  defaultValue: '[1, null, 2, null, 3, null, 4, null, 5]',
  minLength: 1,
  maxLength: 160,
  chars: { pattern: '[\\s\\S]', description: 'any characters' },
  rule: 'level-order-bst',
};

export const BALANCE_BST_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [BST_FIELD],
  textExamples: [
    ['[1, null, 2, null, 3, null, 4, null, 5]'],
    ['[5, 4, null, 3, null, 2, null, 1]'],
    ['[4, 2, 6, 1, 3, 5, 7]'],
    ['[10, 5, null, 2, 7, null, null, 6, 8]'],
    ['[1, null, 2, null, 3, null, 4]'],
    ['[-5, -10, null, -20, null, -30]'],
    ['[0, -999, 999]'],
    ['[1, null, 2]'],
    ['[7]'],
  ],
};

const id = (k: number) => `b${k}`;

function generateBalanceBstSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [treeText] = textInputs(BALANCE_BST_INPUT_SPEC, params, 'Convert BST to Balanced BST');
  const input = treeFromLevelOrder(treeText);
  const byId = nodeMap(input);
  const original = levelOrderText(input);
  const steps: ExecutionStep[] = [];

  // stage 1
  const values: number[] = [];
  const visited: string[] = [];
  const inorderCalls: TreeBalanceInorderCall[] = [];
  // stages 2 and 3: the new tree, as frozen snapshots (a new array whenever a node is created or linked)
  type Mutable = { -readonly [K in keyof TreeBalanceBuildCall]: TreeBalanceBuildCall[K] };
  const buildCalls: Mutable[] = [];
  const links = new Map<string, { value: number; left: string | null; right: string | null }>();
  const created: string[] = [];
  const completed: string[] = [];
  const depths: Record<string, number> = {};
  let built: readonly TreeNodeView[] = Object.freeze([]);
  let newRoot: string | null = null;
  const snapshot = () => {
    built = Object.freeze(created.map(k => Object.freeze({ id: k, ...links.get(k)! })));
  };
  let stage: 'inorder' | 'build' | 'done' = 'inorder';

  const show = (nodeId: string | null) => (nodeId === null ? 'null' : `node ${byId.get(nodeId)!.value}`);
  const showNew = (nodeId: string | null) => (nodeId === null ? 'null' : `node ${links.get(nodeId)!.value}`);
  const arr = (xs: readonly number[]) => `[${xs.join(', ')}]`;
  const range = (l: number, r: number) => (l > r ? 'empty' : arr(values.slice(l, r + 1)));

  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, current: string | null, result?: string) => {
    const onInput = stage === 'inorder';
    const top = onInput ? inorderCalls.at(-1) : buildCalls.at(-1);
    const pointer = onInput ? (top ? [{ name: 'node', node: (top as TreeBalanceInorderCall).node }] : []) : top && (top as Mutable).node ? [{ name: 'node', node: (top as Mutable).node! }] : [];
    const tree: TreeView = {
      nodes: onInput ? input.nodes : built,
      root: onInput ? input.root : newRoot,
      ...(current ? { current } : {}),
      visited: onInput ? [...visited] : [],
      pointers: pointer,
      balance: {
        stage,
        original,
        values: [...values],
        inorderCalls: inorderCalls.map(f => ({ ...f })),
        buildCalls: buildCalls.map(f => ({ ...f })),
        created: [...created],
        completed: [...completed],
        depths: { ...depths },
      },
      ...(result ? { result: { kind: 'answer' as const, text: result } } : {}),
    };
    steps.push({ id: steps.length, state: [], ...s, tree });
  };

  // ── stage 1: inorder(node, values) ──────────────────────────────────────────────────────────────────────────────
  function inorder(depth: number): void {
    const frame = inorderCalls[depth];
    const here = frame.node;
    const empty = here === null;
    push(
      {
        type: 'condition',
        codeRef: 'in-check-null',
        variables: { node: show(here), values: arr(values), depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `inorder: node == null?  node = ${show(here)} → ${empty}`,
        explanation: empty
          ? depth === 0
            ? 'The tree is empty: there is no value to collect.'
            : 'An empty subtree: nothing to collect here.'
          : `At ${byId.get(here!)!.value}: first everything in its left subtree (all smaller), then ${byId.get(here!)!.value} itself, then its right subtree (all larger).`,
        actionLabel: empty ? 'Empty subtree' : `At ${byId.get(here!)!.value}`,
      },
      here
    );
    if (empty) {
      push(
        {
          type: 'return',
          codeRef: 'in-return-null',
          variables: { values: arr(values), depth: depth + 1 },
          message: 'return: an empty subtree adds nothing',
          explanation: depth === 0 ? 'Back to the caller with an empty array.' : 'Back to the caller.',
          actionLabel: 'Return',
        },
        null
      );
      return;
    }
    const n = byId.get(here!)!;
    inorderCalls.push({ node: n.left, via: 'left' });
    push(
      {
        type: 'update',
        codeRef: 'in-recurse-left',
        variables: { call: 'inorder(node.left)', 'node.left': show(n.left), depth: depth + 2 },
        message: `inorder(node.left), where node.left = ${show(n.left)}`,
        explanation: `Go left first: every value in ${n.value}'s left subtree is smaller than ${n.value}, so it goes into the array before ${n.value}.${n.left ? '' : ' (The left subtree is empty.)'}`,
        actionLabel: 'Go left',
      },
      n.left
    );
    inorder(depth + 1);
    inorderCalls.pop();

    values.push(n.value);
    visited.push(n.id);
    push(
      {
        type: 'assign',
        codeRef: 'in-append',
        variables: { 'node.val': n.value, values: arr(values) },
        message: `values.append(${n.value}) → ${arr(values)}`,
        explanation: `${n.value}'s left subtree is done, so ${n.value} is the next value in sorted order: append it. The array stays sorted because the input is a BST.`,
        actionLabel: `Append ${n.value}`,
      },
      here
    );

    inorderCalls.push({ node: n.right, via: 'right' });
    push(
      {
        type: 'update',
        codeRef: 'in-recurse-right',
        variables: { call: 'inorder(node.right)', 'node.right': show(n.right), depth: depth + 2 },
        message: `inorder(node.right), where node.right = ${show(n.right)}`,
        explanation: `Then go right: every value in ${n.value}'s right subtree is larger than ${n.value}, so it comes after ${n.value}.${n.right ? '' : ' (The right subtree is empty.)'}`,
        actionLabel: 'Go right',
      },
      n.right
    );
    inorder(depth + 1);
    inorderCalls.pop();
  }

  // ── stage 2: buildBalanced(values, left, right) ─────────────────────────────────────────────────────────────────
  function build(depth: number): string | null {
    const frame = buildCalls[depth];
    const { left, right } = frame;
    const empty = left > right;
    push(
      {
        type: 'condition',
        codeRef: 'b-check-range',
        variables: { left, right, range: range(left, right), depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `buildBalanced(values, ${left}, ${right}): left > right?  ${left} > ${right} → ${empty}`,
        explanation: empty
          ? depth === 0
            ? 'The array is empty, so the balanced tree is empty.'
            : `The range values[${left}..${right}] is empty: this subtree is null.`
          : `Build the subtree for values[${left}..${right}] = ${range(left, right)}.`,
        actionLabel: empty ? 'Empty range' : `Range ${left}..${right}`,
      },
      null
    );
    if (empty) {
      frame.returns = null;
      push(
        {
          type: 'return',
          codeRef: 'b-return-null',
          variables: { returns: 'null', depth: depth + 1 },
          message: 'return null',
          explanation: depth === 0 ? 'Nothing to build.' : 'Back to the caller with null: an empty child.',
          actionLabel: 'Return null',
        },
        null
      );
      return null;
    }

    const mid = left + Math.floor((right - left) / 2);
    frame.mid = mid;
    push(
      {
        type: 'assign',
        codeRef: 'b-mid',
        variables: { left, right, mid, 'values[mid]': values[mid] },
        message: `mid = left + (right - left) / 2 = ${left} + (${right} - ${left}) / 2 = ${mid}`,
        explanation: `The middle of values[${left}..${right}] is index ${mid}, value ${values[mid]}: ${mid - left} value${mid - left === 1 ? '' : 's'} to its left and ${right - mid} to its right, so the two halves differ in size by at most one. left + (right - left) / 2 cannot overflow, unlike (left + right) / 2.`,
        actionLabel: `mid = ${mid}`,
      },
      null
    );

    const k = id(mid);
    links.set(k, { value: values[mid], left: null, right: null });
    created.push(k);
    depths[k] = depth;
    if (depth === 0) newRoot = k;
    frame.node = k;
    snapshot();
    push(
      {
        type: 'assign',
        codeRef: 'b-create',
        variables: { mid, 'values[mid]': values[mid], node: `new node ${values[mid]}` },
        message: `node = new TreeNode(values[${mid}]) = new node ${values[mid]}`,
        explanation:
          depth === 0
            ? `${values[mid]} becomes the root of the balanced tree: half of the values are smaller, half are larger.`
            : `A new node ${values[mid]}, the root of this subtree. It is linked to its parent when this call returns.`,
        actionLabel: `Create ${values[mid]}`,
      },
      k
    );

    for (const side of ['left', 'right'] as const) {
      const [l, r] = side === 'left' ? [left, mid - 1] : [mid + 1, right];
      buildCalls.push({ left: l, right: r, via: side });
      push(
        {
          type: 'update',
          codeRef: side === 'left' ? 'b-recurse-left' : 'b-recurse-right',
          variables: { call: `buildBalanced(values, ${l}, ${r})`, range: range(l, r), depth: depth + 2 },
          message: `node.${side} = buildBalanced(values, ${l}, ${r}), where values[${l}..${r}] = ${range(l, r)}`,
          explanation:
            side === 'left'
              ? `${values[mid]}'s left subtree is built from the values before index ${mid}, all smaller than ${values[mid]}. ${values[mid]}'s call waits.`
              : `${values[mid]}'s right subtree is built from the values after index ${mid}, all larger than ${values[mid]}.`,
          actionLabel: side === 'left' ? 'Build left half' : 'Build right half',
        },
        null
      );
      const child = build(depth + 1);
      buildCalls.pop();
      links.get(k)![side] = child;
      snapshot();
      push(
        {
          type: 'update',
          codeRef: side === 'left' ? 'b-link-left' : 'b-link-right',
          variables: { [`node.${side}`]: showNew(child) },
          message: `node.${side} = ${showNew(child)}`,
          explanation: child
            ? `The call returns ${showNew(child)}, the root of the ${side} half: it becomes ${values[mid]}'s ${side} child.`
            : `The ${side} half is empty: ${values[mid]}'s ${side} child is null.`,
          actionLabel: `Link ${side}`,
        },
        k
      );
    }

    frame.returns = k;
    completed.push(k);
    push(
      {
        type: 'return',
        codeRef: 'b-return-node',
        variables: { returns: showNew(k), depth: depth + 1 },
        message: `return node: the subtree rooted at ${values[mid]} is built`,
        explanation: `${values[mid]}'s subtree holds values[${left}..${right}] = ${range(left, right)}, with the middle at the root of each part: it is a balanced BST.`,
        actionLabel: `Return ${values[mid]}`,
      },
      k
    );
    return k;
  }

  // the wrapper: stage 1, stage 2, stage 3
  inorderCalls.push({ node: input.root, via: 'root' });
  push(
    {
      type: 'init',
      codeRef: 'call-inorder',
      variables: { root: original, values: '[]' },
      message: `Stage 1: inorder(root, values), where root = ${original}`,
      explanation:
        'Stage 1 of 3: an inorder walk (left subtree, node, right subtree) visits a BST\'s values in increasing order. They are collected into an array, which comes out sorted.',
      actionLabel: 'Stage 1: inorder',
    },
    input.root
  );
  inorder(0);
  inorderCalls.pop();

  stage = 'build';
  buildCalls.push({ left: 0, right: values.length - 1, via: 'root' });
  push(
    {
      type: 'update',
      codeRef: 'call-build',
      variables: { values: arr(values), left: 0, right: values.length - 1 },
      message: `Stage 2: buildBalanced(values, 0, ${values.length - 1}), where values = ${arr(values)}`,
      explanation: `Stage 2 of 3: the sorted array ${arr(values)} holds every value of the input. A new tree is built from it: the middle value of each range becomes the root of that range's subtree, so both sides get the same number of values (or one more on the right). The input tree is not changed.`,
      actionLabel: 'Stage 2: build',
    },
    null
  );
  build(0);
  buildCalls.pop();

  stage = 'done';
  const total = values.length;
  const result = levelOrderText({ nodes: built, root: newRoot });
  const text = total === 0 ? 'Balanced BST: [] (the empty tree)' : `Balanced BST: ${result}, height ${Math.floor(Math.log2(total)) + 1} (input height ${heightOf(input.nodes, input.root)})`;
  push(
    {
      type: 'complete',
      codeRef: 'done',
      variables: { original, balanced: result, values: arr(values), nodes: total },
      message: `Stage 3: return the balanced tree ${result}`,
      explanation:
        total === 0
          ? 'Stage 3 of 3: the empty tree is returned. O(n) time, O(n) space for the array.'
          : `Stage 3 of 3: the new tree holds the same ${total} value${total === 1 ? '' : 's'}, still in BST order, and at every node the two subtree heights differ by at most one. Inorder walk O(n) and build O(n): O(n) time in all. O(n) extra space for the array and the new nodes, plus O(h) stack for the walk and O(log n) for the build. The input tree is left unchanged.`,
      actionLabel: 'Balanced',
      outcomeText: text,
    },
    null,
    text
  );
  return steps;
}

/** the number of levels of a tree */
function heightOf(nodes: readonly TreeNodeView[], root: string | null): number {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const h = (k: string | null): number => (k === null ? 0 : 1 + Math.max(h(byId.get(k)!.left), h(byId.get(k)!.right)));
  return h(root);
}

export const bstBalanceDefinition: AlgorithmDefinition = {
  id: 'bst-balance',
  name: 'Convert BST to Balanced BST',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Inorder walk into a sorted array, then build a balanced BST from the middles (divide and conquer).',
  description:
    'Turns any binary search tree, however lopsided, into a height-balanced one with the same values. Stage 1: an inorder traversal collects the values into an array, which is sorted because the input is a BST. Stage 2: divide and conquer: the middle value, at mid = left + (right - left) / 2, becomes a new node, its left subtree is built from the values before mid and its right subtree from the values after it. Stage 3: the new root is returned. Each half differs in size by at most one, so the subtree heights at every node differ by at most one. A new tree is created: the input tree is not changed, and every value appears exactly once. O(n) for the traversal and O(n) for the build: O(n) time. O(n) extra space for the sorted array, with O(h) recursion for the traversal and O(log n) for the balanced build.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    bestFor: 'Inorder traversal O(n) + balanced construction O(n); O(n) array, O(h) walk stack, O(log n) build stack',
  },
  defaultInput: [],
  inputSpec: BALANCE_BST_INPUT_SPEC,

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
        *failed = 1;  // reported; this child stays NULL
        return NULL;
    }
    newNode->val = value;
    newNode->left = NULL;
    newNode->right = NULL;
    return newNode;
}

// Stage 1: the values in sorted order
void inorder(struct TreeNode* node, int values[], int* count) {
    if (node == NULL) {
        return;
    }
    inorder(node->left, values, count);
    values[(*count)++] = node->val;
    inorder(node->right, values, count);
}

// Stage 2: the middle value of each range becomes its root
struct TreeNode* buildBalanced(int values[], int left, int right, int* failed) {
    if (left > right) {
        return NULL;
    }
    int mid = left + (right - left) / 2;
    struct TreeNode* node = createNode(values[mid], failed);
    if (node == NULL) {
        return NULL;
    }
    node->left = buildBalanced(values, left, mid - 1, failed);
    node->right = buildBalanced(values, mid + 1, right, failed);
    return node;
}

// n: the number of nodes; sets *failed to 1 if memory runs out. The input tree is not changed.
struct TreeNode* balanceBST(struct TreeNode* root, int n, int* failed) {
    *failed = 0;
    int* values = (int*)malloc((n > 0 ? n : 1) * sizeof(int));
    if (values == NULL) {
        *failed = 1;
        return NULL;
    }
    int count = 0;
    inorder(root, values, &count);
    struct TreeNode* balanced = buildBalanced(values, 0, count - 1, failed);
    free(values);
    // Stage 3: the new root
    return balanced;
}`,
    cpp: `#include <vector>
using namespace std;

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;

    TreeNode(int val) {
        this->val = val;
        left = nullptr;
        right = nullptr;
    }
};

class BalanceBST {
public:
    // Stage 1: the values in sorted order
    void inorder(TreeNode* node, vector<int>& values) {
        if (node == nullptr) {
            return;
        }
        inorder(node->left, values);
        values.push_back(node->val);
        inorder(node->right, values);
    }

    // Stage 2: the middle value of each range becomes its root
    TreeNode* buildBalanced(const vector<int>& values, int left, int right) {
        if (left > right) {
            return nullptr;
        }
        int mid = left + (right - left) / 2;
        TreeNode* node = new TreeNode(values[mid]);
        node->left = buildBalanced(values, left, mid - 1);
        node->right = buildBalanced(values, mid + 1, right);
        return node;
    }

    // The input tree is not changed: a new tree is built
    TreeNode* balanceBST(TreeNode* root) {
        vector<int> values;
        inorder(root, values);
        TreeNode* balanced = buildBalanced(values, 0, (int)values.size() - 1);
        // Stage 3: the new root
        return balanced;
    }
};`,
    java: `import java.util.ArrayList;
import java.util.List;

class TreeNode {
    int val;
    TreeNode left, right;

    TreeNode(int val) {
        this.val = val;
    }
}

public class BalanceBST {
    // Stage 1: the values in sorted order
    static void inorder(TreeNode node, List<Integer> values) {
        if (node == null) {
            return;
        }
        inorder(node.left, values);
        values.add(node.val);
        inorder(node.right, values);
    }

    // Stage 2: the middle value of each range becomes its root
    static TreeNode buildBalanced(List<Integer> values, int left, int right) {
        if (left > right) {
            return null;
        }
        int mid = left + (right - left) / 2;
        TreeNode node = new TreeNode(values.get(mid));
        node.left = buildBalanced(values, left, mid - 1);
        node.right = buildBalanced(values, mid + 1, right);
        return node;
    }

    // The input tree is not changed: a new tree is built
    public static TreeNode balanceBST(TreeNode root) {
        List<Integer> values = new ArrayList<>();
        inorder(root, values);
        TreeNode balanced = buildBalanced(values, 0, values.size() - 1);
        // Stage 3: the new root
        return balanced;
    }
}`,
    python: `${PY_TREE_NODE}
# Stage 1: the values in sorted order
def inorder(node, values):
    if node is None:
        return
    inorder(node.left, values)
    values.append(node.val)
    inorder(node.right, values)

# Stage 2: the middle value of each range becomes its root
def build_balanced(values, left, right):
    if left > right:
        return None
    mid = left + (right - left) // 2
    node = TreeNode(values[mid])
    node.left = build_balanced(values, left, mid - 1)
    node.right = build_balanced(values, mid + 1, right)
    return node

# The input tree is not changed: a new tree is built
def balance_bst(root):
    values = []
    inorder(root, values)
    balanced = build_balanced(values, 0, len(values) - 1)
    # Stage 3: the new root
    return balanced`,
  },

  // The wrapper's calls start stages 1 and 2; its return is stage 3. A recursive call and the link of what it returns
  // are the same statement (node.left = buildBalanced(...)).
  lineMap: {
    c: { 'call-inorder': 56, 'in-check-null': 24, 'in-return-null': 25, 'in-recurse-left': 27, 'in-append': 28, 'in-recurse-right': 29, 'call-build': 57, 'b-check-range': 34, 'b-return-null': 35, 'b-mid': 37, 'b-create': 38, 'b-recurse-left': 42, 'b-link-left': 42, 'b-recurse-right': 43, 'b-link-right': 43, 'b-return-node': 44, done: 60 },
    cpp: { 'call-inorder': 43, 'in-check-null': 20, 'in-return-null': 21, 'in-recurse-left': 23, 'in-append': 24, 'in-recurse-right': 25, 'call-build': 44, 'b-check-range': 30, 'b-return-null': 31, 'b-mid': 33, 'b-create': 34, 'b-recurse-left': 35, 'b-link-left': 35, 'b-recurse-right': 36, 'b-link-right': 36, 'b-return-node': 37, done: 46 },
    java: { 'call-inorder': 39, 'in-check-null': 16, 'in-return-null': 17, 'in-recurse-left': 19, 'in-append': 20, 'in-recurse-right': 21, 'call-build': 40, 'b-check-range': 26, 'b-return-null': 27, 'b-mid': 29, 'b-create': 30, 'b-recurse-left': 31, 'b-link-left': 31, 'b-recurse-right': 32, 'b-link-right': 32, 'b-return-node': 33, done: 42 },
    python: { 'call-inorder': 28, 'in-check-null': 9, 'in-return-null': 10, 'in-recurse-left': 11, 'in-append': 12, 'in-recurse-right': 13, 'call-build': 29, 'b-check-range': 17, 'b-return-null': 18, 'b-mid': 19, 'b-create': 20, 'b-recurse-left': 21, 'b-link-left': 21, 'b-recurse-right': 22, 'b-link-right': 22, 'b-return-node': 23, done: 31 },
  },

  generateSteps: generateBalanceBstSteps,
};
