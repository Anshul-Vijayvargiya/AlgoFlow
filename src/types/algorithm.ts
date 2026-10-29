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
  | 'n-queens'
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
  | 'tree-level-order';

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
   * Text algorithms (visual: 'text'): the strings the user enters, in order; passed to generateSteps as params.texts
   * (one string per field, exactly as typed). The main input array is always empty.
   */
  texts?: readonly TextField[];
  /** Text algorithms: complete inputs (one string per field) that Randomize picks from */
  textExamples?: readonly (readonly string[])[];
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
  rule?: 'roman-numeral' | 'binary-number' | 'has-word' | 'level-order-tree';
}

export interface NumberField {
  label: string;
  hint: string;
  min: number;
  max: number;
  /** range Randomize picks from (defaults to min..max) */
  random?: readonly [number, number];
}

export type VisualKind = 'array' | 'linked-list' | 'numbers' | 'text' | 'tree';

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
   * values declared by inputSpec.numbers). Existing definitions omit it and are unaffected.
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
