import React from 'react';
import { Sparkles, Clock, Lock, ArrowRight, Code } from 'lucide-react';
import { getNavItemById } from '../../data/algorithmMetadata';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import type { AlgorithmId } from '../../types/algorithm';

interface UnimplementedCardProps {
  algorithmId: AlgorithmId;
}

const IMPLEMENTED_SUGGESTIONS: { id: AlgorithmId; name: string; category: string }[] = [
  { id: 'bubble-sort', name: 'Bubble Sort', category: 'SORTING' },
  { id: 'selection-sort', name: 'Selection Sort', category: 'SORTING' },
  { id: 'insertion-sort', name: 'Insertion Sort', category: 'SORTING' },
  { id: 'merge-sort', name: 'Merge Sort', category: 'SORTING' },
  { id: 'binary-search', name: 'Binary Search', category: 'SEARCHING' },
  { id: 'linear-search', name: 'Linear Search', category: 'SEARCHING' },
];

export const UnimplementedCard: React.FC<UnimplementedCardProps> = ({ algorithmId }) => {
  const navItem = getNavItemById(algorithmId);
  const setAlgorithm = useVisualizerStore((s) => s.setAlgorithm);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface/80 border border-slate-800 rounded-3xl relative overflow-hidden shadow-2xl my-4">
      {/* Glow background accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-lg space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-glow-amber">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>ALGORITHM IN DEVELOPMENT</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold font-mono text-ink">
            {navItem.name}
          </h2>

          <p className="text-sm text-slate-400 leading-relaxed font-sans max-w-md mx-auto">
            {navItem.subtitle || 'Step-by-step visualization for this algorithm is currently being crafted with precision line-maps.'}
          </p>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" />
              Category: {navItem.category}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Coming Soon
            </span>
          </div>
          <p className="text-xs text-slate-400 text-left">
            In accordance with AlgoFlow's production architecture, unimplemented algorithms NEVER display dummy/fallback code. Select a fully implemented algorithm below to explore live execution.
          </p>
        </div>

        {/* Suggested Implemented Algorithms */}
        <div className="space-y-3 pt-2">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 block">
            TRY AN IMPLEMENTED ALGORITHM
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {IMPLEMENTED_SUGGESTIONS.map((item) => (
              <button
                key={item.id}
                onClick={() => setAlgorithm(item.id)}
                className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/80 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <Code className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-xs font-bold text-slate-200 mt-1.5 group-hover:text-cyan-200">
                  {item.name}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {item.category}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
