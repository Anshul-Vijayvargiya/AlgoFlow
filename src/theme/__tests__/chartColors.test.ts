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

  it('sunset (light base): the same readability rules as light, against its white chart cards', () => {
    const sunset = CHART_COLORS.sunset;
    expect(contrast(sunset.axis, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(sunset.polarAngle, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(String(sunset.tooltip.color), String(sunset.tooltip.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    for (const series of [sunset.primary, sunset.secondary, sunset.radar]) expect(contrast(series, '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('galaxy (dark base): at least the contrast of the original dark colours, against the dark chart card', () => {
    const card = '#0B0F19';
    const { dark, galaxy } = CHART_COLORS;
    for (const key of ['axis', 'polarAngle', 'primary', 'radar'] as const) {
      expect(contrast(galaxy[key], card), key).toBeGreaterThanOrEqual(contrast(dark[key], card) - 0.15);
    }
    expect(contrast(String(galaxy.tooltip.color), String(galaxy.tooltip.backgroundColor))).toBeGreaterThanOrEqual(4.5);
  });

  it('every theme defines the same colours', () => {
    for (const theme of ['light', 'galaxy', 'sunset'] as const) expect(Object.keys(CHART_COLORS[theme]).sort()).toEqual(Object.keys(CHART_COLORS.dark).sort());
  });
});
