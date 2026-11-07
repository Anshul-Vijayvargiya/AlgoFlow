import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RadarTopicTick, type RadarTopicTickProps } from '../RadarTopicTick';

// One topic name on the radar: placed like recharts' own tick text, on one line or, when long, on two.
const render = (value: string, extra: Partial<RadarTopicTickProps> = {}) =>
  renderToStaticMarkup(
    <svg>
      <RadarTopicTick x={100} y={50} textAnchor="end" verticalAnchor="middle" fill="#888" fontSize={11} payload={{ value }} {...extra} />
    </svg>
  );
const spans = (html: string) => [...html.matchAll(/<tspan x="100" dy="([^"]+)">([^<]*)<\/tspan>/g)].map(m => `${m[1]} ${m[2].replace(/&amp;/g, '&')}`);

describe('RadarTopicTick', () => {
  it('a short name: one line, where recharts puts its own tick text (same classes, anchor, colour and size)', () => {
    const html = render('Linked List');
    expect(html).toMatch(/<text x="100" y="50" text-anchor="end" fill="#888" font-size="11" class="recharts-text recharts-polar-angle-axis-tick-value" data-lines="1">/);
    expect(spans(html)).toEqual(['0.355em Linked List']);
    expect(spans(render('Sorting', { verticalAnchor: 'start' }))).toEqual(['0.71em Sorting']);
    expect(spans(render('Sorting', { verticalAnchor: 'end' }))).toEqual(['0em Sorting']);
  });

  it('"Heap & Priority Queue": two lines, centred on a side vertex', () => {
    const html = render('Heap & Priority Queue');
    expect(html).toContain('data-lines="2"');
    expect(spans(html)).toEqual(['-0.145em Heap &', '1em Priority Queue']);
  });

  it('a narrow chart passes a shorter line length: "Bit Manipulation" wraps there, a short name does not', () => {
    expect(spans(render('Bit Manipulation'))).toEqual(['0.355em Bit Manipulation']);
    expect(spans(render('Bit Manipulation', { lineChars: 12 }))).toEqual(['-0.145em Bit', '1em Manipulation']);
    expect(spans(render('Trees', { lineChars: 12 }))).toEqual(['0.355em Trees']);
  });

  it('a future "Dynamic Programming": two lines that grow away from the radar above and below it', () => {
    // above the radar (recharts' "end"): the last line sits where a one-line name would, the first one above it
    expect(spans(render('Dynamic Programming', { verticalAnchor: 'end' }))).toEqual(['-1em Dynamic', '1em Programming']);
    // below the radar ("start"): the first line sits where a one-line name would, the second one below it
    expect(spans(render('Dynamic Programming', { verticalAnchor: 'start' }))).toEqual(['0.71em Dynamic', '1em Programming']);
  });
});
