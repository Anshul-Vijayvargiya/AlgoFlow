/**
 * algorithmMetadata.ts
 *
 * Navigation metadata for ALL algorithms — both implemented and planned.
 * For implemented algorithms, the AlgorithmRegistry is the source of truth.
 * This file only provides the sidebar navigation data.
 */
import type { AlgorithmCategory, AlgorithmId } from '../types/algorithm';
import { getAlgorithmDefinition } from '../engine/AlgorithmRegistry';

export interface AlgorithmNavItem {
  id: AlgorithmId;
  name: string;
  category: AlgorithmCategory;
  subtitle: string;
  /** True only if a full AlgorithmDefinition exists in AlgorithmRegistry */
  implemented: boolean;
}

export interface AlgorithmMetadata {
  id: AlgorithmId;
  name: string;
  category: AlgorithmCategory;
  subtitle: string;
  description: string;
  timeComplexity: {
    best: string;
    average: string;
    worst: string;
  };
  spaceComplexity: string;
  bestFor: string;
  defaultInput: number[];
  implemented: boolean;
}

export const ALGORITHM_CATEGORIES: { id: AlgorithmCategory; label: string }[] = [
  { id: 'SORTING', label: 'SORTING' },
  { id: 'SEARCHING', label: 'SEARCHING' },
  { id: 'ARRAYS', label: 'ARRAYS' },
  { id: 'STRINGS', label: 'STRINGS' },
  { id: 'LINKED_LIST', label: 'LINKED LIST' },
  { id: 'STACK_QUEUE', label: 'STACK & QUEUE' },
  { id: 'TREES', label: 'TREES' },
  { id: 'GRAPHS', label: 'GRAPHS' },
  { id: 'DP', label: 'DYNAMIC PROGRAMMING' },
  { id: 'GREEDY', label: 'GREEDY' },
  { id: 'BACKTRACKING', label: 'BACKTRACKING' },
  { id: 'FUNDAMENTALS', label: 'FUNDAMENTALS' },
];

export const ALGORITHM_NAV: AlgorithmNavItem[] = [
  // ─── SORTING (implemented) ──────────────────────────────
  {
    id: 'bubble-sort',
    name: 'Bubble Sort',
    category: 'SORTING',
    subtitle: 'Repeatedly swaps adjacent out-of-order elements.',
    implemented: true,
  },
  {
    id: 'selection-sort',
    name: 'Selection Sort',
    category: 'SORTING',
    subtitle: 'Finds minimum and places it in sorted portion.',
    implemented: true,
  },
  {
    id: 'insertion-sort',
    name: 'Insertion Sort',
    category: 'SORTING',
    subtitle: 'Builds sorted array one element at a time.',
    implemented: true,
  },
  {
    id: 'merge-sort',
    name: 'Merge Sort',
    category: 'SORTING',
    subtitle: 'Divide-and-conquer: splits and merges sorted halves.',
    implemented: true,
  },
  {
    id: 'quick-sort',
    name: 'Quick Sort',
    category: 'SORTING',
    subtitle: 'Picks pivot and partitions elements around it.',
    implemented: true,
  },
  {
    id: 'heap-sort',
    name: 'Heap Sort',
    category: 'SORTING',
    subtitle: 'Builds max-heap and extracts elements in sorted order.',
    implemented: true,
  },

  // ─── SEARCHING (implemented) ────────────────────────────
  {
    id: 'linear-search',
    name: 'Linear Search',
    category: 'SEARCHING',
    subtitle: 'Checks each element sequentially until found.',
    implemented: true,
  },
  {
    id: 'binary-search',
    name: 'Binary Search',
    category: 'SEARCHING',
    subtitle: 'Halves search space each step in sorted array.',
    implemented: true,
  },
  {
    id: 'jump-search',
    name: 'Jump Search',
    category: 'SEARCHING',
    subtitle: 'Jumps ahead by √n steps, then linear searches.',
    implemented: false,
  },

  // ─── ARRAYS ─────────────────────────────────────────────
  {
    id: 'two-pointer',
    name: 'Two Pointer',
    category: 'ARRAYS',
    subtitle: 'Left/right pointers converging for pair problems.',
    implemented: true,
  },
  {
    id: 'sliding-window',
    name: 'Sliding Window',
    category: 'ARRAYS',
    subtitle: 'Dynamic window over subarray for O(n) solutions.',
    implemented: false,
  },
  {
    id: 'prefix-sum',
    name: 'Prefix Sum',
    category: 'ARRAYS',
    subtitle: 'O(1) range sum queries after O(n) build.',
    implemented: false,
  },
  {
    id: 'two-sum',
    name: 'Two Sum',
    category: 'ARRAYS',
    subtitle: 'Hash map of earlier values: one pass, O(n).',
    implemented: true,
  },
  {
    id: 'majority-element',
    name: 'Majority Element',
    category: 'ARRAYS',
    subtitle: 'Boyer–Moore voting, then a verifying count.',
    implemented: true,
  },
  {
    id: 'container-most-water',
    name: 'Container With Most Water',
    category: 'ARRAYS',
    subtitle: 'Two pointers; the shorter line moves inward.',
    implemented: true,
  },
  {

    id: 'merge-sorted-array',
    name: 'Merge Sorted Array',
    category: 'ARRAYS',
    subtitle: 'Three pointers merge nums2 into nums1 from the back.',
    implemented: true,
  },
  {
    id: 'trapping-rain-water',
    name: 'Trapping Rain Water',
    category: 'ARRAYS',
    subtitle: 'Two pointers decide the lower side’s water, one bar per step.',
    implemented: true,
  },
  {
    id: 'maximum-subarray',
    name: 'Maximum Subarray',
    category: 'ARRAYS',
    subtitle: "Kadane's algorithm: extend the run or start over, in one pass.",
    implemented: true,
  },
  {
    id: 'three-sum',
    name: '3Sum',
    category: 'ARRAYS',
    subtitle: 'Sort, fix one value, two pointers find the other two.',
    implemented: true,
  },
  {
    id: 'four-sum',
    name: '4Sum',
    category: 'ARRAYS',
    subtitle: 'Sort, fix two values, two pointers find the other two.',
    implemented: true,
  },
  // listed with the other arrays (the merge had placed it after STRINGS, out of the sidebar's order)
  {
    id: 'remove-duplicates-sorted',
    name: 'Remove Duplicates from Sorted Array',
    category: 'ARRAYS',
    subtitle: 'Slow/fast pointers keep one copy of each value, in place.',
    implemented: true,
  },

  // ─── STRINGS ────────────────────────────────────────────
  {
    id: 'roman-to-integer',
    name: 'Roman to Integer',
    category: 'STRINGS',
    subtitle: 'Add each symbol, or subtract it when a larger one follows.',
    implemented: true,
  },
  {
    id: 'longest-common-prefix',
    name: 'Longest Common Prefix',
    category: 'STRINGS',
    subtitle: 'Scan column by column until a word ends or differs.',
    implemented: true,
  },
  {
    id: 'valid-parentheses',
    name: 'Valid Parentheses',
    category: 'STRINGS',
    subtitle: 'A stack of open brackets; each closer must match the top.',
    implemented: true,
  },
  {
    id: 'find-first-occurrence',
    name: 'Find the Index of the First Occurrence',
    category: 'STRINGS',
    subtitle: 'Slide the needle along the haystack, comparing as it goes.',
    implemented: true,
  },
  {
    id: 'length-of-last-word',
    name: 'Length of Last Word',
    category: 'STRINGS',
    subtitle: 'Scan back past trailing spaces, then count the word.',
    implemented: true,
  },
  {
    id: 'add-binary',
    name: 'Add Binary',
    category: 'STRINGS',
    subtitle: 'Column addition from the right with a carry.',
    implemented: true,
  },
  {
    id: 'valid-palindrome',
    name: 'Valid Palindrome',
    category: 'STRINGS',
    subtitle: 'Two pointers inwards, skipping non-alphanumerics.',
    implemented: true,
  },
  {
    id: 'valid-palindrome-ii',
    name: 'Valid Palindrome II',
    category: 'STRINGS',
    subtitle: 'Two pointers; at the first mismatch, try deleting either side.',
     implemented: true,
  },

  // ─── LINKED LIST ────────────────────────────────────────
  {
    id: 'll-build',
    name: 'Build Linked List',
    category: 'LINKED_LIST',
    subtitle: 'Creates a list from an array by appending at the tail.',
    implemented: true,
  },
  {
    id: 'll-traverse',
    name: 'Traverse Linked List',
    category: 'LINKED_LIST',
    subtitle: 'Follows next pointers from HEAD to NULL.',
    implemented: true,
  },
  {
    id: 'll-search',
    name: 'Search Linked List',
    category: 'LINKED_LIST',
    subtitle: 'Returns the position of the first matching node.',
    implemented: true,
  },
  {
    id: 'll-insert-head',
    name: 'Insert at Head',
    category: 'LINKED_LIST',
    subtitle: 'Links a new first node and moves HEAD in O(1).',
    implemented: true,
  },
  {
    id: 'll-insert-tail',
    name: 'Insert at Tail',
    category: 'LINKED_LIST',
    subtitle: 'Appends through the TAIL pointer in O(1).',
    implemented: true,
  },
  {
    id: 'll-delete-head',
    name: 'Delete at Head',
    category: 'LINKED_LIST',
    subtitle: 'Moves HEAD forward and releases the old first node.',
    implemented: true,
  },
  {
    id: 'll-delete-tail',
    name: 'Delete at Tail',
    category: 'LINKED_LIST',
    subtitle: 'Walks to the node before TAIL and releases the last node.',
    implemented: true,
  },
  {
    id: 'll-insert-at',
    name: 'Insert at Position',
    category: 'LINKED_LIST',
    subtitle: 'Walks to the node before a position and links a new node.',
    implemented: true,
  },
  {
    id: 'll-delete-at',
    name: 'Delete at Position',
    category: 'LINKED_LIST',
    subtitle: 'Unlinks and releases the node at a position.',
    implemented: true,
  },
  {
    id: 'reverse-linked-list',
    name: 'Reverse Linked List',
    category: 'LINKED_LIST',
    subtitle: 'Turns every next pointer around iteratively.',
    implemented: true,
  },
  {
    id: 'detect-cycle',
    name: 'Detect Cycle (Floyd)',
    category: 'LINKED_LIST',
    subtitle: 'Slow/fast pointers to detect loops.',
    implemented: false,
  },
  {
    id: 'merge-lists',
    name: 'Merge Sorted Lists',
    category: 'LINKED_LIST',
    subtitle: 'Merges two sorted linked lists in O(n).',
    implemented: false,
  },

  // ─── STACK & QUEUE ──────────────────────────────────────
  {
    id: 'stack',
    name: 'Stack (LIFO)',
    category: 'STACK_QUEUE',
    subtitle: 'Push, pop, and peek operations animated.',
    implemented: false,
  },
  {
    id: 'queue',
    name: 'Queue (FIFO)',
    category: 'STACK_QUEUE',
    subtitle: 'Enqueue and dequeue operations animated.',
    implemented: false,
  },
  {
    id: 'monotonic-stack',
    name: 'Monotonic Stack',
    category: 'STACK_QUEUE',
    subtitle: 'Stack maintaining monotone order for NGE/NSE.',
    implemented: false,
  },

  // ─── TREES ──────────────────────────────────────────────
  // the four traversals replace the planned "Tree Traversals" entry
  {
    id: 'tree-inorder',
    name: 'Inorder Traversal',
    category: 'TREES',
    subtitle: 'Left, root, right — with an explicit stack.',
    implemented: true,
  },
  {
    id: 'tree-preorder',
    name: 'Preorder Traversal',
    category: 'TREES',
    subtitle: 'Root, left, right — pop, visit, push right then left.',
    implemented: true,
  },
  {
    id: 'tree-postorder',
    name: 'Postorder Traversal',
    category: 'TREES',
    subtitle: 'Left, right, root — one stack and the last node visited.',
    implemented: true,
  },
  {
    id: 'tree-level-order',
    name: 'Level Order Traversal',
    category: 'TREES',
    subtitle: 'Breadth-first, level by level, with a queue.',
    implemented: true,
  },
  {
    id: 'binary-tree',
    name: 'Binary Tree',
    category: 'TREES',
    subtitle: 'Node insertion and visual tree construction.',
    implemented: false,
  },
  {
    id: 'bst',
    name: 'BST Search & Insert',
    category: 'TREES',
    subtitle: 'Search and insert in binary search tree.',
    implemented: false,
  },

  // ─── GRAPHS ─────────────────────────────────────────────
  {
    id: 'bfs',
    name: 'BFS (Breadth-First)',
    category: 'GRAPHS',
    subtitle: 'Level-by-level exploration with a queue.',
    implemented: false,
  },
  {
    id: 'dfs',
    name: 'DFS (Depth-First)',
    category: 'GRAPHS',
    subtitle: 'Recursive depth-first graph traversal.',
    implemented: false,
  },
  {
    id: 'dijkstra',
    name: "Dijkstra's Algorithm",
    category: 'GRAPHS',
    subtitle: 'Shortest path in weighted graph.',
    implemented: false,
  },

  // ─── DYNAMIC PROGRAMMING ────────────────────────────────
  {
    id: 'fibonacci',
    name: 'Fibonacci (DP)',
    category: 'DP',
    subtitle: 'Memoization turning O(2ⁿ) into O(n).',
    implemented: false,
  },
  {
    id: 'knapsack',
    name: '0/1 Knapsack',
    category: 'DP',
    subtitle: 'Maximum value under weight constraint.',
    implemented: false,
  },
  {
    id: 'lcs',
    name: 'Longest Common Subsequence',
    category: 'DP',
    subtitle: 'DP table for LCS of two sequences.',
    implemented: false,
  },

  // ─── GREEDY ─────────────────────────────────────────────
  {
    id: 'activity-selection',
    name: 'Activity Selection',
    category: 'GREEDY',
    subtitle: 'Maximum non-overlapping intervals.',
    implemented: false,
  },

  // ─── BACKTRACKING ───────────────────────────────────────
  {
    id: 'n-queens',
    name: 'N-Queens',
    category: 'BACKTRACKING',
    subtitle: 'Place N queens so none attack each other.',
    implemented: false,
  },
  // ─── FUNDAMENTALS (implemented; listed last so the order above is unchanged) ───
  {
    id: 'prime-check',
    name: 'Prime Number Checker',
    category: 'FUNDAMENTALS',
    subtitle: 'Tests divisors from 2 while i × i ≤ n.',
    implemented: true,
  },
  {
    id: 'swap-two-numbers',
    name: 'Swap of Two Numbers',
    category: 'FUNDAMENTALS',
    subtitle: 'Exchanges a and b through a temporary variable.',
    implemented: true,
  },
  {
    id: 'valid-perfect-square',
    name: 'Valid Perfect Square',
    category: 'FUNDAMENTALS',
    subtitle: 'Binary search for a whole k with k × k = num.',
    implemented: true,
  },
  {
    id: 'sqrt-x',
    name: 'Sqrt(x)',
    category: 'FUNDAMENTALS',
    subtitle: 'Binary search for the largest k with k × k ≤ x.',
    implemented: true,
  },
  {
    id: 'arranging-coins',
    name: 'Arranging Coins',
    category: 'FUNDAMENTALS',
    subtitle: 'Binary search for the most complete staircase rows.',
    implemented: true,
  },
];

export function getNavItemById(id: AlgorithmId): AlgorithmNavItem {
  return (
    ALGORITHM_NAV.find(a => a.id === id) || {
      id,
      name: id,
      category: 'SORTING',
      subtitle: '',
      implemented: false,
    }
  );
}

export function getAlgorithmById(id: AlgorithmId): AlgorithmMetadata {
  const def = getAlgorithmDefinition(id);
  if (def) {
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      subtitle: def.subtitle,
      description: def.description,
      timeComplexity: {
        best: def.complexity.best,
        average: def.complexity.average,
        worst: def.complexity.worst,
      },
      spaceComplexity: def.complexity.space,
      bestFor: def.complexity.bestFor || 'N/A',
      defaultInput: def.defaultInput,
      implemented: true,
    };
  }

  const navItem = getNavItemById(id);
  return {
    id: navItem.id,
    name: navItem.name,
    category: navItem.category,
    subtitle: navItem.subtitle,
    description: navItem.subtitle,
    timeComplexity: {
      best: 'N/A',
      average: 'N/A',
      worst: 'N/A',
    },
    spaceComplexity: 'N/A',
    bestFor: 'N/A',
    defaultInput: [8, 3, 5, 1, 6],
    implemented: false,
  };
}

