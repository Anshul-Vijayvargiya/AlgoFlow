import { describe, it, expect } from 'vitest';
import { radarOuterRadius } from '../progressData';

// The topic radar's radius: the usual 65% on wide charts, smaller on narrow ones so the topic names are not cut off.
const TOPICS = ['Sorting', 'Searching', 'Arrays', 'Linked List', 'Fundamentals'];

describe('radarOuterRadius', () => {
  it('wide chart: 65% of half the smaller side, as before', () => {
    expect(radarOuterRadius(600, 288, TOPICS)).toBeCloseTo(0.65 * 144);
  });

  it('narrow chart: leaves the longest name room beside the left and right vertices', () => {
    const width = 290;
    const r = radarOuterRadius(width, 240, TOPICS) as number;
    expect(r).toBeLessThan(0.65 * 120);
    // 'Fundamentals' (12 characters at ~6.5px) plus the gap fits between the vertex and the edge
    expect(width / 2 - r).toBeGreaterThanOrEqual(12 * 6.5 + 12);
  });

  it('never collapses below a readable size, and falls back to a percentage before the chart is measured', () => {
    expect(radarOuterRadius(120, 240, TOPICS)).toBe(40);
    expect(radarOuterRadius(0, 0, TOPICS)).toBe('65%');
  });
});
