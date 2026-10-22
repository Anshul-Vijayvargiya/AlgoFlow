import { describe, it, expect } from 'vitest';
import { CHART_COLORS } from '../chartColors';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('chart colours', () => {
  it('dark keeps the charts\' original colours', () => {
    expect(CHART_COLORS.dark).toMatchObject({
      axis: '#64748B',
      grid: '#334155',
      polarAngle: '#94A3B8',
      polarRadius: '#475569',
      primary: '#38BDF8',
      radar: '#A855F7',
      tooltip: { backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC' },
    });
  });

  it('light: axis labels and tooltip text are readable (4.5:1), series and grid are visible (3:1 / drawn)', () => {
    const light = CHART_COLORS.light;
    expect(contrast(light.axis, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.polarAngle, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(String(light.tooltip.color), String(light.tooltip.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.primary, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast(light.secondary, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast(light.radar, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast(light.grid, '#FFFFFF')).toBeGreaterThan(1.2);
  });

  it('both themes define the same colours', () => {
    expect(Object.keys(CHART_COLORS.light).sort()).toEqual(Object.keys(CHART_COLORS.dark).sort());
  });
});
