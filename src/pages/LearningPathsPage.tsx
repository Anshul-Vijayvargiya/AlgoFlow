import React from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, CheckCircle2, Lock, ArrowRight, Sparkles, BookOpen, Clock } from 'lucide-react';
import type { AlgorithmId } from '../types/algorithm';

interface Milestone {
  id: string;
  title: string;
  algorithmId: AlgorithmId;
  estimatedMinutes: number;
  completed: boolean;
  unlocked: boolean;
}

interface LearningTrack {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  iconColor: string;
  milestones: Milestone[];
}

const LEARNING_TRACKS: LearningTrack[] = [
  {
    id: 't1',
    title: 'Track 1: Essential Arrays & Searching',
    level: 'Beginner',
    description: 'Master linear array scanning, binary search boundaries, and two-pointer pair strategies.',
    iconColor: 'from-emerald-500 to-teal-600',
    milestones: [
      { id: 'm1', title: 'Linear Search & Sequential Scan', algorithmId: 'linear-search', estimatedMinutes: 15, completed: true, unlocked: true },
      { id: 'm2', title: 'Binary Search Divide-and-Conquer', algorithmId: 'binary-search', estimatedMinutes: 25, completed: true, unlocked: true },
      { id: 'm3', title: 'Two-Pointer Converging Sum Strategy', algorithmId: 'two-pointer', estimatedMinutes: 30, completed: true, unlocked: true },
    ]
  },
  {
    id: 't2',
    title: 'Track 2: Core Sorting Algorithms',
    level: 'Intermediate',
    description: 'Understand elementary O(n²) sorting vs optimal O(n log n) divide-and-conquer partition methods.',
    iconColor: 'from-cyan-500 to-blue-600',
    milestones: [
      { id: 'm4', title: 'Bubble Sort & Early Exit Optimization', algorithmId: 'bubble-sort', estimatedMinutes: 20, completed: true, unlocked: true },
      { id: 'm5', title: 'Selection Sort Minimum Pass Boundary', algorithmId: 'selection-sort', estimatedMinutes: 20, completed: true, unlocked: true },
      { id: 'm6', title: 'Insertion Sort Card Deck Subarray Insertion', algorithmId: 'insertion-sort', estimatedMinutes: 20, completed: true, unlocked: true },
      { id: 'm7', title: 'Merge Sort Recursive Halves & Subarray Merge', algorithmId: 'merge-sort', estimatedMinutes: 35, completed: false, unlocked: true },
      { id: 'm8', title: 'Quick Sort In-place Pivot Partitioning', algorithmId: 'quick-sort', estimatedMinutes: 35, completed: false, unlocked: true },
    ]
  },
  {
    id: 't3',
    title: 'Track 3: Linear & Non-Linear Structures',
    level: 'Advanced',
    description: 'Explore stacks, queues, linked list pointers, trees, and graph traversal algorithms.',
    iconColor: 'from-purple-500 to-indigo-600',
    milestones: [
      { id: 'm9', title: 'Reverse Linked List Iterative Pointer Flip', algorithmId: 'reverse-linked-list', estimatedMinutes: 30, completed: false, unlocked: false },
      { id: 'm10', title: 'Stack LIFO & Monotonic Next Greater Element', algorithmId: 'stack', estimatedMinutes: 30, completed: false, unlocked: false },
      { id: 'm11', title: 'Binary Tree Level Order Traversal (BFS)', algorithmId: 'bfs', estimatedMinutes: 40, completed: false, unlocked: false },
    ]
  }
];

export const LearningPathsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Title */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono">
          <Compass className="w-3.5 h-3.5" />
          STRUCTURED LEARNING ROADMAPS
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
          DSA <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Mastery Roadmap</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Follow curated step-by-step tracks to build intuition from fundamental searching to advanced divide-and-conquer partition techniques.
        </p>
      </div>

      {/* Tracks List */}
      <div className="space-y-8">
        {LEARNING_TRACKS.map((track) => (
          <div
            key={track.id}
            className="bg-[#0B0F19] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${track.iconColor} flex items-center justify-center text-white font-bold shadow-lg`}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{track.title}</h2>
                  <p className="text-xs text-slate-400">{track.description}</p>
                </div>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-cyan-400 w-fit">
                {track.level} Track
              </span>
            </div>

            {/* Milestones timeline */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {track.milestones.map((m, idx) => (
                <div
                  key={m.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    m.completed
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : m.unlocked
                      ? 'bg-slate-900/80 border-cyan-500/30 hover:border-cyan-400'
                      : 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      STEP {idx + 1}
                    </span>
                    {m.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : m.unlocked ? (
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-600" />
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-100 font-sans">{m.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{m.estimatedMinutes} mins</span>
                    </div>
                  </div>

                  {m.unlocked ? (
                    <NavLink
                      to="/visualizer"
                      className="w-full py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <span>Visualize</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </NavLink>
                  ) : (
                    <div className="w-full py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-600 text-xs font-mono text-center">
                      Locked
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
