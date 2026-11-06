// ─── Language types ───────────────────────────────────────────────────────────
export type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';

export type AlgorithmCategory =
  | 'SORTING'
  | 'SEARCHING'
  | 'ARRAYS'
  | 'STRINGS'
  | 'LINKED_LIST'
  | 'STACK_QUEUE'
  | 'TREES'
  | 'GRAPHS'
  | 'DP'
  | 'GREEDY'
  | 'BACKTRACKING'
  | 'BIT_MANIPULATION'
  | 'FUNDAMENTALS';

export type AlgorithmId =
  | 'bubble-sort'
  | 'selection-sort'
  | 'insertion-sort'
  | 'merge-sort'
  | 'quick-sort'
  | 'heap-sort'
  | 'linear-search'
  | 'binary-search'
  | 'jump-search'
  | 'two-pointer'
  | 'sliding-window'
  | 'prefix-sum'
  | 'reverse-linked-list'
  | 'll-build'
  | 'll-traverse'
  | 'll-insert-head'
  | 'll-insert-tail'
  | 'll-insert-at'
  | 'll-delete-head'
  | 'll-delete-tail'
  | 'll-delete-at'
  | 'll-search'
  | 'detect-cycle'
  | 'merge-lists'
  | 'stack'
  | 'queue'
  | 'monotonic-stack'
  | 'binary-tree'
  | 'bst'
  | 'tree-traversals'
  | 'bfs'
  | 'dfs'
  | 'dijkstra'
  | 'fibonacci'
  | 'knapsack'
  | 'lcs'
  | 'activity-selection'
  | 'backtracking-n-queens'
  | 'prime-check'
  | 'swap-two-numbers'
  | 'two-sum'
  | 'majority-element'
  | 'container-most-water'
  | 'merge-sorted-array'
  | 'trapping-rain-water'
  | 'valid-perfect-square'
  | 'sqrt-x'
  | 'arranging-coins'
  | 'roman-to-integer'
  | 'longest-common-prefix'
  | 'valid-parentheses'
  | 'find-first-occurrence'
  | 'length-of-last-word'
  | 'add-binary'
  | 'valid-palindrome'
  | 'valid-palindrome-ii'
  | 'tree-inorder'
  | 'tree-preorder'
  | 'tree-postorder'
  | 'tree-level-order'
  | 'remove-duplicates-sorted'
  | 'maximum-subarray'
  | 'three-sum'
  | 'four-sum'
  | 'print-all-pairs'
  | 'print-subarrays'
  | 'build-bst'
  | 'build-bst-recursive'
  | 'bst-print-in-range'
  | 'tree-root-to-leaf-paths'
  | 'tree-validate-bst'
  | 'bst-mirror'
  | 'bst-balance'
  | 'bitwise-and'
  | 'bitwise-or'
  | 'bitwise-xor'
  | 'bitwise-not'
  | 'bitwise-left-shift'
  | 'bitwise-right-shift'
  | 'bit-check-even'
  | 'bit-get-ith'
  | 'bit-set-ith'
  | 'bit-clear-ith'
  | 'bit-update-ith'
  | 'bit-clear-last-i'
  | 'bit-clear-range'
  | 'backtracking-subsets'
  | 'backtracking-permutations';

// ─── Execution Step ────────────────────────────────────────────────────────────
// codeRef is a semantic string key (e.g. "loop-condition", "compare-target")
// The actual line number is resolved at render time:
//   algorithmDef.lineMap[selectedLanguage][step.codeRef]
// This ensures language switching NEVER requires re-generating steps.

export type StepType =
  | 'init'
  | 'loop-start'
  | 'loop-condition'
  | 'condition'
  | 'compare'
  | 'assign'
  | 'increment'
  | 'decrement'
  | 'swap'
  | 'update'
  | 'return'
  | 'found'
  | 'not-found'
  | 'sorted'
  | 'complete';

// ─── Linked-list snapshots ─────────────────────────────────────────────────────
// One immutable snapshot per step (see src/engine/linkedList/listSnapshot.ts). Node ids are stable for the whole
// trace (n1, n2, …, never reused), so a node keeps its identity while links around it change.

export interface ListNodeSnapshot {
  readonly id: string;
  readonly value: number;
  /** id of the next node, or null for a NULL next pointer */
  readonly next: string | null;
}

/** The single link, HEAD or TAIL change that the step's statement made (absent when it changed none). */
export type ListChange =
  | { readonly kind: 'next'; readonly node: string; readonly from: string | null; readonly to: string | null }
  | { readonly kind: 'head' | 'tail'; readonly from: string | null; readonly to: string | null };

export interface ListSnapshot {
  /** every node that currently exists (created and not freed), in creation order */
  readonly nodes: readonly ListNodeSnapshot[];
  readonly head: string | null;
  readonly tail: string | null;
  /** named code variables (curr, prev, node, …) → node id, or null for a NULL pointer */
  readonly pointers: Readonly<Record<string, string | null>>;
  /** nodes that exist but are deliberately outside the list (a new node before it is linked in, an unlinked node
   *  before it is freed) */
  readonly detached: readonly string[];
  readonly changed?: ListChange;
  /** highest node number ever allocated in this trace (n1 … n<lastId>), so a freed node's id is never reused */
  readonly lastId: number;
}

export interface ExecutionStep {
  id: number;
  type: StepType;

  /** Semantic key → resolved to a line number via lineMap[lang][codeRef] */
  codeRef?: string;

  /** Current snapshot of the data structure */
  state: number[];

  /** Named variables at this step (i, j, key, target, etc.) */
  variables?: Record<string, unknown>;

  /** Indices of currently active/highlighted elements */
  indices?: number[];

  /** Named pointer values (low, high, mid, etc.) */
  pointers?: Record<string, number>;

  /** For 'compare' / 'condition' steps */
  comparedValues?: { val1: number; val2: number };

  /** Indices that are permanently sorted (already in their final position) / found */
  sortedIndices?: number[];

  /**
   * Indices that are sorted relative to each other but NOT yet in their final position (Insertion Sort's growing
   * prefix: a later key can still shift them). Never overlaps sortedIndices; shown as "sorted so far".
   */
  sortedPrefixIndices?: number[];

  /**
   * Indices holding the result built so far, in place (Remove Duplicates' unique prefix). Shown as "kept", so the
   * prefix reads apart from the rest of the array. Never overlaps sortedIndices.
   */
  keptIndices?: number[];

  /** The condition result for loop/condition steps */
  result?: 'true' | 'false';

  /** Short human-readable action label */
  actionLabel?: string;

  /** Primary human-readable message */
  message: string;

  /** Longer explanation shown in the panel */
  explanation?: string;

  /**
   * Temporary buffers that are NOT part of the main array (e.g. Merge Sort's left/right copies).
   * `cursor` is the buffer index the step is currently looking at (may equal values.length when exhausted).
   * The visualizer shows these next to the bars instead of highlighting an unrelated bar.
   */
  buffers?: {
    name: string;
    values: number[];
    cursor?: number;
    /** what the row is called on screen; default "<name> buffer" (Merge Sort's left / right) */
    label?: string;
    /** the cursor's name on screen; default i for the left buffer, j otherwise */
    cursorLabel?: string;
  }[];

  /**
   * Linked-list algorithms only (visual: 'linked-list'): the whole list at this step, as an immutable snapshot with
   * stable node ids. `state` still holds the values read from head, so generic consumers keep working.
   */
  list?: ListSnapshot;

  /**
   * Number algorithms only (visual: 'numbers'): the named values shown as cards at this step. `state` still holds the
   * input values ([n] or [a, b]) as they are at this step, so generic consumers keep working.
   */
  numbers?: NumberView;

  /**
   * Array algorithms: named values the algorithm keeps beside the array (Two Sum's complement, Boyer–Moore's candidate
   * and count), shown as cards next to the bars. Each step carries the values as they are after it.
   */
  tracker?: readonly NumberCell[];

  /** Array algorithms that keep a hash map (Two Sum): its entries after this step, and what this step did with it */
  hashMap?: HashMapView;

  /**
   * The last ('complete') step only: what the run found, in words (e.g. the pair and its indices). Replaces the
   * generic text of the outcome banner; the outcome itself is still derived from the trace.
   */
  outcomeText?: string;

  /**
   * Container With Most Water: the container this step is looking at (between `left` and `right`, as high as the
   * shorter line) and the best one found so far. Drawn over the bars; `level` is a height in array values.
   */
  container?: ContainerView;

  /**
   * Trapping Rain Water: the water each bar holds, as decided so far (amounts[i] units above bar i, 0 where none or
   * not decided yet), and the bar this step decides. Drawn over the bars, in the bars' own height scale.
   */
  water?: WaterView;

  /**
   * Text algorithms only (visual: 'text'): the strings, pointers, stack and values of this step. `state` is empty: a
   * text algorithm has no array.
   */
  text?: TextView;

  /**
   * Tree algorithms only (visual: 'tree'): the tree, the node this step works on, the nodes visited so far (in order),
   * the stack or queue, and the pointer variables. `state` is empty: a tree algorithm has no array.
   */
  tree?: TreeView;

  /**
   * Board algorithms only (visual: 'board', N-Queens): the board, the queens placed, the cell this step works on and
   * the solutions found. `state` is empty: a board algorithm has no array.
   */
  board?: BoardView;

  /**
   * Bit manipulation only (visual: 'bits'): the 32-bit rows of this step and what each bit is doing. `state` is empty: a
   * bit algorithm has no array.
   */
  bits?: BitView;

  /**
   * Subsets only (visual: 'decision-tree'): the include / exclude tree, the current subset, the calls in progress and the
   * subsets saved so far. `state` is empty: the input array is shown by the visualizer itself.
   */
  subsets?: SubsetsView;

  /**
   * Find All Permutations only (visual: 'decision-tree'): the decision tree, used[], the current permutation, the calls
   * in progress and the permutations saved so far. `state` is empty: the input array is shown by the visualizer itself.
   */
  permutations?: PermutationsView;

  /** Extra metadata */
  extraInfo?: {
    pivotIndex?: number;
    subRange?: [number, number];
  };
}

/** One named value shown by the number visualizer (n, i, n % i; a, b, temp). */
export interface NumberCell {
  readonly name: string;
  /**
   * null: not set yet (e.g. temp before it is assigned). A string holds an exact whole number too large for a JS
   * number (a 64-bit product such as mid × mid near 2^31); it stays JSON-serialisable, unlike a bigint.
   */
  readonly value: number | string | null;
  /** 'changed': this step's statement wrote it; 'current': it is being read or tested */
  readonly role?: 'changed' | 'current';
}

export interface NumberView {
  readonly cells: readonly NumberCell[];
  /** Prime checking: every divisor tried so far, in order, with n % divisor */
  readonly divisorChecks?: readonly { readonly divisor: number; readonly remainder: number }[];
  /** Binary search over whole numbers (Sqrt(x), Valid Perfect Square, Arranging Coins): the range still searched */
  readonly search?: NumberSearchView;
  /**
   * the final answer, on the last step only: 'yes' / 'no' for a true / false question (is it a perfect square?),
   * 'answer' for a computed value (the square root, the number of rows)
   */
  readonly result?: { readonly kind: 'prime' | 'not-prime' | 'swapped' | 'yes' | 'no' | 'answer'; readonly text: string };
}

/** One probe of a binary search over whole numbers: the mid tried, the value computed from it and how it compared. */
export interface NumberSearchProbe {
  readonly mid: number;
  /** what mid gives (mid × mid, or mid × (mid + 1) / 2): exact, as a string when beyond a JS number's exact range */
  readonly value: number | string;
  /** how that value compares with the target */
  readonly relation: '<' | '=' | '>';
}

export interface NumberSearchView {
  /** the range searched at the start (lo = 0, hi = the input) */
  readonly from: number;
  readonly to: number;
  /** the range still searched; lo > hi once the search is over */
  readonly lo: number;
  readonly hi: number;
  /** the middle being tried at this step, if any */
  readonly mid?: number;
  /** what the computed value is compared with (x, num or n), and what it is called ("mid × mid") */
  readonly target: number;
  readonly valueLabel: string;
  /** every probe so far, in order */
  readonly probes: readonly NumberSearchProbe[];
}

/**
 * How one character of a text row is shown at a step: 'current' is being read, 'compare' is what it is compared
 * with, 'match' / 'mismatch' the outcome of a comparison (or a column / pair already confirmed), 'skipped' passed over
 * (a space, a non-alphanumeric character), 'done' already processed.
 */
export type CharMark = 'current' | 'compare' | 'match' | 'mismatch' | 'skipped' | 'done';

/** One string shown as a row of character cells. */
export interface TextRow {
  /** what the row is called on screen: s, haystack, needle, strs[1], result */
  readonly name: string;
  readonly text: string;
  /** empty columns before the first character, so rows line up (the needle under its alignment, binary digits by place) */
  readonly offset?: number;
  /** named positions in the row; -1 or text.length are drawn off the row (before or after it) */
  readonly pointers?: readonly { readonly name: string; readonly index: number }[];
  readonly marks?: readonly { readonly index: number; readonly mark: CharMark }[];
}

export interface TextView {
  readonly rows: readonly TextRow[];
  /** named values beside the strings (total, carry, length, the prefix so far) */
  readonly cells?: readonly NumberCell[];
  /** Valid Parentheses: the stack, bottom first, and what this step did with it */
  readonly stack?: { readonly items: readonly string[]; readonly action?: 'push' | 'pop' | 'mismatch' | 'empty' };
  /** the final answer, on the last step only */
  readonly result?: { readonly kind: 'yes' | 'no' | 'answer'; readonly text: string };
}

/** One node of a binary tree; ids are stable for the whole trace (n0 is the root, by input position). */
export interface TreeNodeView {
  readonly id: string;
  readonly value: number;
  readonly left: string | null;
  readonly right: string | null;
}

export interface TreeView {
  readonly nodes: readonly TreeNodeView[];
  readonly root: string | null;
  /** the node this step works on (pops, visits, peeks at…) */
  readonly current?: string;
  /** visited nodes, in visit order: the traversal output so far */
  readonly visited: readonly string[];
  /** DFS: the stack of node ids, bottom first, and what this step did with it */
  readonly stack?: { readonly items: readonly string[]; readonly action?: 'push' | 'pop' | 'peek' };
  /** Level order: the queue of node ids, front first, and what this step did with it */
  readonly queue?: { readonly items: readonly string[]; readonly action?: 'enqueue' | 'dequeue' };
  /** pointer variables (curr, node, peek, last): a node id, or null for a null pointer */
  readonly pointers?: readonly { readonly name: string; readonly node: string | null }[];
  /** the final answer, on the last step only */
  readonly result?: { readonly kind: 'answer'; readonly text: string };
  /**
   * Building a binary search tree only: the tree grows step by step (nodes holds the nodes inserted so far), and this
   * says how the value being inserted finds its place. The traversals leave it out.
   */
  readonly build?: TreeBuildView;
  /** Print in Range (BST) only: the range, what each node turned out to be, and the recursive calls in progress */
  readonly range?: TreeRangeView;
  /** Root to Leaf Paths only: the path being built, the paths found and the recursive calls in progress */
  readonly paths?: TreePathsView;
  /** Validate Binary Search Tree only: the bounds of each call, the nodes checked so far and the first invalid node */
  readonly validate?: TreeValidateView;
  /**
   * Mirror a BST only: the tree changes step by step (nodes holds the links as they stand, each node's children
   * swapped once its `node.right = temp` has run), the swap in progress and the recursive calls in progress.
   */
  readonly mirror?: TreeMirrorView;
  /**
   * Convert BST to Balanced BST only: stage 1 walks the input tree (nodes is the input, visited the inorder order);
   * stages 2 and 3 build a new tree (nodes holds the nodes created so far, each id b<k> for the value at index k of
   * the sorted array, linked to its parent once the call that created it returns).
   */
  readonly balance?: TreeBalanceView;
}

/** Convert BST to Balanced BST: an inorder walk into a sorted array, then a balanced tree built from its middles. */
export interface TreeBalanceView {
  /** inorder: collecting the values; build: building the balanced tree; done: the balanced tree is returned */
  readonly stage: 'inorder' | 'build' | 'done';
  /** the input tree, in level order */
  readonly original: string;
  /** the sorted array: the values appended so far (stage 1), then all of them */
  readonly values: readonly number[];
  /** stage 1: the inorder(...) calls in progress, outermost first */
  readonly inorderCalls: readonly TreeBalanceInorderCall[];
  /** stages 2 and 3: the buildBalanced(...) calls in progress, outermost first */
  readonly buildCalls: readonly TreeBalanceBuildCall[];
  /** the new nodes created so far, in creation order */
  readonly created: readonly string[];
  /** the new nodes whose call has returned: their whole subtree is built */
  readonly completed: readonly string[];
  /** the level of each new node in the new tree (it is drawn there before its parent links it) */
  readonly depths: Readonly<Record<string, number>>;
}

/** One inorder(node) call of stage 1. */
export interface TreeBalanceInorderCall {
  readonly node: string | null;
  readonly via: 'root' | 'left' | 'right';
}

/** One buildBalanced(values, left, right) call: the subtree for values[left..right]. */
export interface TreeBalanceBuildCall {
  readonly left: number;
  readonly right: number;
  readonly via: 'root' | 'left' | 'right';
  /** once computed: left + (right - left) / 2 */
  readonly mid?: number;
  /** once created: the new node for values[mid] */
  readonly node?: string;
  /** set on the step the call returns: the node it returns, or null for an empty range */
  readonly returns?: string | null;
}

/** Mirror a BST: recursive DFS that swaps the children of every node, then mirrors both subtrees. */
export interface TreeMirrorView {
  /** nodes whose children have been swapped, in swap order (preorder of the mirrored tree) */
  readonly swapped: readonly string[];
  /** nodes whose mirror() call has returned: their whole subtree is mirrored */
  readonly completed: readonly string[];
  /** the swap at the running call's node, while its three statements run (temp = left, left = right, right = temp) */
  readonly swap?: TreeMirrorSwap;
  /** the mirror(...) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly TreeMirrorCall[];
  /** the input tree, in level order */
  readonly original: string;
  /** the tree as its links stand after this step, in level order */
  readonly shape: string;
}

/**
 * The swap of one node's children. TreeView.nodes keeps the node's original links until `node.right = temp` has run;
 * left and right are its links as they really are at this step (after `node.left = node.right` both are the original
 * right child, and the original left subtree is reachable only through temp).
 */
export interface TreeMirrorSwap {
  readonly node: string;
  readonly originalLeft: string | null;
  readonly originalRight: string | null;
  /** the statement that has just run: temp = node.left, node.left = node.right or node.right = temp */
  readonly phase: 'temp' | 'left' | 'right';
  readonly temp: string | null;
  readonly left: string | null;
  readonly right: string | null;
}

/** One mirror(node) call. */
export interface TreeMirrorCall {
  /** the subtree this call works on: its root, or null for an empty subtree (the call returns null at once) */
  readonly node: string | null;
  /** what the caller passed: the tree's root, or its node's left / right child (after the swap) */
  readonly via: 'root' | 'left' | 'right';
  /** set on the step the call returns (it returns its node, or null) */
  readonly returned?: boolean;
}

/**
 * Validate Binary Search Tree: recursive DFS where each call gets the exclusive range (min, max) its ancestors allow.
 * Each node's status: checked and in range (its subtrees still being checked), its whole subtree validated, or the
 * first node found outside its range (validation stops there).
 */
export interface TreeValidateView {
  /** nodes whose value was inside their allowed range, in check order */
  readonly passed: readonly string[];
  /** nodes whose call returned true: their whole subtree is a valid BST */
  readonly completed: readonly string[];
  /** the first node outside its allowed range */
  readonly invalid?: string;
  /** the ancestor whose value is the bound the invalid node breaks */
  readonly conflict?: string;
  /** why the invalid node breaks the rule, in words */
  readonly violation?: string;
  /** the isValidBST(...) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly TreeValidateCall[];
  /** the answer, on the last step only */
  readonly verdict?: 'valid' | 'invalid';
}

/** One isValidBST(node, min, max) call: the node must satisfy min < node.val < max. */
export interface TreeValidateCall {
  /** the subtree this call works on: its root, or null for an empty subtree (the call returns true at once) */
  readonly node: string | null;
  /** what the caller passed: the tree's root, or its node's left / right child */
  readonly via: 'root' | 'left' | 'right';
  /** the exclusive lower bound; null is −∞ (no ancestor sets one) */
  readonly min: number | null;
  /** the exclusive upper bound; null is +∞ */
  readonly max: number | null;
  /** the ancestor whose value is min (the nearest one this subtree is to the right of); null for −∞ */
  readonly minFrom: string | null;
  /** the ancestor whose value is max (the nearest one this subtree is to the left of); null for +∞ */
  readonly maxFrom: string | null;
  /** set on the step the call returns: what it returns */
  readonly returns?: boolean;
}

/** Root to Leaf Paths: the DFS with backtracking, as each step leaves it. */
export interface TreePathsView {
  /** the current path, root first (the nodes whose values are in `path`) */
  readonly path: readonly string[];
  /** the root-to-leaf paths saved so far, in the order found (left to right), each root first */
  readonly completed: readonly (readonly string[])[];
  /** nodes whose call has finished (their value has been removed from the path again) */
  readonly finished: readonly string[];
  /** the dfs(...) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly TreePathCall[];
}

/** One dfs(node, path, paths) call. */
export interface TreePathCall {
  /** the subtree this call works on: its root, or null for an empty child (the call returns at once) */
  readonly node: string | null;
  /** what the caller passed: the tree's root, or its node's left / right child */
  readonly via: 'root' | 'left' | 'right';
}

/**
 * Print in Range (BST): the nodes printed are view.visited (in print order, which is ascending). Each node's status
 * otherwise: checked and found outside [low, high], or never visited because its subtree was pruned.
 */
export interface TreeRangeView {
  readonly low: number;
  readonly high: number;
  /** nodes whose value was checked and is outside [low, high] (not printed), in check order */
  readonly outside: readonly string[];
  /** nodes of the subtrees skipped by pruning: none of them can be in range, so none is visited */
  readonly pruned: readonly string[];
  /** the printInRange(...) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly TreeRangeCall[];
}

/** One printInRange(node, low, high) call. */
export interface TreeRangeCall {
  /** the subtree this call works on: its root, or null for an empty subtree (the call returns at once) */
  readonly node: string | null;
  /** what the caller passed: the tree's root, or its node's left / right child */
  readonly via: 'root' | 'left' | 'right';
}

export interface TreeBuildView {
  /** the input values, in insertion order (the same array on every step) */
  readonly values: readonly number[];
  /** the input position this step works on; null before the first value and after the last */
  readonly index: number | null;
  /** the nodes the value has been compared with so far, root first */
  readonly path: readonly string[];
  /** the empty child the value goes into (found, not yet linked); parent null: the empty tree's root */
  readonly slot?: { readonly parent: string | null; readonly side: 'left' | 'right' | 'root' };
  /** the node this step created and linked into the tree */
  readonly inserted?: string;
  /** the node that already holds the value: a duplicate is skipped */
  readonly duplicate?: string;
  /** input positions skipped as duplicates so far */
  readonly skipped: readonly number[];
  /** Recursive build only: the insert(...) calls in progress, outermost first (the last is the one running) */
  readonly calls?: readonly TreeCallFrame[];
  /** Recursive build only: the node the base case created and returned, not yet linked by its caller */
  readonly created?: TreeNodeView;
}

/** One insert(node, value) call of the recursive build (the value is the one being inserted). */
export interface TreeCallFrame {
  /** the subtree this call works on: its root node, or null for an empty subtree (the base case) */
  readonly node: string | null;
  /** what the caller passed: buildBST's root, or the caller's node.left / node.right */
  readonly via: 'root' | 'left' | 'right';
  /** set once the call returns: the subtree root it hands back to its caller */
  readonly returns?: string;
}

/** A container between two lines: its ends (indices), its water level (the shorter line's height) and its area. */
export interface ContainerSpan {
  readonly left: number;
  readonly right: number;
  readonly level: number;
  readonly area: number;
}

export interface WaterView {
  readonly amounts: readonly number[];
  /** the bar whose water this step decides (adds, or finds there is none) */
  readonly current?: number;
}

export interface ContainerView {
  /** the pair being evaluated (absent once the pointers have met) */
  readonly current?: ContainerSpan;
  /** the largest container found so far (absent before the first area is computed) */
  readonly best?: ContainerSpan;
}

/** A hash map at one step: its entries in insertion order, and the lookup / write the step performed. */
export interface HashMapView {
  /** e.g. "seen" */
  readonly name: string;
  /** what keys and values mean, e.g. "value" → "index" */
  readonly keyLabel: string;
  readonly valueLabel: string;
  readonly entries: readonly { readonly key: number; readonly value: number }[];
  /** this step looked up `key`; `found` says whether the map had it */
  readonly lookup?: { readonly key: number; readonly found: boolean };
  /** this step wrote `key`: a new entry, or a new value for a key already in the map */
  readonly write?: { readonly key: number; readonly kind: 'insert' | 'update' };
}

// ─── Algorithm Definition (single source of truth) ───────────────────────────
// Each algorithm owns its code strings, lineMaps, and step generator.
// The visualizer NEVER falls back to another algorithm's code.

export interface AlgorithmCode {
  c: string;
  cpp: string;
  java: string;
  python: string;
}

/** Maps codeRef strings → line numbers (1-based) for each language */
export interface AlgorithmLineMap {
  c: Record<string, number>;
  cpp: Record<string, number>;
  java: Record<string, number>;
  python: Record<string, number>;
}

export interface AlgorithmComplexity {
  best: string;
  average: string;
  worst: string;
  space: string;
  bestFor?: string;
}

/**
 * What an algorithm needs from the user's input. Everything here is declarative; the UI, the store and
 * inputParsing.ts read it, and generators never transform the array to satisfy it.
 */
export interface AlgorithmInputSpec {
  /** The algorithm takes a target; it is passed to generateSteps as params.target */
  target?: {
    label: string;
    hint: string;
    /** Example value shown for the default input (editable by the user) */
    defaultValue: number;
  };
  /** The array must already be sorted ascending (non-decreasing); the user's order is never changed silently */
  sortedRequired?: boolean;
  /** Array algorithms: the fewest values the algorithm accepts (Container With Most Water needs two lines) */
  minLength?: number;
  /** Array algorithms: the most values the algorithm accepts, when it is fewer than the visualizer's maximum */
  maxLength?: number;
  /** Array algorithms: no value may appear twice (Subsets: a repeat would give the same subset twice) */
  distinctValues?: boolean;
  /** Array algorithms: the smallest value allowed (heights cannot be negative: 0) */
  minValue?: number;
  /** What the main array field is called when "Array" would be ambiguous (Merge Sorted Array: "nums1") */
  arrayLabel?: string;
  /**
   * The algorithm takes a second array (Merge Sorted Array's nums2); it is passed to generateSteps as params.second.
   * It may be empty; it follows sortedRequired like the main array, and the two together hold at most the
   * visualizer's maximum number of values.
   */
  secondArray?: {
    label: string;
    hint: string;
    /** the example shown with the default input */
    defaultValue: readonly number[];
  };
  /** Array algorithms: the range Randomize draws values from, when the default would rarely show the algorithm's
   *  point (Remove Duplicates needs repeated values: 1 to 9) */
  randomValues?: readonly [number, number];
  /** Linked-list operations: the value to insert or search for; passed to generateSteps as params.value */
  value?: {
    label: string;
    hint: string;
    defaultValue: number;
  };
  /**
   * Linked-list operations: a position in the list; passed as params.index. Validated before execution:
   * 'insert' accepts 0..length (inserting at length appends), 'delete' accepts 0..length-1.
   */
  index?: {
    label: string;
    hint: string;
    defaultValue: number;
    bound: 'insert' | 'delete';
  };
  /** The operation adds a node, so the input list must leave room for it (at most MAX_LIST_SIZE - 1 nodes) */
  addsNode?: boolean;
  /**
   * Number algorithms (visual: 'numbers'): the named whole numbers the user enters, in order. They are passed as the
   * input array ([n], or [a, b]); each must be an integer from min to max (inclusive).
   */
  numbers?: readonly NumberField[];
  /**
   * Number algorithms: two of the fields (by position) are the ends of a range: low must not be greater than high. A
   * problem is reported on the high field.
   */
  numberRange?: { readonly low: number; readonly high: number };
  /** Number algorithms: complete inputs (one value per field) that Randomize picks from, instead of random values */
  numberExamples?: readonly (readonly number[])[];
  /**
   * Text algorithms (visual: 'text'): the strings the user enters, in order; passed to generateSteps as params.texts
   * (one string per field, exactly as typed). The main input array is always empty.
   */
  texts?: readonly TextField[];
  /** Text algorithms: complete inputs (one string per field) that Randomize picks from */
  textExamples?: readonly (readonly string[])[];
  /**
   * Text algorithms: two of the fields (by position) are the ends of a range, both whole numbers: low must not be
   * greater than high. A problem is reported on the high field.
   */
  textRange?: { readonly low: number; readonly high: number };
}

/** One string input of a text algorithm. */
export interface TextField {
  label: string;
  hint: string;
  defaultValue: string;
  minLength: number;
  maxLength: number;
  /** the characters allowed, as a regular expression for one character, and how that is said ("I, V, X, L, C, D or M") */
  chars: { readonly pattern: string; readonly description: string };
  /**
   * The value is a list separated by commas (Longest Common Prefix's strs): each item is trimmed, may be empty, and is
   * checked against chars and itemMaxLength; minLength / maxLength then count items, not characters.
   */
  list?: { readonly itemMaxLength: number };
  /** a rule beyond the characters: a canonical Roman numeral, a binary number without leading zeros, at least one word */
  rule?: 'roman-numeral' | 'binary-number' | 'has-word' | 'level-order-tree' | 'level-order-bst' | 'whole-number';
}

export interface NumberField {
  label: string;
  hint: string;
  min: number;
  max: number;
  /** range Randomize picks from (defaults to min..max) */
  random?: readonly [number, number];
}

export type VisualKind = 'array' | 'linked-list' | 'numbers' | 'text' | 'tree' | 'board' | 'bits' | 'decision-tree';

/**
 * Subsets: the recursion as one step leaves it. A node of the decision tree is named by its path from the root: '' is the
 * root, then I (include) or E (exclude) for each element decided, so 'IE' is dfs(2) after including nums[0] and skipping
 * nums[1]. The whole tree follows from the array's length, so only what has happened is stored.
 */
export interface SubsetsView {
  readonly nums: readonly number[];
  /** the index of the element this step decides on; null at the start and the end, and when all are decided */
  readonly index: number | null;
  /** the elements chosen so far */
  readonly current: readonly number[];
  /** the value this step removed from current (backtracking) */
  readonly removed?: number;
  /** the value this step added to current */
  readonly added?: number;
  /** the dfs(...) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly SubsetsCall[];
  /** the node of the running call; null before the first call and after the last */
  readonly node: string | null;
  /** nodes whose call has returned */
  readonly finished: readonly string[];
  /** the subsets saved so far, in order; each is a copy, never changed */
  readonly subsets: readonly (readonly number[])[];
  /** for each saved subset, the node it was saved for */
  readonly savedAt: readonly string[];
  /** dfs calls made so far: 2^(n+1) - 1 in the end */
  readonly callsMade: number;
  /** elements copied into saved subsets so far: n × 2^(n-1) in the end. A separate cost from the calls */
  readonly elementsCopied: number;
  /** the final answer, on the last step only */
  readonly result?: { readonly text: string };
}

/**
 * Find All Permutations: the recursion as one step leaves it. A node of the decision tree is named by the input indices
 * chosen to reach it: '' is the root, and '20' is the call after choosing nums[2], then nums[0]. It has one child per
 * index not in its name, so the whole tree follows from the array's length and only what has happened is stored.
 */
export interface PermutationsView {
  readonly nums: readonly number[];
  /** the index of the element this step looks at; null when it looks at none */
  readonly index: number | null;
  /** used[i]: nums[i] is in current */
  readonly used: readonly boolean[];
  /** the elements chosen so far, in order */
  readonly current: readonly number[];
  /** the value this step pushed onto current */
  readonly added?: number;
  /** the value this step popped from current (backtracking) */
  readonly removed?: number;
  /** the value this step found already used, and skipped */
  readonly skipped?: number;
  /** the dfs(...) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly PermutationsCall[];
  /** the node of the running call; null before the first call and after the last */
  readonly node: string | null;
  /** nodes whose call has returned */
  readonly finished: readonly string[];
  /** the permutations saved so far, in order; each is a copy, never changed */
  readonly permutations: readonly (readonly number[])[];
  /** for each saved permutation, the node it was saved at */
  readonly savedAt: readonly string[];
  /** dfs calls made so far */
  readonly callsMade: number;
  /** used[i] tests made so far: all n elements, in each call that is not finished */
  readonly usedChecks: number;
  /** elements copied into saved permutations so far: n × n! in the end */
  readonly elementsCopied: number;
  /** the final answer, on the last step only */
  readonly result?: { readonly text: string };
}

/** One dfs(nums, used, current, result) call of Find All Permutations. Its depth is its place on the stack. */
export interface PermutationsCall {
  /** the node of the decision tree this call is */
  readonly node: string;
  /** the input index its caller chose; null for the first call */
  readonly chosen: number | null;
  /** set on the step the call returns */
  readonly returning?: boolean;
}

/** One dfs(nums, i, current, result) call. */
export interface SubsetsCall {
  readonly i: number;
  /** the node of the decision tree this call is */
  readonly node: string;
  /** how its caller got here */
  readonly via: 'root' | 'include' | 'exclude';
  /** set on the step the call returns */
  readonly returning?: boolean;
}

/**
 * What a bit does at this step: left alone, picked out by the operation, written as 1 or as 0, inverted, moved by a
 * shift, or not worked out yet (a result still being evaluated bit by bit).
 */
export type BitState = 'unchanged' | 'selected' | 'set' | 'cleared' | 'flipped' | 'shifted' | 'pending';

/** One 32-bit value drawn as a row of bits. Position 0 is the rightmost (least significant) bit. */
export interface BitRow {
  /** a stable name for the row: a, b, n, mask, result */
  readonly id: string;
  /** how the row is labelled: "a", "1 << i", "a & b" */
  readonly label: string;
  readonly role: 'input' | 'mask' | 'intermediate' | 'output';
  /** the bits, read as signed 32-bit two's complement */
  readonly value: number;
  /** the state of each position that is not 'unchanged' */
  readonly states?: Readonly<Record<number, BitState>>;
  /** this position and the ones above it are not worked out yet: they are drawn as pending */
  readonly pendingFrom?: number;
}

/** Bit manipulation: the rows of one step. */
export interface BitView {
  /** every row has this many bits */
  readonly width: 32;
  /** the expression being evaluated, as the algorithm's formula writes it */
  readonly operation: string;
  /** how the values are read, in words */
  readonly interpretation: string;
  readonly rows: readonly BitRow[];
  /** the bit position this step works on */
  readonly position?: number;
  /** Shifts: the bits pushed out so far, the ones lost first listed first */
  readonly discarded?: readonly (0 | 1)[];
  /** the final answer, on the last step only */
  readonly result?: { readonly text: string };
}

/** N-Queens: the board as one step leaves it. Rows and columns count from 0. */
export interface BoardView {
  /** the board is n × n */
  readonly n: number;
  /** queens[r] is the column of the queen in row r, for the rows filled so far (rows 0 … queens.length - 1) */
  readonly queens: readonly number[];
  /** the cell this step works on, and what it turned out to be */
  readonly cell?: { readonly row: number; readonly col: number; readonly status: BoardCellStatus };
  /** a conflict: the queen that attacks the cell, and along which line */
  readonly attacker?: { readonly row: number; readonly col: number; readonly line: 'column' | 'upper-left' | 'upper-right' };
  /** the solutions found so far, in the order found; each is a queens array of length n (copies, never changed) */
  readonly solutions: readonly (readonly number[])[];
  /** the rows of the solve(row) calls in progress, outermost first (the last is the one running) */
  readonly calls: readonly number[];
}

/** checking: being tested; safe / conflict: the test's outcome; placed: a queen was put there; removed: backtracking */
export type BoardCellStatus = 'checking' | 'safe' | 'conflict' | 'placed' | 'removed';

export interface AlgorithmDefinition {
  id: AlgorithmId;
  name: string;
  category: AlgorithmCategory;
  subtitle: string;
  description: string;
  complexity: AlgorithmComplexity;
  defaultInput: number[];

  /** Input requirements (target, sortedness). Omitted for algorithms that only need an array. */
  inputSpec?: AlgorithmInputSpec;

  /**
   * How the trace is drawn: 'array' (bars, the default when omitted), 'linked-list' (nodes and links; every step
   * then carries `list`) or 'numbers' (named value cards; every step then carries `numbers`, and the input is the
   * values declared by inputSpec.numbers). 'text' and 'tree' take strings (inputSpec.texts); 'board' (N-Queens: an
   * n × n board; every step then carries `board`) takes its values from inputSpec.numbers, like 'numbers', as does
   * 'bits' (32-bit rows; every step then carries `bits`). 'decision-tree' (Subsets and Find All Permutations: every step then carries `subsets` or `permutations`)
   * takes the array form. Existing
   * definitions omit it and are unaffected.
   */
  visual?: VisualKind;

  /** Source code for each language. Missing languages show "Code unavailable." */
  code: AlgorithmCode;

  /** Maps codeRef → line number per language */
  lineMap: AlgorithmLineMap;

  /**
   * How many consecutive lines a codeRef's statement occupies in a language, starting at its lineMap line; omitted
   * means 1. For statements written over several lines in one language only, e.g. a C/Java swap through a temporary
   * (3 lines) where C++ calls swap() and Python uses a tuple assignment (1 line). The trace is unaffected.
   */
  lineSpans?: Partial<Record<ProgrammingLanguage, Record<string, number>>>;

  /**
   * How many lines directly BEFORE a codeRef's mapped line belong to the same step in a language; omitted means 0.
   * The mapped line keeps its role (aria-current, "← HERE"), e.g. C's out-parameter writes just before
   * `return true;`, where the other languages return the pair in one statement.
   */
  lineLeads?: Partial<Record<ProgrammingLanguage, Record<string, number>>>;

  /**
   * Names of `pointers` entries that are positions in the displayed array and should be drawn under
   * the bars. When omitted every in-range pointer is drawn. (Bubble Sort's `i` is a pass counter,
   * not a position, so it is excluded there.)
   */
  positionPointers?: string[];

  /** Generates language-agnostic execution steps (no language arg needed) */
  generateSteps(input: number[], params?: Record<string, unknown>): ExecutionStep[];
}

// ─── Supporting UI types ──────────────────────────────────────────────────────
export interface PracticeProblem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  tags: string[];
  solved: boolean;
  description: string;
  starterCode: Record<ProgrammingLanguage, string>;
  /** the visible tests only (hidden tests never reach the browser) */
  testCases: { input: string; expected: string }[];
  /** judged by running the program on its tests; otherwise attempts are recorded without a verdict */
  autoJudged?: boolean;
}

export interface DSAPattern {
  id: string;
  title: string;
  summary: string;
  whenToUse: string[];
  howToRecognize: string[];
  exampleProblems: string[];
  codeSnippet: string;
  complexity: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  algorithmId?: AlgorithmId;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
