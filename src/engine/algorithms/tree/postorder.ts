import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { levelOrderText } from '../../tree/binaryTree';
import { C_TREE_NODE, CPP_TREE_NODE, JAVA_TREE_NODE, PY_TREE_NODE, TREE_INPUT_SPEC, treeInput, treeRecorder } from './treeTrace';

/**
 * Postorder traversal (left, right, root), iteratively with one stack: go left pushing nodes; at the bottom, peek at the
 * top of the stack — if it has a right subtree not yet done, go there, otherwise visit it and pop it (remembering it as
 * `last`, so its parent knows its right subtree is finished). O(n) time, O(h) space.
 */
function generatePostorderSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const tree = treeInput(params, 'Postorder Traversal');
  const { steps, push, node, values, show } = treeRecorder(tree);
  const stack: string[] = [];
  const visited: string[] = [];
  let curr: string | null = tree.root;
  let last: string | null = null;
  let peek: string | null = null;
  const state = (action?: 'push' | 'pop' | 'peek', current: string | null = curr ?? peek) => ({
    ...(current ? { current } : {}),
    visited,
    stack: { items: [...stack], ...(action ? { action } : {}) },
    pointers: [
      { name: 'curr', node: curr },
      ...(peek ? [{ name: 'peek', node: peek }] : []),
      { name: 'last', node: last },
    ],
  });

  push(
    {
      type: 'init',
      codeRef: 'fn-entry',
      variables: { root: levelOrderText(tree) },
      message: `postorderTraversal(${levelOrderText(tree)})`,
      explanation: 'Postorder visits both subtrees before the node itself. One stack holds the path down; `last` remembers the node visited most recently.',
      actionLabel: 'Start',
    },
    { visited, pointers: [] }
  );
  push(
    {
      type: 'assign',
      codeRef: 'init',
      variables: { result: [], stack: [], curr: show(curr), last: 'null' },
      message: `result = [], stack = [], curr = root (${show(curr)}), last = null`,
      explanation: tree.root ? 'curr walks down the tree; last tells a parent whether its right subtree is finished.' : 'The tree is empty: root is null.',
      actionLabel: 'Init',
    },
    state()
  );

  for (;;) {
    peek = null;
    const go = curr !== null || stack.length > 0;
    push(
      {
        type: 'loop-condition',
        codeRef: 'loop',
        variables: { curr: show(curr), stack: values(stack) },
        result: go ? 'true' : 'false',
        message: `curr != null or stack not empty?  curr = ${show(curr)}, stack = ${values(stack)} → ${go}`,
        explanation: go ? 'There are nodes left to visit.' : 'No node is left to visit.',
        actionLabel: go ? 'Continue' : 'Done',
      },
      state()
    );
    if (!go) break;

    const descending = curr !== null;
    push(
      {
        type: 'condition',
        codeRef: 'check-curr',
        variables: { curr: show(curr) },
        result: descending ? 'true' : 'false',
        message: `curr != null?  curr = ${show(curr)} → ${descending}`,
        explanation: descending ? `Its subtrees come first: push ${show(curr)} and go left.` : 'Nothing further down this way: look at the node on top of the stack.',
        actionLabel: descending ? 'Go down' : 'Look at top',
      },
      state()
    );

    if (curr !== null) {
      stack.push(curr);
      push(
        {
          type: 'update',
          codeRef: 'push',
          variables: { stack: values(stack) },
          message: `push ${show(curr)}  →  stack = ${values(stack)}`,
          explanation: `${show(curr)} waits until both of its subtrees are done.`,
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
        state(undefined, curr ?? from)
      );
      continue;
    }

    peek = stack[stack.length - 1];
    push(
      {
        type: 'assign',
        codeRef: 'peek',
        variables: { peek: show(peek) },
        message: `peek = top of stack = ${show(peek)}`,
        explanation: `Its left subtree is done. Is its right subtree done too?`,
        actionLabel: `Peek ${node(peek).value}`,
      },
      state('peek')
    );
    const right = node(peek).right;
    const goRight = right !== null && right !== last;
    push(
      {
        type: 'condition',
        codeRef: 'check-right',
        variables: { 'peek.right': show(right), last: show(last) },
        result: goRight ? 'true' : 'false',
        message: `peek.right != null and peek.right != last?  ${show(right)}, last = ${show(last)} → ${goRight}`,
        explanation: goRight
          ? `Node ${node(peek).value} has a right subtree not yet visited: go there first.`
          : right === null
            ? `Node ${node(peek).value} has no right child: both subtrees are done, so it is visited now.`
            : `Its right child was just visited (it is last): both subtrees are done, so node ${node(peek).value} is visited now.`,
        actionLabel: goRight ? 'Go right' : 'Visit it',
      },
      state()
    );
    if (goRight) {
      curr = right;
      push(
        {
          type: 'assign',
          codeRef: 'go-right',
          variables: { curr: show(curr) },
          message: `curr = peek.right = ${show(curr)}`,
          explanation: `Explore the right subtree of node ${node(peek).value}.`,
          actionLabel: 'curr = peek.right',
        },
        state(undefined, curr)
      );
      continue;
    }
    visited.push(peek);
    push(
      {
        type: 'update',
        codeRef: 'visit',
        variables: { result: values(visited) },
        message: `visit ${node(peek).value}  →  result = ${values(visited)}`,
        explanation: 'Both subtrees are done: in postorder the node comes last.',
        actionLabel: `Visit ${node(peek).value}`,
      },
      state()
    );
    last = stack.pop()!;
    push(
      {
        type: 'update',
        codeRef: 'pop',
        variables: { last: show(last), stack: values(stack) },
        message: `last = pop()  →  ${show(last)}, stack = ${values(stack)}`,
        explanation: `Remembering ${show(last)} as last tells its parent that this subtree is finished.`,
        actionLabel: `Pop ${node(last).value}`,
      },
      state('pop', last)
    );
  }

  const text = `Postorder: ${values(visited)}`;
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { result: values(visited) },
      message: `Return ${values(visited)}`,
      explanation: 'Every node was pushed and popped once (and peeked at most twice): O(n) time, and O(h) extra space for the stack (h = the height of the tree).',
      actionLabel: 'Return',
      outcomeText: text,
    },
    { visited, stack: { items: [] }, pointers: [{ name: 'curr', node: null }, { name: 'last', node: last }], result: { kind: 'answer', text } }
  );
  return steps;
}

export const treePostorderDefinition: AlgorithmDefinition = {
  id: 'tree-postorder',
  name: 'Postorder Traversal',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Left, right, root — one stack and the last node visited.',
  description:
    'Postorder traversal visits both subtrees before the node: left, right, then the node itself. With one stack, it walks left pushing nodes, then looks at the top: if its right subtree is unvisited it goes there, otherwise it visits and pops the node, remembering it as the last one visited.',
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(h)', bestFor: 'Deleting a tree, evaluating expression trees, sizes of subtrees' },
  defaultInput: [],
  inputSpec: TREE_INPUT_SPEC,

  code: {
    c: `${C_TREE_NODE}
int *postorderTraversal(struct TreeNode *root, int *returnSize) {
    int *result = malloc(100 * sizeof(int));
    struct TreeNode *stack[100];
    int top = 0;
    struct TreeNode *curr = root, *last = NULL;
    *returnSize = 0;
    while (curr != NULL || top > 0) {
        if (curr != NULL) {
            stack[top++] = curr;
            curr = curr->left;
        } else {
            struct TreeNode *peek = stack[top - 1];
            if (peek->right != NULL && peek->right != last) {
                curr = peek->right;
            } else {
                result[(*returnSize)++] = peek->val;
                last = stack[--top];
            }
        }
    }
    return result;
}`,
    cpp: `${CPP_TREE_NODE}
vector<int> postorderTraversal(TreeNode* root) {
    vector<int> result;
    stack<TreeNode*> st;
    TreeNode* curr = root;
    TreeNode* last = nullptr;
    while (curr != nullptr || !st.empty()) {
        if (curr != nullptr) {
            st.push(curr);
            curr = curr->left;
        } else {
            TreeNode* peek = st.top();
            if (peek->right != nullptr && peek->right != last) {
                curr = peek->right;
            } else {
                result.push_back(peek->val);
                last = peek;
                st.pop();
            }
        }
    }
    return result;
}`,
    java: `${JAVA_TREE_NODE('Deque')}
public class PostorderTraversal {
    public static List<Integer> postorderTraversal(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        Deque<TreeNode> stack = new ArrayDeque<>();
        TreeNode curr = root, last = null;
        while (curr != null || !stack.isEmpty()) {
            if (curr != null) {
                stack.push(curr);
                curr = curr.left;
            } else {
                TreeNode peek = stack.peek();
                if (peek.right != null && peek.right != last) {
                    curr = peek.right;
                } else {
                    result.add(peek.val);
                    last = stack.pop();
                }
            }
        }
        return result;
    }
}`,
    python: `${PY_TREE_NODE}
def postorder_traversal(root):
    result = []
    stack = []
    curr = root
    last = None
    while curr or stack:
        if curr:
            stack.append(curr)
            curr = curr.left
        else:
            peek = stack[-1]
            if peek.right and peek.right is not last:
                curr = peek.right
            else:
                result.append(peek.val)
                last = stack.pop()
    return result`,
  },

  lineMap: {
    c: { 'fn-entry': 7, init: 8, loop: 13, 'check-curr': 14, push: 15, 'go-left': 16, peek: 18, 'check-right': 19, 'go-right': 20, visit: 22, pop: 23, return: 27 },
    cpp: { 'fn-entry': 7, init: 8, loop: 12, 'check-curr': 13, push: 14, 'go-left': 15, peek: 17, 'check-right': 18, 'go-right': 19, visit: 21, pop: 22, return: 27 },
    java: { 'fn-entry': 13, init: 14, loop: 17, 'check-curr': 18, push: 19, 'go-left': 20, peek: 22, 'check-right': 23, 'go-right': 24, visit: 26, pop: 27, return: 31 },
    python: { 'fn-entry': 7, init: 8, loop: 12, 'check-curr': 13, push: 14, 'go-left': 15, peek: 17, 'check-right': 18, 'go-right': 19, visit: 21, pop: 22, return: 23 },
  },
  // the setup is several declarations; C++ records last and pops in two statements
  lineSpans: { c: { init: 5 }, cpp: { init: 4, pop: 2 }, java: { init: 3 }, python: { init: 4 } },

  generateSteps: generatePostorderSteps,
};
