import type { AlgorithmInputSpec, ExecutionStep, TextField, TreeNodeView, TreeView } from '../../../types/algorithm';
import { MAX_TREE_LEVELS, MAX_TREE_NODES, nodeMap, treeFromLevelOrder, type BinaryTree } from '../../tree/binaryTree';
import { textInputs } from '../strings/textInput';

/** the one input of every tree algorithm: the tree, written in level order */
export const TREE_FIELD: TextField = {
  label: 'root',
  hint: `The tree in level order: whole numbers from -999 to 999, null for a missing child, e.g. [1, 2, 3, 4, 5, null, 6]; [] is the empty tree. At most ${MAX_TREE_NODES} nodes and ${MAX_TREE_LEVELS} levels`,
  defaultValue: '[1, 2, 3, 4, 5, null, 6]',
  minLength: 1,
  maxLength: 160,
  chars: { pattern: '[\\s\\S]', description: 'any characters' },
  rule: 'level-order-tree',
};

export const TREE_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [TREE_FIELD],
  textExamples: [
    ['[1, 2, 3, 4, 5, null, 6]'],
    ['[4, 2, 6, 1, 3, 5, 7]'],
    ['[1, null, 2, 3]'],
    ['[3, 9, 20, null, null, 15, 7]'],
    ['[1, 2, null, 3, null, 4]'],
    ['[5, 3, 8, 1, 4, null, 9, null, 2]'],
    ['[1]'],
  ],
};

/** the tree a tree algorithm runs on (params.texts, or the default example) */
export function treeInput(params: Record<string, unknown> | undefined, name: string): BinaryTree {
  const [text] = textInputs(TREE_INPUT_SPEC, params, name);
  return treeFromLevelOrder(text);
}

/** what changes from step to step; the nodes and root are the same for the whole trace */
export type TreeState = Omit<TreeView, 'nodes' | 'root'>;

export function treeRecorder(tree: BinaryTree) {
  const steps: ExecutionStep[] = [];
  const byId = nodeMap(tree);
  const node = (id: string): TreeNodeView => byId.get(id)!;
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, view: TreeState) => {
    steps.push({ id: steps.length, state: [], ...s, tree: { nodes: tree.nodes, root: tree.root, ...view, visited: [...view.visited] } });
  };
  /** the values of a list of node ids, as the code's output or a stack / queue would print them */
  const values = (ids: readonly string[]) => `[${ids.map(id => node(id).value).join(', ')}]`;
  /** a pointer's value in a message: the node's value, or null */
  const show = (id: string | null) => (id === null ? 'null' : `node ${node(id).value}`);
  return { steps, push, node, values, show };
}

// ─── the node type each listing starts with (so every listing compiles and runs as shown) ─────────────────────
// Each ends with a newline: the function follows after one blank line (C, C++ and Python: line 7; Java: line 13).

export const C_TREE_NODE = `struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};
`;

export const CPP_TREE_NODE = `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
};
`;

/** the imports a Java listing needs (a Deque for a stack, a Queue for level order), then the node class */
export const JAVA_TREE_NODE = (container: 'Deque' | 'Queue') => `import java.util.ArrayDeque;
import java.util.ArrayList;
${container === 'Deque' ? 'import java.util.Deque;\nimport java.util.List;' : 'import java.util.List;\nimport java.util.Queue;'}

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}
`;

export const PY_TREE_NODE = `class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
`;
