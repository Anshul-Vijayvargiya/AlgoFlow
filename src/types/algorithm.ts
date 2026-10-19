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
  | 'BACKTRACKING';

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
  | 'n-queens';

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

  /** Extra metadata */
  extraInfo?: {
    pivotIndex?: number;
    subRange?: [number, number];
  };
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
}

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
  testCases: { input: string; expected: string }[];
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
