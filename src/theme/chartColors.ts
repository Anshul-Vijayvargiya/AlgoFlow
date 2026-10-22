import type { CSSProperties } from 'react';
import { useThemeStore } from '../store/useThemeStore';
import type { ResolvedTheme } from './theme';

/**
 * Chart colours per resolved theme. Recharts writes these into SVG attributes, which do not reliably accept CSS
 * variables, so they are plain values chosen from the theme store's resolvedTheme (no theme state of their own).
 * The dark values are the charts' original colours. Series colours that read well on both backgrounds
 * (the Easy / Medium / Hard pie) are left with their data.
 */
export interface ChartColors {
  axis: string;
  grid: string;
  polarAngle: string;
  polarRadius: string;
  /** the main series (weekly bars, activity area) */
  primary: string;
  /** a second series stacked on the main one (weekly visualizer walkthroughs): orange, distinct from blue for colour-blind viewers too */
  secondary: string;
  /** the proficiency radar */
  radar: string;
  tooltip: CSSProperties;
}

const tooltipBase: CSSProperties = { borderRadius: '8px', fontSize: '12px' };

export const CHART_COLORS: Record<ResolvedTheme, ChartColors> = {
  dark: {
    axis: '#64748B',
    grid: '#334155',
    polarAngle: '#94A3B8',
    polarRadius: '#475569',
    primary: '#38BDF8',
    secondary: '#F59E0B',
    radar: '#A855F7',
    tooltip: { ...tooltipBase, backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC' },
  },
  light: {
    axis: '#475569', // slate-600: 7.6:1 on white
    grid: '#CBD5E1',
    polarAngle: '#334155',
    polarRadius: '#64748B',
    primary: '#0284C7', // sky-600: a bar / line colour with 3:1+ against white
    secondary: '#C2410C', // orange-700: 3:1+ against white
    radar: '#9333EA', // purple-600
    tooltip: { ...tooltipBase, backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' },
  },
};

export const useChartColors = (): ChartColors => CHART_COLORS[useThemeStore(s => s.resolvedTheme)];
