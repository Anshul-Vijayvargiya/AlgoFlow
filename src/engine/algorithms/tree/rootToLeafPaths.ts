import type { AlgorithmDefinition, AlgorithmInputSpec, ExecutionStep, TreePathCall } from '../../../types/algorithm';
import { levelOrderText, treeFromLevelOrder } from '../../tree/binaryTree';
import { textInputs } from '../strings/textInput';
import { PY_TREE_NODE, TREE_FIELD, TREE_INPUT_SPEC, treeRecorder } from './treeTrace';

/**
 * Root to Leaf Paths: every path from the root down to a leaf of a binary tree (any binary tree: no ordering is
 * assumed), with a recursive DFS and backtracking:
 *
 *   an empty child returns at once;
 *   the node's value is added to the current path;
 *   at a leaf (no children) a copy of the path is saved;
 *   otherwise the left subtree is explored, then the right one (so paths come out left to right);
 *   the value is removed again before returning, so the caller gets its own path back.
 *
 * Each node is visited once, and saving copies one path of up to h + 1 values per leaf: O(n + L) time, where L is the
 * total number of values in the paths (O(n·h) at worst); O(h) space for the path and the calls, besides the O(L) output.
 *
 * The trace is made by running that recursion: every call pushes a frame and every return pops it; each step keeps a
 * copy of the frames, the current path and the paths found.
 */

/** the tree field of the traversals (no BST rule: any binary tree), with a tree whose four paths are easy to follow */
export const ROOT_TO_LEAF_INPUT_SPEC: AlgorithmInputSpec = {
  texts: [{ ...TREE_FIELD, defaultValue: '[1, 2, 3, 4, 5, 6, 7]' }],
  textExamples: [['[1, 2, 3, 4, 5, 6, 7]'], ...(TREE_INPUT_SPEC.textExamples ?? [])],
};

function generateRootToLeafSteps(_input: number[], params?: Record<string, unknown>): ExecutionStep[] {
  const [treeText] = textInputs(ROOT_TO_LEAF_INPUT_SPEC, params, 'Root to Leaf Paths');
  const tree = treeFromLevelOrder(treeText);
  const { steps, push: record, node, values, show } = treeRecorder(tree);

  const path: string[] = [];
  const completed: string[][] = [];
  const finished: string[] = [];
  const calls: TreePathCall[] = [];

  const pathText = () => values(path);
  const pathsText = () => `[${completed.map(p => values(p)).join(', ')}]`;
  const callText = (f: TreePathCall) => `dfs(${f.via === 'root' ? 'root' : `node.${f.via}`}, path, paths)`;

  /** a step: the node pointer is the running call's node; the paths view is a copy of everything so far */
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'tree'>, current: string | null, result?: string) => {
    const top = calls.at(-1);
    record(s, {
      ...(current ? { current } : {}),
      visited: [],
      pointers: top ? [{ name: 'node', node: top.node }] : [],
      paths: { path: [...path], completed: completed.map(p => [...p]), finished: [...finished], calls: calls.map(f => ({ ...f })) },
      ...(result ? { result: { kind: 'answer' as const, text: result } } : {}),
    });
  };

  /** dfs(node, path, paths) for the call calls[depth], as the listings write it */
  function dfs(depth: number) {
    const frame = calls[depth];
    const here = frame.node;

    const empty = here === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-null',
        variables: { call: callText(frame), node: show(here), depth: depth + 1 },
        result: empty ? 'true' : 'false',
        message: `${callText(frame)}: node == null?  node = ${show(here)} → ${empty}`,
        explanation: empty ? 'An empty child: there is no node here and no path through it.' : `Visit ${node(here!).value}.`,
        actionLabel: empty ? 'Empty child' : `Visit ${node(here!).value}`,
      },
      here
    );
    if (empty) {
      push(
        {
          type: 'return',
          codeRef: 'return-null',
          variables: { node: 'null', path: pathText(), depth: depth + 1 },
          message: `return — ${callText(frame)} ends`,
          explanation: depth === 0 ? 'The tree is empty, so it has no root-to-leaf path.' : 'Nothing to add: back to the caller, whose path is unchanged.',
          actionLabel: 'Return',
        },
        null
      );
      return;
    }

    const n = node(here!);
    path.push(here!);
    push(
      {
        type: 'update',
        codeRef: 'add',
        variables: { 'node.val': n.value, path: pathText() },
        message: `add ${n.value} to the path  →  path = ${pathText()}`,
        explanation: depth === 0 ? `Every path starts at the root, ${n.value}.` : `The path now runs from the root down to ${n.value}.`,
        actionLabel: `Add ${n.value}`,
      },
      here
    );

    const leaf = n.left === null && n.right === null;
    push(
      {
        type: 'condition',
        codeRef: 'check-leaf',
        variables: { 'node.left': show(n.left), 'node.right': show(n.right) },
        result: leaf ? 'true' : 'false',
        message: `leaf?  node.left = ${show(n.left)}, node.right = ${show(n.right)} → ${leaf}`,
        explanation: leaf
          ? `${n.value} has no children: it is a leaf, so the path ${pathText()} is complete.`
          : `${n.value} has ${n.left && n.right ? 'two children' : 'a child'}: the path goes on, left subtree first.`,
        actionLabel: leaf ? 'Leaf' : 'Not a leaf',
      },
      here
    );

    if (leaf) {
      completed.push([...path]);
      push(
        {
          type: 'update',
          codeRef: 'save',
          variables: { saved: pathText(), paths: pathsText() },
          message: `save a copy of ${pathText()}  →  paths = ${pathsText()}`,
          explanation: `A copy is saved, because the same path list keeps changing as the search goes on. That is path ${completed.length}.`,
          actionLabel: `Save path ${completed.length}`,
        },
        here
      );
    } else {
      for (const side of ['left', 'right'] as const) {
        const child = n[side];
        calls.push({ node: child, via: side });
        push(
          {
            type: 'update',
            codeRef: side === 'left' ? 'recurse-left' : 'recurse-right',
            variables: { call: `dfs(node.${side}, path, paths)`, [`node.${side}`]: show(child), path: pathText(), depth: depth + 2 },
            message: `call dfs(node.${side}, path, paths)  — node.${side} = ${show(child)}`,
            explanation: `${n.value}'s call waits while a new call explores its ${side} subtree${child ? ` (rooted at ${node(child).value})` : ', which is empty'} with the path ${pathText()}.`,
            actionLabel: side === 'left' ? 'Explore left' : 'Explore right',
          },
          child
        );
        dfs(depth + 1);
        calls.pop();
        push(
          {
            type: 'return',
            codeRef: side === 'left' ? 'left-returned' : 'right-returned',
            variables: { path: pathText(), paths: pathsText() },
            message: `dfs(node.${side}, path, paths) returned — back in ${n.value}'s call, path = ${pathText()}`,
            explanation: `${child ? `The ${side} subtree is done and its values were removed again` : `The empty ${side} child added nothing`}: the path is ${pathText()}, as it was before the call.${
              side === 'left' ? ' Now the right subtree.' : ''
            }`,
            actionLabel: `Back at ${n.value}`,
          },
          here
        );
      }
    }

    path.pop();
    finished.push(here!);
    push(
      {
        type: 'update',
        codeRef: 'backtrack',
        variables: { removed: n.value, path: pathText() },
        message: `remove ${n.value} from the path  →  path = ${pathText()}`,
        explanation:
          depth === 0
            ? `Backtrack: the root is removed too, and the search is over.`
            : `Backtrack: ${n.value} is removed, so the caller (${node(calls[depth - 1].node!).value}) gets back the path it passed in. ${n.value}'s call ends.`,
        actionLabel: `Remove ${n.value}`,
      },
      here
    );
  }

  push(
    {
      type: 'init',
      codeRef: 'init',
      variables: { root: levelOrderText(tree), paths: '[]', path: '[]' },
      message: `paths = [], path = []  — root = ${levelOrderText(tree)}`,
      explanation: 'path holds the values from the root down to the node being visited; paths collects a copy of it at each leaf.',
      actionLabel: 'Start',
    },
    tree.root
  );
  calls.push({ node: tree.root, via: 'root' });
  push(
    {
      type: 'update',
      codeRef: 'call-root',
      variables: { call: 'dfs(root, path, paths)', root: show(tree.root), depth: 1 },
      message: `call dfs(root, path, paths)  — root = ${show(tree.root)}`,
      explanation: tree.root ? `Start the depth-first search at the root, ${node(tree.root).value}.` : 'The tree is empty: the search starts with no node.',
      actionLabel: 'Start DFS',
    },
    tree.root
  );
  dfs(0);
  calls.pop();

  const found = completed.map(p => `[${p.map(id => node(id).value).join(', ')}]`);
  const text = found.length ? `${found.length} root-to-leaf path${found.length === 1 ? '' : 's'}: ${found.join(', ')}` : 'Empty tree: no root-to-leaf paths';
  const total = completed.reduce((k, p) => k + p.length, 0);
  push(
    {
      type: 'complete',
      codeRef: 'return',
      variables: { paths: pathsText(), count: found.length },
      message: `return paths — ${pathsText()}`,
      explanation: `Every node was visited once, and each of the ${found.length} leaves saved a copy of its path (${total} value${total === 1 ? '' : 's'} in all): O(n + L) time, O(n·h) at worst; O(h) space for the path and the call stack, besides the output.`,
      actionLabel: 'Return',
      outcomeText: text,
    },
    null,
    text
  );
  return steps;
}

export const treeRootToLeafPathsDefinition: AlgorithmDefinition = {
  id: 'tree-root-to-leaf-paths',
  name: 'Root to Leaf Paths',
  category: 'TREES',
  visual: 'tree',
  subtitle: 'Every path from the root to a leaf — DFS with backtracking.',
  description:
    'Finds every path from the root to a leaf of a binary tree, left to right. A recursive depth-first search adds each node to the current path, saves a copy of the path at a leaf, explores the left subtree and then the right one, and removes the node again before returning (backtracking), so each caller gets its own path back. It takes O(n + L) time, where L is the total number of values in the paths (O(n·h) at worst), O(h) space for the path and the call stack, and O(L) for the output.',
  complexity: {
    best: 'O(n + L)',
    average: 'O(n + L)',
    worst: 'O(n·h)',
    space: 'O(h)',
    bestFor: 'Listing every root-to-leaf path; the pattern behind path-sum problems (O(L) more for the output)',
  },
  defaultInput: [],
  inputSpec: ROOT_TO_LEAF_INPUT_SPEC,

  code: {
    c: `#include <stdlib.h>
#include <string.h>

struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};

void dfs(struct TreeNode *node, int *path, int *len, int **paths, int *sizes, int *count) {
    if (node == NULL) {
        return;
    }
    path[(*len)++] = node->val;
    if (node->left == NULL && node->right == NULL) {
        paths[*count] = malloc(*len * sizeof(int));
        memcpy(paths[*count], path, *len * sizeof(int));
        sizes[(*count)++] = *len;
    } else {
        dfs(node->left, path, len, paths, sizes, count);
        dfs(node->right, path, len, paths, sizes, count);
    }
    (*len)--;
}

// returns the number of paths; paths[k] holds sizes[k] values
int rootToLeafPaths(struct TreeNode *root, int **paths, int *sizes) {
    int path[100];
    int len = 0, count = 0;
    dfs(root, path, &len, paths, sizes, &count);
    return count;
}`,
    cpp: `#include <vector>
using namespace std;

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
};

void dfs(TreeNode* node, vector<int>& path, vector<vector<int>>& paths) {
    if (node == nullptr) {
        return;
    }
    path.push_back(node->val);
    if (node->left == nullptr && node->right == nullptr) {
        paths.push_back(path);
    } else {
        dfs(node->left, path, paths);
        dfs(node->right, path, paths);
    }
    path.pop_back();
}

vector<vector<int>> rootToLeafPaths(TreeNode* root) {
    vector<vector<int>> paths;
    vector<int> path;
    dfs(root, path, paths);
    return paths;
}`,
    java: `import java.util.ArrayList;
import java.util.List;

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

public class RootToLeafPaths {
    static void dfs(TreeNode node, List<Integer> path, List<List<Integer>> paths) {
        if (node == null) {
            return;
        }
        path.add(node.val);
        if (node.left == null && node.right == null) {
            paths.add(new ArrayList<>(path));
        } else {
            dfs(node.left, path, paths);
            dfs(node.right, path, paths);
        }
        path.remove(path.size() - 1);
    }

    public static List<List<Integer>> rootToLeafPaths(TreeNode root) {
        List<List<Integer>> paths = new ArrayList<>();
        List<Integer> path = new ArrayList<>();
        dfs(root, path, paths);
        return paths;
    }
}`,
    python: `${PY_TREE_NODE}
def dfs(node, path, paths):
    if node is None:
        return
    path.append(node.val)
    if node.left is None and node.right is None:
        paths.append(path.copy())
    else:
        dfs(node.left, path, paths)
        dfs(node.right, path, paths)
    path.pop()

def root_to_leaf_paths(root):
    paths = []
    path = []
    dfs(root, path, paths)
    return paths`,
  },

  // A recursive call and its return are one statement: the call step and the step after the call returns share its line.
  lineMap: {
    c: { init: 28, 'call-root': 30, 'check-null': 11, 'return-null': 12, add: 14, 'check-leaf': 15, save: 16, 'recurse-left': 20, 'left-returned': 20, 'recurse-right': 21, 'right-returned': 21, backtrack: 23, return: 31 },
    cpp: { init: 25, 'call-root': 27, 'check-null': 11, 'return-null': 12, add: 14, 'check-leaf': 15, save: 16, 'recurse-left': 18, 'left-returned': 18, 'recurse-right': 19, 'right-returned': 19, backtrack: 21, return: 28 },
    java: { init: 26, 'call-root': 28, 'check-null': 12, 'return-null': 13, add: 15, 'check-leaf': 16, save: 17, 'recurse-left': 19, 'left-returned': 19, 'recurse-right': 20, 'right-returned': 20, backtrack: 22, return: 29 },
    python: { init: 19, 'call-root': 21, 'check-null': 8, 'return-null': 9, add: 10, 'check-leaf': 11, save: 12, 'recurse-left': 14, 'left-returned': 14, 'recurse-right': 15, 'right-returned': 15, backtrack: 16, return: 22 },
  },
  // the setup is two declarations (C: the path buffer, then the counters); C copies a path in three statements
  lineSpans: { c: { init: 2, save: 3 }, cpp: { init: 2 }, java: { init: 2 }, python: { init: 2 } },

  generateSteps: generateRootToLeafSteps,
};
