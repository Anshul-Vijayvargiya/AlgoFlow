import React from 'react';
import { Clock, HardDrive, Target } from 'lucide-react';

interface ComplexityBadgeProps {
  timeComplexity: { best: string; average: string; worst: string };
  spaceComplexity: string;
  bestFor: string;
}

export const ComplexityBadge: React.FC<ComplexityBadgeProps> = ({
  timeComplexity,
  spaceComplexity,
  bestFor,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Time Complexity */}
      <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-sm">
        <Clock className="w-4 h-4 text-cyan-400" />
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Time Complexity</span>
          <span className="text-xs font-mono font-bold text-cyan-200">
            {timeComplexity.average} <span className="text-[10px] text-slate-400 font-normal">(Worst: {timeComplexity.worst})</span>
          </span>
        </div>
      </div>

      {/* Space Complexity */}
      <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-sm">
        <HardDrive className="w-4 h-4 text-purple-400" />
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Space Complexity</span>
          <span className="text-xs font-mono font-bold text-purple-200">
            {spaceComplexity}
          </span>
        </div>
      </div>

      {/* Best For */}
      <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-sm">
        <Target className="w-4 h-4 text-emerald-400" />
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Best For</span>
          <span className="text-xs font-mono font-bold text-emerald-200 truncate max-w-[220px]">
            {bestFor}
          </span>
        </div>
      </div>
    </div>
  );
};
