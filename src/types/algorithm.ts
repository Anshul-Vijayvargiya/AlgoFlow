// ─── Language types ───────────────────────────────────────────────────────────
export type ProgrammingLanguage = 'c' | 'cpp' | 'java' | 'python';

export type AlgorithmCategory =
  | 'SORTING'
  | 'SEARCHING'
  | 'ARRAYS'
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
  | 'swap-two-numbers';

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
  buffers?: { name: string; values: number[]; cursor?: number }[];

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

  /** Extra metadata */
  extraInfo?: {
    pivotIndex?: number;
    subRange?: [number, number];
  };
}

/** One named value shown by the number visualizer (n, i, n % i; a, b, temp). */
export interface NumberCell {
  readonly name: string;
  /** null: not set yet (e.g. temp before it is assigned) */
  readonly value: number | null;
  /** 'changed': this step's statement wrote it; 'current': it is being read or tested */
  readonly role?: 'changed' | 'current';
}

export interface NumberView {
  readonly cells: readonly NumberCell[];
  /** Prime checking: every divisor tried so far, in order, with n % divisor */
  readonly divisorChecks?: readonly { readonly divisor: number; readonly remainder: number }[];
  /** the final answer, on the last step only */
  readonly result?: { readonly kind: 'prime' | 'not-prime' | 'swapped'; readonly text: string };
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
}

export interface NumberField {
  label: string;
  hint: string;
  min: number;
  max: number;
  /** range Randomize picks from (defaults to min..max) */
  random?: readonly [number, number];
}

export type VisualKind = 'array' | 'linked-list' | 'numbers';

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
