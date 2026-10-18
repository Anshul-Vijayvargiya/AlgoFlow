import React, { useState } from 'react';
import { 
  Brain, 
  CheckCircle, 
  Eye, 
  Code, 
  ChevronDown, 
  ChevronUp, 
  Zap 
} from 'lucide-react';
import type { DSAPattern } from '../types/algorithm';

export const PatternsPage: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>('p1');

  const patterns: DSAPattern[] = [
    {
      id: 'p1',
      title: 'Two Pointers',
      summary: 'Uses two references iterating through a data structure simultaneously to reduce nested O(n²) loops to O(n).',
      whenToUse: [
        'Searching for pairs in a sorted array or doubly linked list',
        'Comparing elements from opposite ends (e.g. Palindrome verification)',
        'Partitioning arrays or removing duplicate elements in-place'
      ],
      howToRecognize: [
        'Input array/string is sorted or ordered',
        'Problem asks to find pair/triplet target sums',
        'Requirements stipulate O(1) extra space memory'
      ],
      exampleProblems: ['Two Sum II', '3Sum', 'Container With Most Water', 'Trapping Rain Water'],
      codeSnippet: `int left = 0, right = arr.size() - 1;\nwhile (left < right) {\n    int sum = arr[left] + arr[right];\n    if (sum == target) return {left, right};\n    if (sum < target) left++;\n    else right--;\n}`,
      complexity: 'Time: O(n) | Space: O(1)'
    },
    {
      id: 'p2',
      title: 'Sliding Window',
      summary: 'Maintains a dynamic or fixed subarray range across an array to avoid recalculating overlapping sub-segments.',
      whenToUse: [
        'Finding maximum/minimum subarray sums of fixed length K',
        'Finding longest substring with K distinct characters',
        'Problems asking for continuous subsegments meeting conditions'
      ],
      howToRecognize: [
        'Input is an array, string, or linear sequence',
        'Problem asks for min/max subarray/substring length or sum',
        'Requires contiguous element processing'
      ],
      exampleProblems: ['Maximum Subarray Sum', 'Longest Substring Without Repeating Characters', 'Minimum Size Subarray Sum'],
      codeSnippet: `int windowSum = 0, maxVal = 0;\nfor (int i = 0; i < k; i++) windowSum += arr[i];\nfor (int i = k; i < arr.size(); i++) {\n    windowSum += arr[i] - arr[i - k];\n    maxVal = max(maxVal, windowSum);\n}`,
      complexity: 'Time: O(n) | Space: O(1)'
    },
    {
      id: 'p3',
      title: 'Binary Search',
      summary: 'Repeatedly divides a sorted search space in half to achieve logarithmic lookup speed.',
      whenToUse: [
        'Searching elements in sorted arrays/matrices',
        'Finding boundary transition points (e.g. First TRUE condition)',
        'Search range problems ("Find minimum X satisfying condition Y")'
      ],
      howToRecognize: [
        'Data set is sorted or monotonic function',
        'Constraint calls for O(log n) time complexity'
      ],
      exampleProblems: ['Binary Search', 'Search in Rotated Sorted Array', 'Koko Eating Bananas'],
      codeSnippet: `int low = 0, high = n - 1;\nwhile (low <= high) {\n    int mid = low + (high - low) / 2;\n    if (arr[mid] == target) return mid;\n    if (arr[mid] < target) low = mid + 1;\n    else high = mid - 1;\n}`,
      complexity: 'Time: O(log n) | Space: O(1)'
    },
    {
      id: 'p4',
      title: 'Fast & Slow Pointers (Floyd)',
      summary: 'Uses two pointers moving at different speeds (1 step vs 2 steps) to detect cycles or find middle nodes.',
      whenToUse: [
        'Detecting cycles in Linked Lists or Array sequences',
        'Finding middle element of a linked list in single pass',
        'Happy Number or cycle loop detection'
      ],
      howToRecognize: [
        'Problem involves linked list pointer traversal',
        'Needs loop/cycle detection without using hash set'
      ],
      exampleProblems: ['Linked List Cycle', 'Find Middle of Linked List', 'Find the Duplicate Number'],
      codeSnippet: `ListNode *slow = head, *fast = head;\nwhile (fast && fast->next) {\n    slow = slow->next;\n    fast = fast->next->next;\n    if (slow == fast) return true; // Cycle detected\n}`,
      complexity: 'Time: O(n) | Space: O(1)'
    },
    {
      id: 'p5',
      title: 'Merge Intervals',
      summary: 'Sorts interval pairs by start time to easily combine overlapping ranges.',
      whenToUse: [
        'Consolidating overlapping time intervals or scheduling events',
        'Inserting new intervals into existing non-overlapping sets'
      ],
      howToRecognize: [
        'Problem presents array of pairs `[start, end]`',
        'Keywords like "overlapping", "intervals", or "meeting rooms"'
      ],
      exampleProblems: ['Merge Intervals', 'Insert Interval', 'Non-overlapping Intervals'],
      codeSnippet: `sort(intervals.begin(), intervals.end());\nvector<vector<int>> merged;\nfor (auto& interval : intervals) {\n    if (merged.empty() || merged.back()[1] < interval[0]) {\n        merged.push_back(interval);\n    } else {\n        merged.back()[1] = max(merged.back()[1], interval[1]);\n    }\n}`,
      complexity: 'Time: O(n log n) | Space: O(n)'
    },
    {
      id: 'p6',
      title: 'Breadth First Search (BFS)',
      summary: 'Traverses tree or graph nodes level-by-level using a FIFO Queue.',
      whenToUse: [
        'Finding shortest path in unweighted graphs or grids',
        'Level-order tree traversal or nearest neighbor search'
      ],
      howToRecognize: [
        'Problem asks for minimum steps/distance to reach target',
        'Tree level processing requirements'
      ],
      exampleProblems: ['Binary Tree Level Order Traversal', 'Word Ladder', 'Rotting Oranges'],
      codeSnippet: `queue<int> q; q.push(start); visited[start] = true;\nwhile (!q.empty()) {\n    int curr = q.front(); q.pop();\n    for (int neighbor : adj[curr]) {\n        if (!visited[neighbor]) { visited[neighbor] = true; q.push(neighbor); }\n    }\n}`,
      complexity: 'Time: O(V + E) | Space: O(V)'
    },
    {
      id: 'p7',
      title: 'Depth First Search (DFS)',
      summary: 'Explores tree/graph branches as deep as possible using recursive call stack or explicit stack.',
      whenToUse: [
        'Traversing all paths/branches of trees or graphs',
        'Connected component counting on grid/island matrices',
        'Topological sorting and cycle detection in directed graphs'
      ],
      howToRecognize: [
        'Problem asks to find all valid combinations/paths',
        'Grid island counting or tree depth checking'
      ],
      exampleProblems: ['Number of Islands', 'Max Depth of Binary Tree', 'Path Sum II'],
      codeSnippet: `void dfs(int u) {\n    visited[u] = true;\n    for (int v : adj[u]) {\n        if (!visited[v]) dfs(v);\n    }\n}`,
      complexity: 'Time: O(V + E) | Space: O(H)'
    },
    {
      id: 'p8',
      title: 'Backtracking',
      summary: 'Builds candidates incrementally and backtracks (discards) as soon as a candidate fails constraints.',
      whenToUse: [
        'Generating all permutations, combinations, or subsets',
        'Puzzle solvers like Sudoku, N-Queens, Word Search'
      ],
      howToRecognize: [
        'Problem asks to return ALL valid configurations',
        'Requires choices, constraints, and state undoing'
      ],
      exampleProblems: ['N-Queens', 'Subsets', 'Permutations', 'Sudoku Solver'],
      codeSnippet: `void backtrack(int idx, vector<int>& path) {\n    if (path.size() == k) { res.push_back(path); return; }\n    for (int i = idx; i < n; i++) {\n        path.push_back(arr[i]);\n        backtrack(i + 1, path);\n        path.pop_back(); // Undo step\n    }\n}`,
      complexity: 'Time: O(2ⁿ) or O(N!) | Space: O(N)'
    },
    {
      id: 'p9',
      title: 'Dynamic Programming (DP)',
      summary: 'Breaks complex problems into overlapping subproblems and stores intermediate results in memoization/tabulation array.',
      whenToUse: [
        'Optimization problems (min cost, max value, count ways)',
        'Overlapping subproblem choices (0/1 Knapsack, Coin Change)'
      ],
      howToRecognize: [
        'Problem asks for maximum/minimum value or total number of ways',
        'Decision at current step depends on past choices'
      ],
      exampleProblems: ['Climbing Stairs', '0/1 Knapsack', 'Longest Common Subsequence', 'Coin Change'],
      codeSnippet: `vector<int> dp(n + 1, 0);\ndp[0] = 0; dp[1] = 1;\nfor (int i = 2; i <= n; i++) {\n    dp[i] = dp[i - 1] + dp[i - 2];\n}`,
      complexity: 'Time: O(n) | Space: O(n)'
    },
    {
      id: 'p10',
      title: 'Greedy Algorithms',
      summary: 'Makes locally optimal choice at each step hoping to find the global optimum.',
      whenToUse: [
        'Interval scheduling, coin change with standard denominations',
        'Minimum spanning tree (Kruskal/Prim) and Dijkstra shortest path'
      ],
      howToRecognize: [
        'Problem guarantees local optimum leads to global optimum',
        'Requires sorting by greedy metric'
      ],
      exampleProblems: ['Activity Selection', 'Gas Station', 'Jump Game'],
      codeSnippet: `sort(events.begin(), events.end(), [](auto& a, auto& b) { return a.end < b.end; });\nint count = 1, lastEnd = events[0].end;\nfor (int i = 1; i < events.size(); i++) {\n    if (events[i].start >= lastEnd) { count++; lastEnd = events[i].end; }\n}`,
      complexity: 'Time: O(n log n) | Space: O(1)'
    }
  ];

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="border-b border-slate-800 pb-6 space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
          <Brain className="w-3.5 h-3.5" />
          DSA PATTERN CATALOG
        </div>
        <h1 className="text-3xl font-extrabold font-mono text-white">
          Algorithmic Design Patterns
        </h1>
        <p className="text-xs text-slate-400 max-w-2xl">
          Recognize core patterns instantly to solve coding interview problems faster.
        </p>
      </div>

      <div className="space-y-4">
        {patterns.map((pat) => {
          const isExpanded = expandedId === pat.id;

          return (
            <div
              key={pat.id}
              className={`bg-[#0B0F19] border rounded-2xl transition-all duration-300 shadow-xl overflow-hidden ${
                isExpanded ? 'border-cyan-500/40 shadow-cyan-500/5' : 'border-slate-800/80 hover:border-cyan-500/20'
              }`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : pat.id)}
                className="w-full p-5 flex items-center justify-between text-left focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                      {pat.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                      {pat.summary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded">
                    {pat.complexity}
                  </span>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-cyan-400" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                </div>
              </button>

              {isExpanded && (
                <div className="p-5 pt-0 border-t border-slate-800/60 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-900/30">
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <div className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        WHEN TO USE IT
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {pat.whenToUse.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-cyan-400 font-bold">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-amber-400" />
                        HOW TO RECOGNIZE IT
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {pat.howToRecognize.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-amber-400 font-bold">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                        EXAMPLE PROBLEMS
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pat.exampleProblems.map((prob) => (
                          <span key={prob} className="text-xs font-mono text-cyan-200 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded">
                            {prob}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 space-y-2">
                    <div className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Code className="w-4 h-4 text-purple-400" />
                      CANONICAL PATTERN SNIPPET (C++)
                    </div>
                    <div className="bg-[#070A12] p-4 rounded-xl border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto">
                      <pre>{pat.codeSnippet}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
