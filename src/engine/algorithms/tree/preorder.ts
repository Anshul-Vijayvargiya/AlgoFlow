import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { levelOrderText } from '../../tree/binaryTree';
import { C_TREE_NODE, CPP_TREE_NODE, JAVA_TREE_NODE, PY_TREE_NODE, TREE_INPUT_SPEC, treeInput, treeRecorder } from './treeTrace';

/**
 * Preorder traversal (root, left, right), iteratively: pop a node, visit it, then push its right child and then its
 * left child, so the left subtree comes off the stack first. O(n) time, O(h) space for the stack.
 */
function generatePreorderSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const tree = treeInput(params, 'Preorder Traversal');
  const { steps, push, node, values, show } = treeRecorder(tree);
  const stack: string[] = [];
  const visited: string[] = [];
  let current: string | null = null;
  const state = (action?: 'push' | 'pop') => ({
    ...(current ? { current } : {}),
    visited,
    stack: { items: [...stack], ...(action ? { action } : {}) },
    pointers: [{ name: 'node', node: current }],
  });

  push(
    {
      type: 'init',
      codeRef: 'fn-entry',
      variables: { root: levelOrderText(tree) },
      message: `preorderTraversal(${levelOrderText(tree)})`,
      explanation: 'Preorder visits a node first, then its left subtree, then its right subtree. A stack holds the subtrees still to visit.',
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
        outcomeText: 'Preorder: []',
      },
      { visited, result: { kind: 'answer', text: 'Preorder: []' } }
    );
    return steps;
  }

  stack.push(tree.root);
  push(
    {
      type: 'assign',
      codeRef: 'init-stack',
      variables: { stack: values(stack) },
      message: `stack = [root]  →  ${values(stack)}`,
      explanation: 'The whole tree is the first subtree to visit.',
      actionLabel: `Push ${node(tree.root).value}`,
    },
    state('push')
  );

  for (;;) {
    const go = stack.length > 0;
    push(
      {
        type: 'loop-condition',
        codeRef: 'loop',
        variables: { stack: values(stack) },
        result: go ? 'true' : 'false',
        message: `stack not empty?  ${values(stack)} → ${go}`,
        explanation: go ? 'A subtree is still waiting.' : 'Every node has been visited.',
        actionLabel: go ? 'Continue' : 'Done',
      },
      state()
    );
    if (!go) break;

    current = stack.pop()!;
    push(
      {
        type: 'update',
        codeRef: 'pop',
        variables: { node: show(current), stack: values(stack) },
        message: `node = pop()  →  ${show(current)}, stack = ${values(stack)}`,
        explanation: `${show(current)} is the root of the next subtree to visit.`,
        actionLabel: `Pop ${node(current).value}`,
      },
      state('pop')
    );
    visited.push(current);
    push(
      {
        type: 'update',
        codeRef: 'visit',
        variables: { result: values(visited) },
        message: `visit ${node(current).value}  →  result = ${values(visited)}`,
        explanation: 'In preorder a node is visited before either of its subtrees.',
        actionLabel: `Visit ${node(current).value}`,
      },
      state()
    );
    // the right child is pushed first, so the left one is popped first
    for (const side of ['right', 'left'] as const) {
      const child = node(current)[side];
      push(
        {
          type: 'condition',
          codeRef: `check-${side}`,
          variables: { [`node.${side}`]: show(child) },
          result: child ? 'true' : 'false',
          message: `node.${side} != null?  → ${child !== null}`,
          explanation: child
            ? side === 'right'
              ? `Push the right child (${show(child)}) first: the stack is last-in, first-out, so it will come off after the left subtree.`
              : `Push the left child (${show(child)}) last: it is visited next.`
            : `Node ${node(current).value} has no ${side} child.`,
          actionLabel: child ? `Has ${side}` : `No ${side}`,
        },
        state()
      );
      if (!child) continue;
      stack.push(child);
      push(
        {
          type: 'update',
          codeRef: `push-${side}`,
          variables: { stack: values(stack) },
          message: `push ${show(child)}  →  stack = ${values(stack)}`,
          explanation: `${show(child)} waits on the stack.`,
          actionLabel: `Push ${node(child).value}`,
        },
        state('push')
      );
    }
  }

  current = null;
  const text = `Preorder: ${values(visited)}`;
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { result: values(visited) },
      message: `Return ${values(visited)}`,
      explanation: 'Every node was pushed and popped once: O(n) time, and O(h) extra space for the stack (h = the height of the tree).',
      actionLabel: 'Return',
      outcomeText: text,
    },
    { visited, stack: { items: [] }, pointers: [{ name: 'node', node: null }], result: { kind: 'answer', text } }
  );
  return steps;
}

export const treePreorderDefinition: AlgorithmDefinition = {
  id: 'tree-preorder',
  name: 'Preorder Traversal',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Root, left, right — pop, visit, push right then left.',
  description:
    'Preorder traversal visits each node before its subtrees: the root, then the left subtree, then the right. The iterative version pops a node, visits it, and pushes its right child before its left child so that the left subtree is visited first.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(h)', bestFor: 'Copying or serializing a tree; prefix expressions' },
  defaultInput: [],
  inputSpec: TREE_INPUT_SPEC,

  code: {
    c: `${C_TREE_NODE}
int *preorderTraversal(struct TreeNode *root, int *returnSize) {
    int *result = malloc(100 * sizeof(int));
    *returnSize = 0;
    if (root == NULL) {
        return result;
    }
    struct TreeNode *stack[100];
    int top = 0;
    stack[top++] = root;
    while (top > 0) {
        struct TreeNode *node = stack[--top];
        result[(*returnSize)++] = node->val;
        if (node->right != NULL) {
            stack[top++] = node->right;
        }
        if (node->left != NULL) {
            stack[top++] = node->left;
        }
    }
    return result;
}`,
    cpp: `${CPP_TREE_NODE}
vector<int> preorderTraversal(TreeNode* root) {
    vector<int> result;
    if (root == nullptr) {
        return result;
    }
    stack<TreeNode*> st;
    st.push(root);
    while (!st.empty()) {
        TreeNode* node = st.top();
        st.pop();
        result.push_back(node->val);
        if (node->right != nullptr) {
            st.push(node->right);
        }
        if (node->left != nullptr) {
            st.push(node->left);
        }
    }
    return result;
}`,
    java: `${JAVA_TREE_NODE('Deque')}
public class PreorderTraversal {
    public static List<Integer> preorderTraversal(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) {
            return result;
        }
        Deque<TreeNode> stack = new ArrayDeque<>();
        stack.push(root);
        while (!stack.isEmpty()) {
            TreeNode node = stack.pop();
            result.add(node.val);
            if (node.right != null) {
                stack.push(node.right);
            }
            if (node.left != null) {
                stack.push(node.left);
            }
        }
        return result;
    }
}`,
    python: `${PY_TREE_NODE}
def preorder_traversal(root):
    result = []
    if root is None:
        return result
    stack = [root]
    while stack:
        node = stack.pop()
        result.append(node.val)
        if node.right:
            stack.append(node.right)
        if node.left:
            stack.append(node.left)
    return result`,
  },

  lineMap: {
    c: { 'fn-entry': 7, 'init-result': 8, 'check-empty': 10, 'return-empty': 11, 'init-stack': 13, loop: 16, pop: 17, visit: 18, 'check-right': 19, 'push-right': 20, 'check-left': 22, 'push-left': 23, return: 26 },
    cpp: { 'fn-entry': 7, 'init-result': 8, 'check-empty': 9, 'return-empty': 10, 'init-stack': 12, loop: 14, pop: 15, visit: 17, 'check-right': 18, 'push-right': 19, 'check-left': 21, 'push-left': 22, return: 25 },
    java: { 'fn-entry': 13, 'init-result': 14, 'check-empty': 15, 'return-empty': 16, 'init-stack': 18, loop: 20, pop: 21, visit: 22, 'check-right': 23, 'push-right': 24, 'check-left': 26, 'push-left': 27, return: 30 },
    python: { 'fn-entry': 7, 'init-result': 8, 'check-empty': 9, 'return-empty': 10, 'init-stack': 11, loop: 12, pop: 13, visit: 14, 'check-right': 15, 'push-right': 16, 'check-left': 17, 'push-left': 18, return: 19 },
  },
  // C sets the output size with the result; the stack is declared and the root pushed over several lines
  lineSpans: { c: { 'init-result': 2, 'init-stack': 3 }, cpp: { 'init-stack': 2, pop: 2 }, java: { 'init-stack': 2 } },

  generateSteps: generatePreorderSteps,
};
