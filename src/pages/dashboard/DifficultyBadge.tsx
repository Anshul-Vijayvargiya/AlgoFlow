import React from 'react';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/** distinct per level, with the level always written out (never colour alone); readable in both themes */
const STYLE: Record<Difficulty, string> = {
  Easy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  Medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Hard: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

export const DifficultyBadge: React.FC<{ level: Difficulty; children?: React.ReactNode }> = ({ level, children }) => (
  <span
    data-difficulty={level}
    className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${STYLE[level]}`}
  >
    {level}
    {children}
  </span>
);
