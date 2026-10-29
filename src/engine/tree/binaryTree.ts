import type { TreeNodeView } from '../../types/algorithm';

/**
 * Binary trees given as LeetCode's level-order array, e.g. "[1, 2, 3, 4, 5, null, 6]": the root first, then the
 * children of each node that exists, left then right, level by level; "null" marks a missing child, and a null node
 * has no children listed. Trailing nulls may be left out. "[]" is the empty tree.
 *
 * Node ids follow the position of the value in the array (n0 is the root), so they stay the same for a whole trace.
 */

/** drawn as circles in a row per level: 15 nodes and 5 levels stay legible on a phone */
export const MAX_TREE_NODES = 15;
export const MAX_TREE_LEVELS = 5;
const MIN_VALUE = -999;
const MAX_VALUE = 999;

export interface BinaryTree {
  /** every node, in level order */
  readonly nodes: readonly TreeNodeView[];
  readonly root: string | null;
}

export type TreeParse = { ok: true; tree: BinaryTree } | { ok: false; message: string };

const nth = (k: number) => `Value ${k + 1}`;

/** parses and builds a tree from its level-order text; every problem is reported in words, nothing is guessed */
export function parseLevelOrderTree(text: string): TreeParse {
  const trimmed = text.trim();
  const opens = trimmed.startsWith('[');
  const closes = trimmed.endsWith(']');
  if (opens !== closes) return { ok: false, message: opens ? 'The tree is missing its closing "]".' : 'The tree is missing its opening "[".' };
  const inner = (opens ? trimmed.slice(1, -1) : trimmed).trim();
  if (inner === '') return { ok: true, tree: { nodes: [], root: null } };

  const tokens = inner.split(',').map(t => t.trim());
  const values: (number | null)[] = [];
  for (const [k, token] of tokens.entries()) {
    if (token === '') return { ok: false, message: `${nth(k)} is empty: separate values with single commas.` };
    if (/^null$/i.test(token)) {
      values.push(null);
      continue;
    }
    if (!/^-?\d+$/.test(token)) {
      return { ok: false, message: /^-?\d*\.\d+$/.test(token) ? `${nth(k)} ("${token}") is a decimal — only whole numbers are supported.` : `${nth(k)} ("${token}") is not a whole number or null.` };
    }
    const v = Number(token);
    if (v < MIN_VALUE || v > MAX_VALUE) return { ok: false, message: `${nth(k)} (${token}) is out of range: values go from ${MIN_VALUE} to ${MAX_VALUE}.` };
    values.push(v);
  }
  if (values[0] === null) {
    return { ok: false, message: values.length === 1 ? 'A tree of only null is empty: write [] for the empty tree.' : 'The root (value 1) cannot be null. Write [] for the empty tree.' };
  }

  // nodes are created in level order; each existing node takes the next two values as its children
  type Building = { id: string; value: number; left: string | null; right: string | null };
  const nodes: Building[] = [{ id: 'n0', value: values[0]!, left: null, right: null }];
  const waiting: Building[] = [nodes[0]];
  let k = 1;
  while (k < values.length) {
    const parent = waiting.shift();
    if (!parent) {
      return { ok: false, message: `${nth(k)} (${values[k] ?? 'null'}) has no parent: every node before it already has both children listed, or is null.` };
    }
    for (const side of ['left', 'right'] as const) {
      if (k >= values.length) break;
      const v = values[k];
      if (v !== null) {
        const child: Building = { id: `n${k}`, value: v, left: null, right: null };
        parent[side] = child.id;
        nodes.push(child);
        waiting.push(child);
      }
      k++;
    }
  }
  if (nodes.length > MAX_TREE_NODES) {
    return { ok: false, message: `Too many nodes (${nodes.length}). The visualizer shows at most ${MAX_TREE_NODES}.` };
  }
  const tree: BinaryTree = { nodes, root: 'n0' };
  const levels = treeLevels(tree);
  if (levels > MAX_TREE_LEVELS) {
    return { ok: false, message: `The tree is ${levels} levels deep. The visualizer shows at most ${MAX_TREE_LEVELS} levels.` };
  }
  return { ok: true, tree };
}

/** the tree for a level-order text that is known to be valid (the app validates first); a RangeError otherwise */
export function treeFromLevelOrder(text: string): BinaryTree {
  const parsed = parseLevelOrderTree(text);
  if (!parsed.ok) throw new RangeError(parsed.message);
  return parsed.tree;
}

export const nodeMap = (tree: BinaryTree): ReadonlyMap<string, TreeNodeView> => new Map(tree.nodes.map(n => [n.id, n]));

/** the number of levels (0 for the empty tree) */
export function treeLevels(tree: BinaryTree): number {
  const byId = nodeMap(tree);
  const depth = (id: string | null): number => (id === null ? 0 : 1 + Math.max(depth(byId.get(id)!.left), depth(byId.get(id)!.right)));
  return depth(tree.root);
}

export interface NodePosition {
  /** the node's column: its rank in an inorder walk (0 … n - 1), so a left subtree is always left of its parent */
  readonly x: number;
  /** its level, 0 at the root */
  readonly depth: number;
}

/** where each node is drawn: one column per node (inorder rank) and one row per level */
export function layoutTree(tree: BinaryTree): Record<string, NodePosition> {
  const byId = nodeMap(tree);
  const out: Record<string, NodePosition> = {};
  let column = 0;
  const walk = (id: string | null, depth: number) => {
    if (id === null) return;
    const node = byId.get(id)!;
    walk(node.left, depth + 1);
    out[id] = { x: column++, depth };
    walk(node.right, depth + 1);
  };
  walk(tree.root, 0);
  return out;
}

/** "[1, 2, 3, null, 4]": the tree written back in level order, trailing nulls left out */
export function levelOrderText(tree: BinaryTree): string {
  if (!tree.root) return '[]';
  const byId = nodeMap(tree);
  const out: (number | null)[] = [];
  const queue: (string | null)[] = [tree.root];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === null) {
      out.push(null);
      continue;
    }
    const node = byId.get(id)!;
    out.push(node.value);
    queue.push(node.left, node.right);
  }
  while (out.at(-1) === null) out.pop();
  return `[${out.map(v => (v === null ? 'null' : v)).join(', ')}]`;
}
