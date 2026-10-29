import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { NumberVisualizer } from '../NumberVisualizer';

// The real NumberVisualizer for steps of the real Valid Perfect Square, Sqrt(x) and Arranging Coins traces: the value
// cards, the search range drawn and said in words, the probes so far, and the result.
const steps = (id: AlgorithmId, input: number[]) => getAlgorithmDefinition(id)!.generateSteps(input);
const render = (id: AlgorithmId, input: number[], at: (s: ExecutionStep[]) => number) => {
  const all = steps(id, input);
  return renderToStaticMarkup(<NumberVisualizer currentStep={all[at(all)]} stepIntervalMs={700} />);
};
const attr = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(m => m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<'));
const cell = (html: string, name: string) => {
  const start = html.indexOf(`data-number-cell="${name}"`);
  if (start < 0) return null;
  const next = html.indexOf('data-number-cell="', start + 1);
  const card = html.slice(start, next < 0 ? undefined : next);
  return {
    role: /data-role="([a-z]*)"/.exec(card)![1],
    value: /data-number-value="[^"]*">(.*?)<\/dd>/.exec(card)![1].replace(/<[^>]+>/g, ''),
  };
};
const nth = (ref: string, n = 0) => (s: ExecutionStep[]) => s.map((x, i) => [x, i] as const).filter(([x]) => x.codeRef === ref)[n][1];

describe('NumberSearchPanel — Sqrt(x)', () => {
  it('before the search starts: only x, no range yet', () => {
    const html = render('sqrt-x', [8], () => 0);
    expect(attr(html, 'data-number-cell')).toEqual(['x', 'lo', 'hi', 'mid', 'mid × mid', 'ans']);
    expect(cell(html, 'x')?.value).toBe('8');
    expect(cell(html, 'lo')?.value).toBe('—not set');
    expect(html).not.toContain('data-testid="number-search"');
  });

  it('a comparison: lo, hi and mid in words and as data, the window over 0 … x, and the probe marked current', () => {
    const html = render('sqrt-x', [8], nth('compare', 1));
    expect(html).toMatch(/data-testid="number-search" data-lo="0" data-hi="3" data-mid="1"/);
    expect(html).toContain('Searching lo = 0 … hi = 3, mid = 1');
    // the window spans 0 … 3 of 0 … 8
    expect(html).toMatch(/data-testid="number-search-window" style="left:0%;width:max\(37\.5%, 4px\)/);
    expect(attr(html, 'data-mid').slice(1)).toEqual(['4', '1']);
    expect(attr(html, 'data-relation')).toEqual(['>', '<']);
    expect(html).toMatch(/data-mid="1" data-relation="&lt;" data-current="true" aria-current="step"/);
    expect(html).toContain('mid = 4 · mid × mid = 16 &gt; 8');
    expect(html).toContain('mid = 1 · mid × mid = 1 &lt; 8');
    expect(html).toContain('Probes (2)');
    expect(cell(html, 'mid × mid')).toEqual({ role: 'changed', value: '1' });
    expect(html).not.toContain('data-testid="number-result"');
  });

  it('after the loop: the range is over, said in words, with no window drawn, and the answer banner', () => {
    const html = render('sqrt-x', [8], s => s.length - 1);
    expect(html).toContain('Search over: lo = 3 &gt; hi = 2');
    expect(html).not.toContain('data-testid="number-search-window"');
    expect(html).toMatch(/role="status" data-testid="number-result" data-result-kind="answer"[^>]*>.*Sqrt\(8\) = 2: 2² = 4 ≤ 8 &lt; 3² = 9\./);
    expect(cell(html, 'ans')).toEqual({ role: 'current', value: '2' });
    expect(attr(html, 'data-current')).not.toContain('true');
  });

  it('x = 2^31 - 1: the 61-bit product is shown exactly', () => {
    const html = render('sqrt-x', [2147483647], nth('compare'));
    expect(cell(html, 'mid × mid')?.value).toBe('1152921502459363329');
    expect(html).toContain('mid = 1073741823 · mid × mid = 1152921502459363329 &gt; 2147483647');
  });
});

describe('NumberSearchPanel — Valid Perfect Square', () => {
  it('found: the equal probe is green, and the banner says yes', () => {
    const html = render('valid-perfect-square', [16], s => s.length - 1);
    expect(attr(html, 'data-relation')).toEqual(['>', '<', '>', '=']);
    expect(html).toMatch(/data-mid="4" data-relation="=" data-current="true"[^>]*class="[^"]*text-emerald-300/);
    expect(html).toMatch(/data-result-kind="yes"[^>]*>.*16 is a perfect square: 4 × 4 = 16\./);
  });

  it('not found: the banner says no, between which squares', () => {
    const html = render('valid-perfect-square', [14], s => s.length - 1);
    expect(html).toMatch(/data-result-kind="no"[^>]*>.*14 is not a perfect square: 3² = 9 &lt; 14 &lt; 4² = 16\./);
  });

  it('num = 0: a single-number range is drawn without dividing by zero', () => {
    const html = render('valid-perfect-square', [0], nth('calc-mid'));
    expect(html).toMatch(/data-testid="number-search-window" style="left:0%;width:max\(0%, 4px\)/);
    expect(html).not.toContain('NaN');
  });
});

describe('NumberSearchPanel — Arranging Coins', () => {
  it('the probe shows the staircase count it needs', () => {
    const html = render('arranging-coins', [8], nth('calc-coins'));
    expect(cell(html, 'coins')).toEqual({ role: 'changed', value: '10' });
    expect(html).toContain('mid = 4 · mid(mid+1)/2 = 10 &gt; 8');
  });

  it('the answer banner gives the rows and the coins they use', () => {
    const html = render('arranging-coins', [8], s => s.length - 1);
    expect(html).toMatch(/data-result-kind="answer"[^>]*>.*8 coins make 3 complete rows: 3 rows use 6; 4 would need 10\./);
  });

  it('no step of any trace renders a NaN or an out-of-bar position', () => {
    for (const id of ['arranging-coins', 'sqrt-x', 'valid-perfect-square'] as const) {
      for (const input of [[0], [1], [100], [2147483647]]) {
        const all = steps(id, input);
        // every step of the short traces; every 7th step (and the last) of the ~190-step trace for 2^31 - 1
        const every = input[0] > 1000 ? 7 : 1;
        const indices = [...all.keys()].filter(i => i % every === 0 || i === all.length - 1);
        for (const i of indices) {
          const html = renderToStaticMarkup(<NumberVisualizer currentStep={all[i]} stepIntervalMs={700} />);
          expect(html, `${id} ${input} step ${i}`).not.toMatch(/NaN|Infinity|left:-|left:1\d\d\.|left:[2-9]\d\d/);
        }
      }
    }
  });
});
