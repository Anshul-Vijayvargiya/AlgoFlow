import React, { useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Shuffle, 
  Sliders, 
  Zap 
} from 'lucide-react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getSizeOptions } from './sizeOptions';

export const SizeSelect: React.FC<{ size: number; onChange: (size: number) => void; disabled?: boolean }> = ({
  size,
  onChange,
  disabled,
}) => (
  <select
    aria-label="Array size"
    value={size}
    onChange={e => onChange(Number(e.target.value))}
    disabled={disabled}
    className="h-6 bg-transparent text-xs font-mono text-cyan-300 cursor-pointer rounded disabled:opacity-40"
  >
    {getSizeOptions(size).map(option => (
      <option key={option} value={option} className="bg-slate-900">
        {option}
      </option>
    ))}
  </select>
);

export const ExecutionControls: React.FC = () => {
  const {
    currentStepIndex,
    steps,
    isPlaying,
    speed,
    arraySize,
    nextStep,
    previousStep,
    togglePlay,
    reset,
    setSpeed,
    setArraySize,
    randomizeArray,
  } = useVisualizerStore();

  const totalSteps = steps.length;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPlaying) {
      if (currentStepIndex < totalSteps - 1) {
        timer = setTimeout(() => {
          nextStep();
        }, speed);
      } else {
        useVisualizerStore.getState().pause();
      }
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, totalSteps, speed, nextStep]);

  return (
    <div role="region"
      aria-label="Playback controls"
      className="bg-[#0B0F19] border border-cyan-500/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          disabled={totalSteps === 0}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          title="Reset (↻)"
          aria-label="Reset"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={previousStep}
          aria-label="Previous step"
          disabled={currentStepIndex === 0 || isPlaying}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <button
          onClick={togglePlay}
          disabled={totalSteps === 0}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
            isPlaying
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 shadow-amber-500/10'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/20'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 fill-amber-300" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Play</span>
            </>
          )}
        </button>

        <button
          onClick={nextStep}
          aria-label="Next step"
          disabled={currentStepIndex >= totalSteps - 1 || isPlaying}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div
        role="group"
        aria-label={`Execution step ${totalSteps === 0 ? 0 : currentStepIndex + 1} of ${totalSteps}`}
        data-testid="step-counter"
        data-step={totalSteps === 0 ? 0 : currentStepIndex + 1}
        data-total={totalSteps}
        className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800"
      >
        <span className="text-[11px] font-mono text-slate-400">Step:</span>
        <span className="text-xs font-mono font-bold text-cyan-300 whitespace-nowrap">
          {totalSteps === 0 ? 0 : currentStepIndex + 1} / {totalSteps}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <button
          onClick={randomizeArray}
          aria-label="Randomize"
          disabled={isPlaying}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 disabled:opacity-40 transition-all"
          title="Randomize Array"
        >
          <Shuffle className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Randomize</span>
        </button>

        <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
          <Sliders className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-mono text-slate-400">Size:</span>
          <SizeSelect size={arraySize} onChange={setArraySize} disabled={isPlaying} />
        </div>

        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-mono text-slate-400">Speed:</span>
          <input
            type="range"
            aria-label="Playback speed"
            aria-valuetext={`${speed} ms per step`}
            min="100"
            max="1200"
            step="100"
            value={1300 - speed}
            onChange={(e) => setSpeed(1300 - Number(e.target.value))}
            className="w-20 h-6 accent-cyan-400 cursor-pointer bg-transparent rounded-lg"
          />
        </div>
      </div>
    </div>
  );
};
