import React from 'react';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import type { AlgorithmId } from '../../types/algorithm';
import { Sparkles, Code, ChevronRight, Lock } from 'lucide-react';

interface SidebarProps {
  className?: string;
  onSelect?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ className = '', onSelect }) => {
  const { selectedAlgorithm, setAlgorithm } = useVisualizerStore();

  const handleSelect = (id: AlgorithmId) => {
    setAlgorithm(id);
    if (onSelect) onSelect();
  };

  return (
    <aside
      className={`w-64 bg-[#070A12] border-r border-slate-800/80 flex flex-col h-full overflow-y-auto custom-scrollbar ${className}`}
    >
      <div className="p-4 border-b border-slate-800/60 sticky top-0 bg-[#070A12]/95 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
            ALGORITHMS
          </h2>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Select an algorithm to visualize step-by-step
        </p>
      </div>

      <div className="p-3 space-y-5 flex-1">
        {ALGORITHM_CATEGORIES.map(cat => {
          const categoryAlgorithms = ALGORITHM_NAV.filter(a => a.category === cat.id);
          if (categoryAlgorithms.length === 0) return null;

          const implementedCount = categoryAlgorithms.filter(a => a.implemented).length;

          return (
            <div key={cat.id} className="space-y-1">
              <div className="px-2 py-1 text-[11px] font-mono font-semibold tracking-wider text-slate-400 uppercase flex items-center justify-between">
                <span>{cat.label}</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                  {implementedCount}/{categoryAlgorithms.length}
                </span>
              </div>

              <div className="space-y-0.5">
                {categoryAlgorithms.map(alg => {
                  const isActive = selectedAlgorithm === alg.id;
                  const isImplemented = alg.implemented;

                  return (
                    <button
                      key={alg.id}
                      onClick={() => handleSelect(alg.id)}
                      title={
                        !isImplemented
                          ? `${alg.name} — visualization coming soon`
                          : alg.subtitle
                      }
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-between group ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-purple-500/10 text-cyan-200 border border-cyan-500/40 shadow-glow-cyan'
                          : isImplemented
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                          : 'text-slate-400 border border-transparent cursor-pointer hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {isImplemented ? (
                          <Code
                            className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                              isActive
                                ? 'text-cyan-400'
                                : 'text-slate-400 group-hover:text-cyan-400'
                            }`}
                          />
                        ) : (
                          <Lock className="w-3 h-3 shrink-0 text-slate-700" />
                        )}
                        <span className="truncate">{alg.name}</span>
                      </div>

                      {isImplemented && (
                        <ChevronRight
                          className={`w-3 h-3 shrink-0 transition-transform ${
                            isActive
                              ? 'text-cyan-400 translate-x-0.5'
                              : 'text-slate-400 opacity-0 group-hover:opacity-100'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
