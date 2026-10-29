import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { levelOrderText } from '../../tree/binaryTree';
import { C_TREE_NODE, CPP_TREE_NODE, JAVA_TREE_NODE, PY_TREE_NODE, TREE_INPUT_SPEC, treeInput, treeRecorder } from './treeTrace';

/**
 * Inorder traversal (left, root, right), iteratively with an explicit stack: walk left pushing every node, then pop one,
 * visit it and continue in its right subtree. Each node is pushed and popped once: O(n) time, O(h) space for the stack.
 */
function generateInorderSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const tree = treeInput(params, 'Inorder Traversal');
  const { steps, push, node, values, show } = treeRecorder(tree);
  const stack: string[] = [];
  const visited: string[] = [];
  let curr: string | null = tree.root;
  const state = (action?: 'push' | 'pop', current: string | null = curr) => ({
    ...(current ? { current } : {}),
    visited,
    stack: { items: [...stack], ...(action ? { action } : {}) },
    pointers: [{ name: 'curr', node: curr }],
  });

  push(
    {
      type: 'init',
      codeRef: 'fn-entry',
      variables: { root: levelOrderText(tree) },
      message: `inorderTraversal(${levelOrderText(tree)})`,
      explanation: 'Inorder visits the left subtree, then the node, then the right subtree. A stack remembers the nodes whose left side is still being explored.',
      actionLabel: 'Start',
    },
    { visited, pointers: [] }
  );
  push(
    {
      type: 'assign',
      codeRef: 'init',
      variables: { result: [], stack: [], curr: show(curr) },
      message: `result = [], stack = [], curr = root (${show(curr)})`,
      explanation: tree.root ? 'curr walks the tree; the stack holds the nodes waiting to be visited.' : 'The tree is empty: root is null.',
      actionLabel: 'Init',
    },
    state()
  );

  for (;;) {
    const go = curr !== null || stack.length > 0;
    push(
      {
        type: 'loop-condition',
        codeRef: 'outer-loop',
        variables: { curr: show(curr), stack: values(stack) },
        result: go ? 'true' : 'false',
        message: `curr != null or stack not empty?  curr = ${show(curr)}, stack = ${values(stack)} → ${go}`,
        explanation: go ? 'There are nodes left to visit.' : 'No node is left to visit.',
        actionLabel: go ? 'Continue' : 'Done',
      },
      state()
    );
    if (!go) break;

    for (;;) {
      const has = curr !== null;
      push(
        {
          type: 'loop-condition',
          codeRef: 'inner-loop',
          variables: { curr: show(curr) },
          result: has ? 'true' : 'false',
          message: `curr != null?  curr = ${show(curr)} → ${has}`,
          explanation: has ? `Before visiting ${show(curr)}, its left subtree comes first: push it and go left.` : 'Nothing further left: the node on top of the stack is next.',
          actionLabel: has ? 'Go left' : 'Leftmost reached',
        },
        state()
      );
      if (curr === null) break;
      stack.push(curr);
      push(
        {
          type: 'update',
          codeRef: 'push',
          variables: { stack: values(stack) },
          message: `push ${show(curr)}  →  stack = ${values(stack)}`,
          explanation: `${show(curr)} waits on the stack until its left subtree is done.`,
          actionLabel: `Push ${node(curr).value}`,
        },
        state('push')
      );
      const from: string = curr;
      curr = node(curr).left;
      push(
        {
          type: 'assign',
          codeRef: 'go-left',
          variables: { curr: show(curr) },
          message: `curr = curr.left = ${show(curr)}`,
          explanation: curr ? `Go to the left child of node ${node(from).value}.` : `Node ${node(from).value} has no left child.`,
          actionLabel: 'curr = curr.left',
        },
        state()
      );
    }

    curr = stack.pop()!;
    push(
      {
        type: 'update',
        codeRef: 'pop',
        variables: { curr: show(curr), stack: values(stack) },
        message: `curr = pop()  →  ${show(curr)}, stack = ${values(stack)}`,
        explanation: `${show(curr)} has nothing left of it to visit: it is next.`,
        actionLabel: `Pop ${node(curr).value}`,
      },
      state('pop')
    );
    visited.push(curr);
    push(
      {
        type: 'update',
        codeRef: 'visit',
        variables: { result: values(visited) },
        message: `visit ${node(curr).value}  →  result = ${values(visited)}`,
        explanation: `Its left subtree is done, so node ${node(curr).value} is visited; its right subtree comes next.`,
        actionLabel: `Visit ${node(curr).value}`,
      },
      state()
    );
    const from: string = curr;
    curr = node(curr).right;
    push(
      {
        type: 'assign',
        codeRef: 'go-right',
        variables: { curr: show(curr) },
        message: `curr = curr.right = ${show(curr)}`,
        explanation: curr ? `Now the right subtree of node ${node(from).value}.` : `Node ${node(from).value} has no right child.`,
        actionLabel: 'curr = curr.right',
      },
      state(undefined, from)
    );
  }

  const text = `Inorder: ${values(visited)}`;
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { result: values(visited) },
      message: `Return ${values(visited)}`,
      explanation: `Every node was pushed and popped once: O(n) time, and O(h) extra space for the stack (h = the height of the tree).`,
      actionLabel: 'Return',
      outcomeText: text,
    },
    { visited, stack: { items: [] }, pointers: [{ name: 'curr', node: null }], result: { kind: 'answer', text } }
  );
  return steps;
}

export const treeInorderDefinition: AlgorithmDefinition = {
  id: 'tree-inorder',
  name: 'Inorder Traversal',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Left, root, right — with an explicit stack.',
  description:
    'Inorder traversal visits a binary tree left subtree first, then the node, then the right subtree (in a binary search tree that is sorted order). The iterative version walks left pushing nodes on a stack, pops the next node to visit, then continues in its right subtree.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(h)', bestFor: 'Sorted order of a BST; expression trees in infix' },
  defaultInput: [],
  inputSpec: TREE_INPUT_SPEC,

  code: {
    c: `${C_TREE_NODE}
int *inorderTraversal(struct TreeNode *root, int *returnSize) {
    int *result = malloc(100 * sizeof(int));
    struct TreeNode *stack[100];
    int top = 0;
    struct TreeNode *curr = root;
    *returnSize = 0;
    while (curr != NULL || top > 0) {
        while (curr != NULL) {
            stack[top++] = curr;
            curr = curr->left;
        }
        curr = stack[--top];
        result[(*returnSize)++] = curr->val;
        curr = curr->right;
    }
    return result;
}`,
    cpp: `${CPP_TREE_NODE}
vector<int> inorderTraversal(TreeNode* root) {
    vector<int> result;
    stack<TreeNode*> st;
    TreeNode* curr = root;
    while (curr != nullptr || !st.empty()) {
        while (curr != nullptr) {
            st.push(curr);
            curr = curr->left;
        }
        curr = st.top();
        st.pop();
        result.push_back(curr->val);
        curr = curr->right;
    }
    return result;
}`,
    java: `${JAVA_TREE_NODE('Deque')}
public class InorderTraversal {
    public static List<Integer> inorderTraversal(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        Deque<TreeNode> stack = new ArrayDeque<>();
        TreeNode curr = root;
        while (curr != null || !stack.isEmpty()) {
            while (curr != null) {
                stack.push(curr);
                curr = curr.left;
            }
            curr = stack.pop();
            result.add(curr.val);
            curr = curr.right;
        }
        return result;
    }
}`,
    python: `${PY_TREE_NODE}
def inorder_traversal(root):
    result = []
    stack = []
    curr = root
    while curr or stack:
        while curr:
            stack.append(curr)
            curr = curr.left
        curr = stack.pop()
        result.append(curr.val)
        curr = curr.right
    return result`,
  },

  lineMap: {
    c: { 'fn-entry': 7, init: 8, 'outer-loop': 13, 'inner-loop': 14, push: 15, 'go-left': 16, pop: 18, visit: 19, 'go-right': 20, return: 22 },
    cpp: { 'fn-entry': 7, init: 8, 'outer-loop': 11, 'inner-loop': 12, push: 13, 'go-left': 14, pop: 16, visit: 18, 'go-right': 19, return: 21 },
    java: { 'fn-entry': 13, init: 14, 'outer-loop': 17, 'inner-loop': 18, push: 19, 'go-left': 20, pop: 22, visit: 23, 'go-right': 24, return: 26 },
    python: { 'fn-entry': 7, init: 8, 'outer-loop': 11, 'inner-loop': 12, push: 13, 'go-left': 14, pop: 15, visit: 16, 'go-right': 17, return: 18 },
  },
  // the setup is several declarations; C++ reads the top and pops it in two statements
  lineSpans: { c: { init: 5 }, cpp: { init: 3, pop: 2 }, java: { init: 3 }, python: { init: 3 } },

  generateSteps: generateInorderSteps,
};
