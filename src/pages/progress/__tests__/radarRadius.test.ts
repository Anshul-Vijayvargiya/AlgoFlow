import { describe, it, expect } from 'vitest';
import { RADAR_LABEL_LINE_CHARS, radarLineChars, radarOuterRadius, wrapRadarLabel } from '../progressData';
import { ALGORITHM_CATEGORIES } from '../../../data/algorithmMetadata';

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

  it('a long name is measured by its longest line once wrapped, not by its whole length', () => {
    const withHeap = [...TOPICS, 'Heap & Priority Queue'];
    // "Priority Queue" (14) is now the longest line, so the radius is what a 14-character name allows
    expect(radarOuterRadius(320, 240, withHeap)).toBeCloseTo(160 - (14 * 6.5 + 12));
    expect(radarOuterRadius(320, 240, withHeap)).toBe(radarOuterRadius(320, 240, [...TOPICS, 'Priority Queue']));
    // a future "Dynamic Programming" wraps to "Dynamic" / "Programming": no smaller than with "Bit Manipulation"
    expect(radarOuterRadius(320, 240, [...withHeap, 'Dynamic Programming'])).toBe(radarOuterRadius(320, 240, withHeap));
    expect(radarOuterRadius(320, 240, [...withHeap, 'Bit Manipulation'])).toBeCloseTo(160 - (16 * 6.5 + 12));
  });
});

describe('radarLineChars', () => {
  it('16 characters on the charts of 390px and 360px phones (308px and 278px wide) and wider; before measuring too', () => {
    // 272: a margin below the 360px phone's chart, whose width differs by a fraction of a pixel between browsers
    for (const width of [600, 400, 308, 278, 272]) expect(radarLineChars(width), String(width)).toBe(16);
    expect(radarLineChars(0)).toBe(16);
  });

  it('fewer on the chart of a 320px phone (238px wide), so a 16-character name wraps there; never under 8', () => {
    expect(radarLineChars(238)).toBe(12);
    expect(radarLineChars(100)).toBe(8);
  });
});

describe('wrapRadarLabel', () => {
  it('names of up to 16 characters stay on one line: every topic shown before Heap & Priority Queue is unchanged', () => {
    for (const name of ['Sorting', 'Searching', 'Arrays', 'Strings', 'Linked List', 'Trees', 'Backtracking', 'Bit Manipulation', 'Fundamentals', 'Stack & Queue', 'Graphs', 'Greedy']) {
      expect(wrapRadarLabel(name), name).toEqual([name]);
    }
    expect(RADAR_LABEL_LINE_CHARS).toBe(16);
  });

  it('a longer name splits into two lines at the space that keeps the longer line shortest', () => {
    expect(wrapRadarLabel('Heap & Priority Queue')).toEqual(['Heap &', 'Priority Queue']);
    expect(wrapRadarLabel('Dynamic Programming')).toEqual(['Dynamic', 'Programming']);
    expect(wrapRadarLabel('Heap & Priority Queue').join(' ')).toBe('Heap & Priority Queue');
  });

  it('with a shorter line length (a narrow chart), names longer than it wrap too', () => {
    expect(wrapRadarLabel('Bit Manipulation', 12)).toEqual(['Bit', 'Manipulation']);
    expect(wrapRadarLabel('Linked List', 12)).toEqual(['Linked List']);
    expect(wrapRadarLabel('Heap & Priority Queue', 12)).toEqual(['Heap &', 'Priority Queue']);
  });

  it('a name with no space stays whole rather than being cut inside a word', () => {
    expect(wrapRadarLabel('Supercalifragilistic')).toEqual(['Supercalifragilistic']);
  });

  it('every category of the app, as a topic name, fits in two lines of at most 16 characters', () => {
    const topicName = (label: string) => label.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    for (const c of ALGORITHM_CATEGORIES) {
      const lines = wrapRadarLabel(topicName(c.label));
      expect(lines.length, c.label).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length, `${c.label}: "${line}"`).toBeLessThanOrEqual(RADAR_LABEL_LINE_CHARS);
    }
  });
});
