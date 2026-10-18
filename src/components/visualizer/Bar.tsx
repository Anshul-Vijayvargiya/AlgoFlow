import React from 'react';
import { motion } from 'framer-motion';
import type { BarVisual, BarRole } from './barVisuals';

interface BarProps {
  visual: BarVisual;
  /** bar height as a percentage of the plot area, computed by ArrayVisualizer from the whole array */
  heightPercent: number;
  /** denser layout for longer arrays */
  compact?: boolean;
  /** first or last bar of the chart: its pointer chip must not extend past that chart edge */
  edge?: 'start' | 'end';
}

interface RoleStyle {
  gradient: string;
  text: string;
  glow: string;
  badge: string;
  /** human-readable role used in the accessible name */
  label: string;
}

const ROLE_STYLES: Record<BarRole, RoleStyle> = {
  default: {
    gradient: 'from-cyan-600/40 via-blue-600/30 to-slate-800/80 border-cyan-500/20',
    text: 'text-cyan-200/80',
    glow: '',
    badge: '',
    label: '',
  },
  sorted: {
    gradient: 'from-emerald-500/80 via-teal-600/80 to-emerald-700/80 border-emerald-500/50',
    text: 'text-emerald-300 font-medium',
    glow: 'shadow-[0_0_12px_rgba(16,185,129,0.3)]',
    badge: '',
    label: 'sorted',
  },
  focus: {
    gradient: 'from-cyan-400/60 via-sky-500/50 to-slate-800/80 border-cyan-300',
    text: 'text-cyan-100 font-semibold',
    glow: 'ring-2 ring-cyan-300/70',
    badge: '',
    label: 'examined',
  },
  assign: {
    gradient: 'from-sky-400 via-blue-500 to-indigo-600 border-sky-300',
    text: 'text-sky-200 font-bold',
    glow: 'ring-2 ring-sky-400/80',
    badge: 'ASSIGN',
    label: 'assigned',
  },
  min: {
    gradient: 'from-teal-300 via-cyan-400 to-teal-600 border-teal-200',
    text: 'text-teal-200 font-bold',
    glow: 'ring-2 ring-teal-300/80',
    badge: 'MIN',
    label: 'current minimum',
  },
  insert: {
    gradient: 'from-pink-400 via-fuchsia-500 to-pink-600 border-pink-300',
    text: 'text-pink-200 font-bold',
    glow: 'ring-2 ring-pink-400/80',
    badge: 'INSERT',
    label: 'insertion position',
  },
  compare: {
    gradient: 'from-amber-400 via-orange-500 to-yellow-600 border-amber-300',
    text: 'text-amber-300 font-bold',
    glow: 'shadow-glow-amber ring-2 ring-amber-400/80',
    badge: 'COMPARE',
    label: 'being compared',
  },
  pivot: {
    gradient: 'from-purple-500 via-indigo-600 to-purple-700 border-purple-400',
    text: 'text-purple-300 font-bold',
    glow: 'shadow-glow-purple ring-2 ring-purple-400',
    badge: 'PIVOT',
    label: 'pivot',
  },
  swap: {
    gradient: 'from-rose-500 via-pink-600 to-red-600 border-rose-400',
    text: 'text-rose-300 font-bold',
    glow: 'shadow-[0_0_25px_rgba(244,63,94,0.6)] ring-2 ring-rose-400',
    badge: 'SWAP',
    label: 'swapped',
  },
  found: {
    gradient: 'from-emerald-400 via-teal-500 to-green-600 border-emerald-300',
    text: 'text-emerald-300 font-bold',
    glow: 'shadow-glow-green ring-2 ring-emerald-400/80',
    badge: 'MATCH',
    label: 'match',
  },
};

export const Bar: React.FC<BarProps> = ({ visual, heightPercent, compact = false, edge }) => {
  const { index, value, role, inRange, pointers } = visual;
  const style = ROLE_STYLES[role];
  const dim = !inRange && role === 'default';
  const name =
    `Index ${index}, value ${value}` +
    (style.label ? `, ${style.label}` : '') +
    (dim ? ', outside the current range' : '') +
    (pointers.length ? `, pointer ${pointers.join(' and ')}` : '');

  return (
    <div
      role="img"
      aria-label={name}
      data-bar-index={index}
      data-role={role}
      data-in-range={inRange ? 'true' : 'false'}
      data-pointers={pointers.join(',')}
      data-value={value}
      data-height={heightPercent.toFixed(1)}
      className={`flex flex-col items-center h-full flex-1 max-w-[56px] ${compact ? 'min-w-[12px] sm:min-w-[16px]' : 'min-w-[28px]'} relative group transition-opacity duration-200 ${
        dim ? 'opacity-40' : 'opacity-100'
      }`}
    >
      {/* plot area: value label + bar, bottom-aligned */}
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-end relative">
        <div className="relative mb-1.5 flex flex-col items-center">
          {style.badge && (
            <motion.span
              initial={{ opacity: 0, y: 5, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute bottom-full mb-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 tracking-wider text-slate-200 z-10 shadow-lg"
            >
              {style.badge}
            </motion.span>
          )}
          <span className={`${compact ? 'text-[9px] sm:text-xs' : 'text-xs'} font-mono transition-colors ${style.text}`}>{value}</span>
        </div>
        <div
          style={{ height: `${heightPercent}%` }}
          className={`w-full rounded-t-xl bg-gradient-to-t border-t border-x ${style.gradient} ${style.glow} transition-[height,background-color,box-shadow] duration-300 flex flex-col justify-between items-center py-2 relative overflow-hidden`}
        >
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
        </div>
      </div>

      <div className="mt-2 text-center">
        <span className="text-[10px] font-mono text-slate-500 bg-slate-900/90 border border-slate-800 px-1.5 py-0.5 rounded">
          [{index}]
        </span>
      </div>

      {/* pointer row: fixed height so bars never jump when pointers appear/disappear. A chip can be wider than a
          narrow bar (16 values on a phone): centred, it would hang over both sides, which on the first/last bar means
          past the chart edge. On edge bars the row is pinned to the outer edge and the min-w-full wrapper keeps the
          chip centred while it fits, so a wider chip only grows inward, whatever the font. */}
      <div
        className={`w-full h-5 mt-1 flex items-start ${edge === 'start' ? 'justify-start' : edge === 'end' ? 'justify-end' : 'justify-center'}`}
        data-chip-align={edge ?? 'center'}
      >
        {pointers.length > 0 && (
          <div className="min-w-full shrink-0 flex justify-center">
            <span
              className="text-[9px] font-mono font-bold leading-none px-1 py-0.5 rounded bg-cyan-900/60 border border-cyan-600/60 text-cyan-200 whitespace-nowrap"
              data-pointer-chip
            >
              ▲{pointers.join('·')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
