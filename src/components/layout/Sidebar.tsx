import React, { useId, useState } from 'react';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import type { AlgorithmId } from '../../types/algorithm';
import { Sparkles, Code, ChevronLeft, ChevronRight, Lock, Search } from 'lucide-react';
import { filterByName, normalizeQuery } from './sidebarSearch';

interface SidebarProps {
  className?: string;
  onSelect?: () => void;
  /** Desktop/tablet only: the sidebar is collapsed to a narrow rail that keeps just its toggle */
  collapsed?: boolean;
  /** When given, a collapse/expand toggle is shown (the mobile drawer has its own close button instead) */
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ className = '', onSelect, collapsed = false, onToggleCollapse }) => {
  const { selectedAlgorithm, setAlgorithm } = useVisualizerStore();
  const [query, setQuery] = useState('');
  // unique per instance: the desktop sidebar and the mobile drawer's can be in the page together
  const id = useId();
  const searchId = `${id}-search`;
  const headerContentId = `${id}-header`;
  const listId = `${id}-list`;

  const handleSelect = (algorithmId: AlgorithmId) => {
    setAlgorithm(algorithmId);
    if (onSelect) onSelect();
  };

  // the app's own list, filtered by name (an empty query is the full list)
  const searching = normalizeQuery(query) !== '';
  const matches = filterByName(ALGORITHM_NAV, query);
  // Hidden (not just covered) while collapsed. `inert` takes it out of the focus order and the accessibility tree at
  // once; visibility alone is not enough, because the items' transition-all animates the inherited visibility too,
  // leaving them focusable for the length of the fade.
  const hiddenWhenCollapsed = `transition-opacity duration-200 motion-reduce:transition-none ${collapsed ? 'invisible opacity-0' : 'visible opacity-100'}`;

  return (
    <aside
      className={`relative ${collapsed ? 'w-12 overflow-y-hidden' : 'w-64 overflow-y-auto'} overflow-x-hidden bg-page border-r border-slate-800/80 flex flex-col h-full custom-scrollbar transition-[width] duration-300 ease-out motion-reduce:transition-none ${className}`}
    >
      <div className={`p-4 border-b ${collapsed ? 'border-transparent' : 'border-slate-800/60'} sticky top-0 bg-page/95 backdrop-blur-md z-10`}>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls={`${headerContentId} ${listId}`}
            data-testid="sidebar-toggle"
            className="absolute top-3 right-2 z-20 p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-cyan-400 hover:bg-slate-800 hover:border-cyan-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" aria-hidden="true" /> : <ChevronLeft className="w-4 h-4" aria-hidden="true" />}
          </button>
        )}
        {/* a fixed width, so nothing reflows while the sidebar's width animates */}
        <div id={headerContentId} inert={collapsed} className={`w-56 ${hiddenWhenCollapsed}`}>
          <div className={`flex items-center gap-2 ${onToggleCollapse ? 'pr-8' : ''}`}>
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
              ALGORITHMS
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Select an algorithm to visualize step-by-step
          </p>

          <div className="relative mt-3">
            <label htmlFor={searchId} className="sr-only">
              Search algorithms
            </label>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search algorithms..."
              autoComplete="off"
              spellCheck={false}
              data-testid="sidebar-search"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono text-cyan-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>
        </div>
      </div>

      <div id={listId} inert={collapsed} className={`p-3 space-y-5 flex-1 w-64 ${hiddenWhenCollapsed}`}>
        {/* what the search found, for screen readers; with no match it is also the visible message */}
        {searching && (
          <p
            role="status"
            data-testid="sidebar-search-status"
            className={matches.length === 0 ? 'px-2 py-6 text-center text-xs font-mono text-slate-400' : 'sr-only'}
          >
            {matches.length === 0
              ? 'No algorithms found'
              : `${matches.length} algorithm${matches.length === 1 ? '' : 's'} found`}
          </p>
        )}

        {ALGORITHM_CATEGORIES.map(cat => {
          // the category's full list sets its count (implemented / listed); the search only decides what is shown
          const categoryAlgorithms = ALGORITHM_NAV.filter(a => a.category === cat.id);
          const shownAlgorithms = matches.filter(a => a.category === cat.id);
          if (shownAlgorithms.length === 0) return null;

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
                {shownAlgorithms.map(alg => {
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
                      // algorithm names at 16px / medium; a long name wraps onto a second line instead of being cut
                      className={`w-full text-left px-3 py-2 rounded-lg text-base leading-snug font-medium transition-all duration-200 flex items-center justify-between gap-2 group ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-purple-500/10 text-cyan-200 border border-cyan-500/40 shadow-glow-cyan'
                          : isImplemented
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                          : 'text-slate-400 border border-transparent cursor-pointer hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {isImplemented ? (
                          <Code
                            className={`w-3.5 h-3.5 mt-1 shrink-0 transition-colors ${
                              isActive
                                ? 'text-cyan-400'
                                : 'text-slate-400 group-hover:text-cyan-400'
                            }`}
                          />
                        ) : (
                          <Lock className="w-3 h-3 mt-[5px] shrink-0 text-slate-700" />
                        )}
                        <span className="min-w-0 break-words">{alg.name}</span>
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
