import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { layoutTree, levelOrderText } from '../../tree/binaryTree';
import { C_TREE_NODE, CPP_TREE_NODE, JAVA_TREE_NODE, PY_TREE_NODE, TREE_INPUT_SPEC, treeInput, treeRecorder } from './treeTrace';

/**
 * Level-order traversal (breadth-first): a queue starts with the root; take the node at the front, visit it, and add
 * its children at the back. Nodes leave the queue level by level, left to right. O(n) time, O(w) space for the queue
 * (w = the widest level).
 */
function generateLevelOrderSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const tree = treeInput(params, 'Level Order Traversal');
  const { steps, push, node, values, show } = treeRecorder(tree);
  const depth = Object.fromEntries(Object.entries(layoutTree(tree)).map(([id, p]) => [id, p.depth]));
  const queue: string[] = [];
  const visited: string[] = [];
  let current: string | null = null;
  const state = (action?: 'enqueue' | 'dequeue') => ({
    ...(current ? { current } : {}),
    visited,
    queue: { items: [...queue], ...(action ? { action } : {}) },
    pointers: [{ name: 'node', node: current }],
  });

  push(
    {
      type: 'init',
      codeRef: 'fn-entry',
      variables: { root: levelOrderText(tree) },
      message: `levelOrder(${levelOrderText(tree)})`,
      explanation: 'Level order visits the root, then every node one level down, and so on, left to right. A queue (first in, first out) keeps them in that order.',
      actionLabel: 'Start',
    },
    { visited, pointers: [] }
  );
  push({ type: 'assign', codeRef: 'init-result', variables: { result: [] }, message: 'result = []', explanation: 'The visited values, in order.', actionLabel: 'result = []' }, { visited });

  const empty = tree.root === null;
  push(
    {
      type: 'condition',
      codeRef: 'check-empty',
      variables: { root: show(tree.root) },
      result: empty ? 'true' : 'false',
      message: `root == null?  → ${empty}`,
      explanation: empty ? 'The tree is empty: there is nothing to visit.' : 'The tree has a root: start from it.',
      actionLabel: empty ? 'Empty tree' : 'Has a root',
    },
    { visited }
  );
  if (tree.root === null) {
    push(
      {
        type: 'complete',
        codeRef: 'return-empty',
        variables: { result: '[]' },
        message: 'Return []',
        explanation: 'An empty tree has no nodes to visit: O(1).',
        actionLabel: 'Return []',
        outcomeText: 'Level order: []',
      },
      { visited, result: { kind: 'answer', text: 'Level order: []' } }
    );
    return steps;
  }

  queue.push(tree.root);
  push(
    {
      type: 'assign',
      codeRef: 'init-queue',
      variables: { queue: values(queue) },
      message: `queue = [root]  →  ${values(queue)}`,
      explanation: 'Level 0 is just the root.',
      actionLabel: `Enqueue ${node(tree.root).value}`,
    },
    state('enqueue')
  );

  for (;;) {
    const go = queue.length > 0;
    push(
      {
        type: 'loop-condition',
        codeRef: 'loop',
        variables: { queue: values(queue) },
        result: go ? 'true' : 'false',
        message: `queue not empty?  ${values(queue)} → ${go}`,
        explanation: go ? 'A node is waiting in the queue.' : 'Every level has been visited.',
        actionLabel: go ? 'Continue' : 'Done',
      },
      state()
    );
    if (!go) break;

    current = queue.shift()!;
    push(
      {
        type: 'update',
        codeRef: 'dequeue',
        variables: { node: show(current), queue: values(queue) },
        message: `node = dequeue()  →  ${show(current)}, queue = ${values(queue)}`,
        explanation: `The front of the queue: ${show(current)}, on level ${depth[current]}.`,
        actionLabel: `Dequeue ${node(current).value}`,
      },
      state('dequeue')
    );
    visited.push(current);
    push(
      {
        type: 'update',
        codeRef: 'visit',
        variables: { result: values(visited) },
        message: `visit ${node(current).value}  →  result = ${values(visited)}`,
        explanation: `Node ${node(current).value} (level ${depth[current]}) is visited; its children join the back of the queue, behind the rest of level ${depth[current]}.`,
        actionLabel: `Visit ${node(current).value}`,
      },
      state()
    );
    for (const side of ['left', 'right'] as const) {
      const child = node(current)[side];
      push(
        {
          type: 'condition',
          codeRef: `check-${side}`,
          variables: { [`node.${side}`]: show(child) },
          result: child ? 'true' : 'false',
          message: `node.${side} != null?  → ${child !== null}`,
          explanation: child ? `${show(child)} is on level ${depth[child]}: it waits behind the nodes already in the queue.` : `Node ${node(current).value} has no ${side} child.`,
          actionLabel: child ? `Has ${side}` : `No ${side}`,
        },
        state()
      );
      if (!child) continue;
      queue.push(child);
      push(
        {
          type: 'update',
          codeRef: `enqueue-${side}`,
          variables: { queue: values(queue) },
          message: `enqueue ${show(child)}  →  queue = ${values(queue)}`,
          explanation: `${show(child)} joins the back of the queue.`,
          actionLabel: `Enqueue ${node(child).value}`,
        },
        state('enqueue')
      );
    }
  }

  current = null;
  const text = `Level order: ${values(visited)}`;
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { result: values(visited) },
      message: `Return ${values(visited)}`,
      explanation: 'Every node entered and left the queue once: O(n) time, and O(w) extra space for the queue (w = the widest level).',
      actionLabel: 'Return',
      outcomeText: text,
    },
    { visited, queue: { items: [] }, pointers: [{ name: 'node', node: null }], result: { kind: 'answer', text } }
  );
  return steps;
}

export const treeLevelOrderDefinition: AlgorithmDefinition = {
  id: 'tree-level-order',
  name: 'Level Order Traversal',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Breadth-first, level by level, with a queue.',
  description:
    'Level-order (breadth-first) traversal visits a tree one level at a time, left to right. A queue starts with the root; each step takes the node at the front, visits it, and adds its children at the back, so a level is finished before the next begins.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(w)', bestFor: 'Shortest paths in unweighted trees; per-level processing' },
  defaultInput: [],
  inputSpec: TREE_INPUT_SPEC,

  code: {
    c: `${C_TREE_NODE}
int *levelOrder(struct TreeNode *root, int *returnSize) {
    int *result = malloc(100 * sizeof(int));
    *returnSize = 0;
    if (root == NULL) {
        return result;
    }
    struct TreeNode *queue[100];
    int head = 0, tail = 0;
    queue[tail++] = root;
    while (head < tail) {
        struct TreeNode *node = queue[head++];
        result[(*returnSize)++] = node->val;
        if (node->left != NULL) {
            queue[tail++] = node->left;
        }
        if (node->right != NULL) {
            queue[tail++] = node->right;
        }
    }
    return result;
}`,
    cpp: `${CPP_TREE_NODE}
vector<int> levelOrder(TreeNode* root) {
    vector<int> result;
    if (root == nullptr) {
        return result;
    }
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* node = q.front();
        q.pop();
        result.push_back(node->val);
        if (node->left != nullptr) {
            q.push(node->left);
        }
        if (node->right != nullptr) {
            q.push(node->right);
        }
    }
    return result;
}`,
    java: `${JAVA_TREE_NODE('Queue')}
public class LevelOrderTraversal {
    public static List<Integer> levelOrder(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) {
            return result;
        }
        Queue<TreeNode> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            TreeNode node = queue.poll();
            result.add(node.val);
            if (node.left != null) {
                queue.add(node.left);
            }
            if (node.right != null) {
                queue.add(node.right);
            }
        }
        return result;
    }
}`,
    python: `from collections import deque

${PY_TREE_NODE}
def level_order(root):
    result = []
    if root is None:
        return result
    queue = deque([root])
    while queue:
        node = queue.popleft()
        result.append(node.val)
        if node.left:
            queue.append(node.left)
        if node.right:
            queue.append(node.right)
    return result`,
  },

  lineMap: {
    c: { 'fn-entry': 7, 'init-result': 8, 'check-empty': 10, 'return-empty': 11, 'init-queue': 13, loop: 16, dequeue: 17, visit: 18, 'check-left': 19, 'enqueue-left': 20, 'check-right': 22, 'enqueue-right': 23, return: 26 },
    cpp: { 'fn-entry': 7, 'init-result': 8, 'check-empty': 9, 'return-empty': 10, 'init-queue': 12, loop: 14, dequeue: 15, visit: 17, 'check-left': 18, 'enqueue-left': 19, 'check-right': 21, 'enqueue-right': 22, return: 25 },
    java: { 'fn-entry': 13, 'init-result': 14, 'check-empty': 15, 'return-empty': 16, 'init-queue': 18, loop: 20, dequeue: 21, visit: 22, 'check-left': 23, 'enqueue-left': 24, 'check-right': 26, 'enqueue-right': 27, return: 30 },
    python: { 'fn-entry': 9, 'init-result': 10, 'check-empty': 11, 'return-empty': 12, 'init-queue': 13, loop: 14, dequeue: 15, visit: 16, 'check-left': 17, 'enqueue-left': 18, 'check-right': 19, 'enqueue-right': 20, return: 21 },
  },
  // C sets the output size with the result; the queue is declared and the root added over several lines
  lineSpans: { c: { 'init-result': 2, 'init-queue': 3 }, cpp: { 'init-queue': 2, dequeue: 2 }, java: { 'init-queue': 2 } },

  generateSteps: generateLevelOrderSteps,
};
