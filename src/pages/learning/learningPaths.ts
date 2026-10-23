import type { AlgorithmTrack } from '../../api';
import { isImplementedAlgorithm } from '../../data/algorithmCatalog';
import type { AlgorithmId } from '../../types/algorithm';

/** The roadmap's curriculum: what to learn and in which order. Progress is never stored here; see milestoneStatus. */
export interface Milestone {
  id: string;
  title: string;
  algorithmId: AlgorithmId;
  /** a rough reading-and-stepping estimate for planning, not a measurement */
  estimatedMinutes: number;
}

export interface LearningTrack {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  iconColor: string;
  milestones: Milestone[];
}

export const LEARNING_TRACKS: LearningTrack[] = [
  {
    id: 't1',
    title: 'Track 1: Essential Arrays & Searching',
    level: 'Beginner',
    description: 'Master linear array scanning, binary search boundaries, and two-pointer pair strategies.',
    iconColor: 'from-emerald-500 to-teal-600',
    milestones: [
      { id: 'm1', title: 'Linear Search & Sequential Scan', algorithmId: 'linear-search', estimatedMinutes: 15 },
      { id: 'm2', title: 'Binary Search Divide-and-Conquer', algorithmId: 'binary-search', estimatedMinutes: 25 },
      { id: 'm3', title: 'Two-Pointer Converging Sum Strategy', algorithmId: 'two-pointer', estimatedMinutes: 30 },
    ]
  },
  {
    id: 't2',
    title: 'Track 2: Core Sorting Algorithms',
    level: 'Intermediate',
    description: 'Understand elementary O(n²) sorting vs optimal O(n log n) divide-and-conquer partition methods.',
    iconColor: 'from-cyan-500 to-blue-600',
    milestones: [
      { id: 'm4', title: 'Bubble Sort & Early Exit Optimization', algorithmId: 'bubble-sort', estimatedMinutes: 20 },
      { id: 'm5', title: 'Selection Sort Minimum Pass Boundary', algorithmId: 'selection-sort', estimatedMinutes: 20 },
      { id: 'm6', title: 'Insertion Sort Card Deck Subarray Insertion', algorithmId: 'insertion-sort', estimatedMinutes: 20 },
      { id: 'm7', title: 'Merge Sort Recursive Halves & Subarray Merge', algorithmId: 'merge-sort', estimatedMinutes: 35 },
      { id: 'm8', title: 'Quick Sort In-place Pivot Partitioning', algorithmId: 'quick-sort', estimatedMinutes: 35 },
    ]
  },
  {
    id: 't3',
    title: 'Track 3: Linear & Non-Linear Structures',
    level: 'Advanced',
    description: 'Explore stacks, queues, linked list pointers, trees, and graph traversal algorithms.',
    iconColor: 'from-purple-500 to-indigo-600',
    milestones: [
      { id: 'm9', title: 'Reverse Linked List Iterative Pointer Flip', algorithmId: 'reverse-linked-list', estimatedMinutes: 30 },
      { id: 'm10', title: 'Stack LIFO & Monotonic Next Greater Element', algorithmId: 'stack', estimatedMinutes: 30 },
      { id: 'm11', title: 'Binary Tree Level Order Traversal (BFS)', algorithmId: 'bfs', estimatedMinutes: 40 },
    ]
  }
];

/**
 * A milestone's status for the signed-in user:
 *  - 'coming-soon': its algorithm cannot be visualized yet (or is not a known algorithm);
 *  - 'explored': the user has stepped through it in the visualizer (a progress record in progress, or completed);
 *  - 'not-started': no such record.
 * There is no 'completed': the app has no server-validated completion rule yet, so even a stored 'completed' record
 * (written by an older version) is shown only as explored.
 */
export type MilestoneStatus = 'coming-soon' | 'explored' | 'not-started';

export function milestoneStatus(algorithmId: string, tracks: readonly AlgorithmTrack[]): MilestoneStatus {
  if (!isImplementedAlgorithm(algorithmId)) return 'coming-soon';
  const explored = tracks.some(t => t.algorithmId === algorithmId && (t.status === 'in_progress' || t.status === 'completed'));
  return explored ? 'explored' : 'not-started';
}

/** how many of a track's milestones the user has explored, out of those that can be visualized */
export function trackSummary(track: LearningTrack, tracks: readonly AlgorithmTrack[]) {
  const statuses = track.milestones.map(m => milestoneStatus(m.algorithmId, tracks));
  return {
    explored: statuses.filter(s => s === 'explored').length,
    available: statuses.filter(s => s !== 'coming-soon').length,
  };
}
