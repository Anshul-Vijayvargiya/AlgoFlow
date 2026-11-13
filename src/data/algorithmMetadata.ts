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
  /** A subheading inside the category, shown above the first algorithm of the group */
  group?: string;
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
  { id: 'HEAP', label: 'HEAP & PRIORITY QUEUE' },
  { id: 'GRAPHS', label: 'GRAPHS' },
  { id: 'DP', label: 'DYNAMIC PROGRAMMING' },
  { id: 'GREEDY', label: 'GREEDY' },
  { id: 'BACKTRACKING', label: 'BACKTRACKING' },
  { id: 'BIT_MANIPULATION', label: 'BIT MANIPULATION' },
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
  {
    id: 'print-all-pairs',
    name: 'Print All Pairs in an Array',
    category: 'ARRAYS',
    subtitle: 'Two nested loops print each pair i < j once, in order.',
    implemented: true,
  },
  {
    id: 'print-subarrays',
    name: 'Print Subarrays',
    category: 'ARRAYS',
    subtitle: 'Every contiguous start..end, printed value by value, in order.',
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
  {
    id: 'array-move-zeroes',
    name: 'Move Zeroes',
    category: 'ARRAYS',
    subtitle: 'Two pointers, in place: non-zero values move left in order, zeroes end up at the back.',
    implemented: true,
  },
  {
    id: 'array-sort-colors',
    name: 'Sort Colors',
    category: 'ARRAYS',
    subtitle: 'Dutch National Flag: three pointers sort the 0s, 1s and 2s in place, in one pass.',
    implemented: true,
  },
  {
    id: 'array-buy-sell-stock',
    name: 'Best Time to Buy and Sell Stock',
    category: 'ARRAYS',
    subtitle: 'One pass: keep the lowest price so far, and the best profit from selling today.',
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
    id: 'tree-root-to-leaf-paths',
    name: 'Root to Leaf Paths',
    category: 'TREES',
    subtitle: 'Every path from the root to a leaf — DFS with backtracking.',
    implemented: true,
  },
  {
    id: 'build-bst',
    name: 'Build a Binary Search Tree',
    category: 'TREES',
    subtitle: 'Insert values in order: smaller goes left, larger goes right.',
    implemented: true,
  },
  {
    id: 'build-bst-recursive',
    name: 'Build a Binary Search Tree (Recursive)',
    category: 'TREES',
    subtitle: 'insert(node, value) recurses left or right, then returns the subtree root.',
    implemented: true,
  },
  {
    id: 'bst-balance',
    name: 'Convert BST to Balanced BST',
    category: 'TREES',
    subtitle: 'Inorder walk into a sorted array, then build a balanced BST from the middles (divide and conquer).',
    implemented: true,
  },
  {
    id: 'bst-print-in-range',
    name: 'Print in Range (BST)',
    category: 'TREES',
    subtitle: 'Print the values in [low, high], skipping subtrees that cannot hold any.',
    implemented: true,
  },
  {
    id: 'tree-validate-bst',
    name: 'Validate Binary Search Tree',
    category: 'TREES',
    subtitle: 'Is it a BST? Recursive DFS that passes each subtree its allowed (min, max) range.',
    implemented: true,
  },
  {
    id: 'bst-mirror',
    name: 'Mirror a BST',
    category: 'TREES',
    subtitle: 'Invert a binary tree: swap the children of every node with a recursive DFS.',
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

  // ─── HEAP & PRIORITY QUEUE ──────────────────────────────
  {
    id: 'heap-last-stone-weight',
    name: 'Last Stone Weight',
    category: 'HEAP',
    subtitle: 'Smash the two heaviest stones, taken from a max heap, until at most one is left.',
    implemented: true,
  },
  {
    id: 'heap-merge-k-sorted-lists',
    name: 'Merge k Sorted Lists',
    category: 'HEAP',
    subtitle: 'A min heap of list heads gives the next smallest node in O(log k).',
    implemented: true,
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
    id: 'dp-pascals-triangle',
    name: "Pascal's Triangle",
    category: 'DP',
    subtitle: 'Build each row from the row above it: every middle cell is the sum of the two cells over it.',
    implemented: true,
  },
  {
    id: 'dp-pascals-triangle-ii',
    name: "Pascal's Triangle II",
    category: 'DP',
    subtitle: 'One row, updated in place from right to left: each pass turns the row into the next one.',
    implemented: true,
  },
  {
    id: 'dp-climbing-stairs',
    name: 'Climbing Stairs',
    category: 'DP',
    subtitle: 'Count the ways to the top: ways(i) = ways(i − 1) + ways(i − 2), kept in two rolling variables.',
    implemented: true,
  },
  {
    id: 'dp-house-robber',
    name: 'House Robber',
    category: 'DP',
    subtitle: 'The most money from houses in a row without robbing two neighbours: rob or skip, kept in two rolling variables.',
    implemented: true,
  },
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
    id: 'backtracking-n-queens',
    name: 'N-Queens Problem',
    category: 'BACKTRACKING',
    subtitle: 'Place N queens so none attack each other — row by row, backtracking.',
    implemented: true,
  },
  {
    id: 'backtracking-subsets',
    name: 'Subsets (Power Set)',
    category: 'BACKTRACKING',
    subtitle: 'Every subset of an array: include or skip each element, backtracking in between.',
    implemented: true,
  },
  {
    id: 'backtracking-permutations',
    name: 'Find All Permutations',
    category: 'BACKTRACKING',
    subtitle: 'Every ordering of an array: pick each unused element in turn, backtracking in between.',
    implemented: true,
  },
  // ─── FUNDAMENTALS (implemented; listed last so the order above is unchanged) ───
  {
    id: 'bitwise-and',
    name: 'Binary AND',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bitwise Operators',
    subtitle: 'a & b: a result bit is 1 only where both input bits are 1.',
    implemented: true,
  },
  {
    id: 'bitwise-or',
    name: 'Binary OR',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bitwise Operators',
    subtitle: 'a | b: a result bit is 1 where either input bit is 1.',
    implemented: true,
  },
  {
    id: 'bitwise-xor',
    name: 'Binary XOR',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bitwise Operators',
    subtitle: 'a ^ b: a result bit is 1 where the input bits differ.',
    implemented: true,
  },
  {
    id: 'bitwise-not',
    name: "Binary One's Complement",
    category: 'BIT_MANIPULATION',
    group: 'Basic Bitwise Operators',
    subtitle: '~a: every one of the 32 bits is inverted.',
    implemented: true,
  },
  {
    id: 'bitwise-left-shift',
    name: 'Binary Left Shift',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bitwise Operators',
    subtitle: 'a << i: bits move left, zeros fill in, the top bits are discarded.',
    implemented: true,
  },
  {
    id: 'bitwise-right-shift',
    name: 'Binary Right Shift',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bitwise Operators',
    subtitle: 'a >> i: bits move right and the sign bit fills in (arithmetic shift).',
    implemented: true,
  },
  {
    id: 'bit-check-even',
    name: 'Check if Even',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bit Manipulation',
    subtitle: '(n & 1) == 0: the lowest bit decides whether n is even.',
    implemented: true,
  },
  {
    id: 'bit-get-ith',
    name: 'Get i-th Bit',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bit Manipulation',
    subtitle: '(n >> i) & 1: reads the bit at position i.',
    implemented: true,
  },
  {
    id: 'bit-set-ith',
    name: 'Set i-th Bit',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bit Manipulation',
    subtitle: 'n | (1 << i): makes the bit at position i a 1.',
    implemented: true,
  },
  {
    id: 'bit-clear-ith',
    name: 'Clear i-th Bit',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bit Manipulation',
    subtitle: 'n & ~(1 << i): makes the bit at position i a 0.',
    implemented: true,
  },
  {
    id: 'bit-update-ith',
    name: 'Update i-th Bit',
    category: 'BIT_MANIPULATION',
    group: 'Basic Bit Manipulation',
    subtitle: '(n & ~(1 << i)) | (bit << i): writes a chosen bit at position i.',
    implemented: true,
  },
  {
    id: 'bit-clear-last-i',
    name: 'Clear Last i Bits',
    category: 'BIT_MANIPULATION',
    group: 'Advanced Bit Manipulation',
    subtitle: 'n & (~0 << i): clears the i lowest bit positions.',
    implemented: true,
  },
  {
    id: 'bit-clear-range',
    name: 'Clear Range of Bits',
    category: 'BIT_MANIPULATION',
    group: 'Advanced Bit Manipulation',
    subtitle: 'Clears positions l through r with a mask that cannot overflow.',
    implemented: true,
  },
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

