import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { ArrayVisualizer } from '../components/visualizer/ArrayVisualizer';
import { LinkedListVisualizer } from '../components/visualizer/LinkedListVisualizer';
import { listFoundPosition } from '../components/visualizer/listVisuals';
import { deriveOutcome } from '../components/visualizer/barVisuals';
import { ExecutionControls } from '../components/visualizer/ExecutionControls';
import { CodePanel } from '../components/visualizer/CodePanel';
import { ExplanationPanel } from '../components/visualizer/ExplanationPanel';
import { ComplexityBadge } from '../components/visualizer/ComplexityBadge';
import { UnimplementedCard } from '../components/visualizer/UnimplementedCard';
import { ExecutionErrorCard } from '../components/visualizer/ExecutionErrorCard';
import { InputPanel } from '../components/visualizer/InputPanel';
import { LinkedListInputPanel } from '../components/visualizer/LinkedListInputPanel';
import { NumberVisualizer } from '../components/visualizer/NumberVisualizer';
import { NumberInputPanel } from '../components/visualizer/NumberInputPanel';
import { TextVisualizer } from '../components/visualizer/TextVisualizer';
import { TextInputPanel } from '../components/visualizer/TextInputPanel';
import { TreeVisualizer } from '../components/visualizer/TreeVisualizer';
import { useVisualizerStore } from '../store/useVisualizerStore';
import { getAlgorithmById } from '../data/algorithmMetadata';
import { getAlgorithmDefinition, visualKindOf } from '../engine/AlgorithmRegistry';
import { Play, Code2, Menu, X, Sparkles } from 'lucide-react';

export const VisualizerPage: React.FC = () => {
  const { selectedAlgorithm, steps, currentStepIndex, executionError, executionStatus, inputIssue, isPlaying, speed } = useVisualizerStore();
  const algorithmMeta = getAlgorithmById(selectedAlgorithm);
  const def = getAlgorithmDefinition(selectedAlgorithm);
  // array algorithms draw bars and use the array/target form; linked-list operations draw nodes and use the list form
  const visual = visualKindOf(def);
  const currentStep = steps[currentStepIndex] || steps[0];
  const outcome = deriveOutcome(steps, currentStepIndex);

  const [activeMobileTab, setActiveMobileTab] = useState<'visualization' | 'code'>('visualization');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  // desktop/tablet: the algorithm sidebar can be collapsed to a rail, giving its width to the visualizer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);

  // Mobile drawer focus management: move focus into the drawer when it opens, back to its toggle when it closes.
  useEffect(() => {
    if (mobileDrawerOpen) drawerCloseRef.current?.focus();
    else if (drawerWasOpen.current) drawerToggleRef.current?.focus();
    drawerWasOpen.current = mobileDrawerOpen;
  }, [mobileDrawerOpen]);

  const isImplemented = Boolean(def) && algorithmMeta.implemented && !executionError;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-page text-slate-200">
      {/* Screen-reader announcement of the current step for manual stepping (Next/Previous/Reset). Silent while
          playing, so automatic playback does not flood assistive technology with an announcement per step. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="step-announcer">
        {!isPlaying && currentStep && steps.length > 0
          ? `Step ${currentStepIndex + 1} of ${steps.length}. ${currentStep.message}`
          : ''}
      </div>
      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex"
          onKeyDown={e => {
            if (e.key === 'Escape') setMobileDrawerOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Algorithm list"
            className="w-4/5 max-w-xs bg-page h-full shadow-2xl relative"
          >
            <button
              ref={drawerCloseRef}
              aria-label="Close algorithm list"
              onClick={() => setMobileDrawerOpen(false)}
              className="absolute top-4 right-4 z-20 p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-ink"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            <Sidebar onSelect={() => setMobileDrawerOpen(false)} />
          </div>
          <div className="flex-1" aria-hidden="true" onClick={() => setMobileDrawerOpen(false)} />
        </div>
      )}

      {/* Visualizer Top Header Toolbar */}
      <div className="px-4 py-3 bg-surface/90 border-b border-cyan-500/15 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile Drawer Toggle Button */}
          <button
            ref={drawerToggleRef}
            aria-label="Open algorithm list"
            aria-expanded={mobileDrawerOpen}
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-mono text-ink flex items-center gap-2">
                {algorithmMeta.name}
              </h1>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                isImplemented
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                {algorithmMeta.category} {executionError ? '• ERROR' : isImplemented ? '' : '• COMING SOON'}
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              "{algorithmMeta.subtitle}"
            </p>
          </div>
        </div>

        {/* Complexity Metadata Badges */}
        <ComplexityBadge
          timeComplexity={algorithmMeta.timeComplexity}
          spaceComplexity={algorithmMeta.spaceComplexity}
          bestFor={algorithmMeta.bestFor}
        />
      </div>

      {/* Mobile Tab Controls */}
      {isImplemented && (
        <div className="md:hidden flex border-b border-slate-800 bg-page shrink-0">
          <button
            aria-pressed={activeMobileTab === 'visualization'}
            onClick={() => setActiveMobileTab('visualization')}
            className={`flex-1 py-2.5 text-xs font-mono font-medium flex items-center justify-center gap-2 border-b-2 ${
              activeMobileTab === 'visualization'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
                : 'border-transparent text-slate-400'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            Visualization
          </button>
          <button
            aria-pressed={activeMobileTab === 'code'}
            onClick={() => setActiveMobileTab('code')}
            className={`flex-1 py-2.5 text-xs font-mono font-medium flex items-center justify-center gap-2 border-b-2 ${
              activeMobileTab === 'code'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
                : 'border-transparent text-slate-400'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Live Code
          </button>
        </div>
      )}

      {/* Main Content Area: Sidebar | Visualization | Live Code */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Left Sidebar */}
        <div className="hidden md:block shrink-0 h-full">
          <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />
        </div>

        {/* Center & Right Visualization Workspace */}
        <div tabIndex={0} role="region" aria-label="Visualizer workspace" className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
          {executionError ? (
            <ExecutionErrorCard error={executionError} />
          ) : !isImplemented ? (
            <UnimplementedCard algorithmId={selectedAlgorithm} />
          ) : (
            <>
              {/* Main 2-Column Visualization + Live Code Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
                {/* Column 1: Visualization + Controls */}
                <div className={`lg:col-span-7 flex flex-col gap-4 ${
                  activeMobileTab === 'code' ? 'hidden md:flex' : 'flex'
                }`}>
                  {/* Visualization Card Header */}
                  <div role="region" aria-label="Visualization" className="bg-surface border border-cyan-500/20 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                    {/* One line at every step: a long message is cut with "…" rather than wrapping, which would change the
                        header's height and move everything below it (the playback controls) during playback. The full
                        message stays in the DOM (read by screen readers), in the tooltip and in "What's happening?". */}
                    <div className="flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-2 shrink-0">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200 whitespace-nowrap">
                          LIVE VISUALIZATION
                        </span>
                      </div>

                      {currentStep && (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="hidden sm:inline text-[11px] font-mono text-slate-400 whitespace-nowrap">Current Action:</span>
                          <span
                            data-testid="current-action"
                            title={currentStep.message}
                            className="min-w-0 truncate text-xs font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded"
                          >
                            {currentStep.message}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Animated Vertical Array Display */}
                    {currentStep && visual === 'array' && (
                      <ArrayVisualizer
                        currentStep={currentStep}
                        positionPointers={def?.positionPointers}
                        outcome={outcome}
                        stepIntervalMs={speed}
                        hashMapShape={steps.find(s => s.hashMap)?.hashMap}
                      />
                    )}
                    {currentStep && visual === 'linked-list' && (
                      <LinkedListVisualizer
                        currentStep={currentStep}
                        previousStep={steps[currentStepIndex - 1]}
                        foundPosition={listFoundPosition(steps, currentStepIndex)}
                        outcome={outcome}
                        valueLabel={def?.inputSpec?.value?.label}
                        showPosition={Boolean(def?.inputSpec?.index)}
                        stepIntervalMs={speed}
                      />
                    )}
                    {currentStep && visual === 'numbers' && <NumberVisualizer currentStep={currentStep} stepIntervalMs={speed} />}
                    {currentStep && visual === 'text' && <TextVisualizer currentStep={currentStep} stepIntervalMs={speed} />}
                    {currentStep && visual === 'tree' && <TreeVisualizer currentStep={currentStep} stepIntervalMs={speed} />}
                    {executionStatus === 'invalid-input' && (
                      <div
                        data-testid="input-issue"
                        role="status"
                        className="w-full min-h-48 flex flex-col items-center justify-center gap-2 text-center px-6 py-10 bg-surface/90 border border-amber-500/30 rounded-2xl"
                      >
                        <p className="text-sm font-mono font-bold text-amber-300">No visualization for this input yet</p>
                        <p className="text-xs text-slate-400 max-w-md">{inputIssue?.message}</p>
                        <p className="text-xs text-slate-400">Fix the input below, then press Visualize.</p>
                      </div>
                    )}
                  </div>

                  {/* Array / target input, the linked-list form, a number algorithm's values, or the strings of a text or tree algorithm */}
                  {visual === 'array' ? <InputPanel /> : visual === 'linked-list' ? <LinkedListInputPanel /> : visual === 'numbers' ? <NumberInputPanel /> : <TextInputPanel />}

                  {/* Execution Controls Toolbar */}
                  <ExecutionControls />
                </div>

                {/* Column 2: Live Code Panel */}
                <div className={`lg:col-span-5 h-[400px] lg:h-auto ${
                  activeMobileTab === 'visualization' ? 'hidden md:block' : 'block'
                }`}>
                  <CodePanel />
                </div>
              </div>

              {/* Bottom Row: Explanation Panel */}
              <div className="shrink-0">
                <ExplanationPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

