import React, { useRef, useEffect } from 'react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { Code2, Terminal, AlertTriangle } from 'lucide-react';

const LANGUAGE_LABELS: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  java: 'Java',
  python: 'Python',
};

export const CodePanel: React.FC = () => {
  const { selectedAlgorithm, selectedLanguage, steps, currentStepIndex, resolveCurrentLine, resolveCurrentRange } =
    useVisualizerStore();

  const activeLineRef = useRef<HTMLDivElement>(null);

  const def = getAlgorithmDefinition(selectedAlgorithm);
  const currentStep = steps[currentStepIndex];
  const activeCodeLine = resolveCurrentLine();
  // A statement may span several lines in one language (e.g. a C/Java swap through a temporary, or C's out-parameter
  // writes before `return true;`): every line of it is highlighted, while aria-current, the scroll target and
  // "← HERE" stay on the step's mapped line.
  const activeRange = resolveCurrentRange();
  // A step that names a codeRef the line map does not contain is a data defect, not "line 1".
  const isUnmappedStep = Boolean(currentStep?.codeRef) && activeCodeLine === null;
  const stepType = currentStep?.type ?? 'init';

  // Source code for the selected language — may be null if not implemented
  const sourceCode: string | null = def ? (def.code[selectedLanguage] ?? null) : null;
  const codeLines: string[] = sourceCode ? sourceCode.split('\n') : [];

  // Scroll active line into view whenever it changes
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCodeLine]);

  // Surface mapping defects loudly in development only (no stack traces for end users).
  useEffect(() => {
    if (isUnmappedStep && import.meta.env.DEV) {
      console.error(
        `[AlgoFlow] Unknown codeRef "${currentStep?.codeRef}" for ${selectedAlgorithm} (${selectedLanguage}) at step ${currentStepIndex}`
      );
    }
  }, [isUnmappedStep, currentStep?.codeRef, selectedAlgorithm, selectedLanguage, currentStepIndex]);

  // Highlight color per step type
  const getHighlightClass = () => {
    if (stepType === 'swap') return 'bg-rose-500/20 border-l-4 border-rose-400 text-rose-100';
    if (stepType === 'compare' || stepType === 'condition')
      return 'bg-amber-500/20 border-l-4 border-amber-400 text-amber-100';
    if (stepType === 'found' || stepType === 'complete')
      return 'bg-emerald-500/20 border-l-4 border-emerald-400 text-emerald-100';
    if (stepType === 'not-found')
      return 'bg-rose-500/20 border-l-4 border-rose-400 text-rose-100';
    if (stepType === 'loop-condition' || stepType === 'loop-start')
      return 'bg-purple-500/20 border-l-4 border-purple-400 text-purple-100';
    return 'bg-cyan-500/20 border-l-4 border-cyan-400 text-cyan-100';
  };

  return (
    <div role="region" aria-label="Code" className="bg-surface border border-cyan-500/20 rounded-2xl flex flex-col h-full overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 bg-page border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="h-4 w-[1px] bg-slate-800 mx-1" />
          <Code2 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
            LIVE CODE
          </span>
          <span className="text-[10px] font-mono text-cyan-400/80 light:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
            {LANGUAGE_LABELS[selectedLanguage] ?? selectedLanguage.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {!sourceCode
              ? 'Unavailable'
              : currentStep && !currentStep.codeRef
                ? // an explanation-only step (e.g. "element locked"): deliberately no line, unlike an unmapped codeRef
                  'No statement runs at this step'
                : isUnmappedStep
                ? 'Unmapped step'
                : activeCodeLine === null
                  ? `${codeLines.length} lines`
                  : `Line ${activeCodeLine} / ${codeLines.length}`}
          </span>
        </div>
      </div>

      {/* Code body */}
      <div className="flex-1 relative overflow-hidden">
        {sourceCode === null ? (
          /* ─── Code unavailable state ─────────────────────────── */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            <AlertTriangle className="w-10 h-10 text-amber-400/60 light:text-amber-400" />
            <p className="text-sm font-mono text-slate-400">
              Code unavailable for{' '}
              <span className="text-amber-300">
                {LANGUAGE_LABELS[selectedLanguage] ?? selectedLanguage}
              </span>
            </p>
            <p className="text-xs text-slate-400">
              This language is not yet implemented for this algorithm.
            </p>
          </div>
        ) : (
          /* ─── Code viewer ─────────────────────────────────────── */
          <div tabIndex={0} role="region" aria-label="Source code" className="absolute inset-0 overflow-y-auto font-mono text-xs p-3 space-y-0.5 bg-surface custom-scrollbar">
            {codeLines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isActive = activeCodeLine !== null && lineNum === activeCodeLine;
              const inActiveRange = activeRange !== null && lineNum >= activeRange.start && lineNum <= activeRange.end;
              const highlightClass = inActiveRange ? getHighlightClass() : '';

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : undefined}
                  data-line={lineNum}
                  data-active={inActiveRange ? 'true' : undefined}
                  aria-current={isActive ? 'step' : undefined}
                  className={`flex items-start gap-3 px-2 py-[3px] rounded transition-colors duration-150 ${highlightClass}`}
                >
                  <span
                    className={`w-6 text-right select-none text-[11px] shrink-0 pt-[1px] ${
                      inActiveRange ? 'text-cyan-300 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {lineNum}
                  </span>
                  <pre className="flex-1 font-mono whitespace-pre text-slate-300 leading-relaxed">
                    {lineText}
                  </pre>
                  {isActive && (
                    <span className="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 tracking-wider text-cyan-400 self-center">
                      ← HERE
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
