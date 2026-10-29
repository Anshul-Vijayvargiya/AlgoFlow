import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition, getAllAlgorithms } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { ArrayVisualizer } from '../ArrayVisualizer';
import { deriveOutcome } from '../barVisuals';

// The real ArrayVisualizer for steps of the real Trapping Rain Water trace: the water drawn above the bars, the bar
// being decided, the pointers under the bars, and the value cards; and no water for any other array algorithm.
const def = getAlgorithmDefinition('trapping-rain-water')!;
const steps = def.generateSteps([...def.defaultInput]);
// the outcome is derived from the trace, as VisualizerPage does
const render = (s: ExecutionStep, all: ExecutionStep[] = steps) =>
  renderToStaticMarkup(<ArrayVisualizer currentStep={s} positionPointers={def.positionPointers} outcome={deriveOutcome(all, all.indexOf(s))} stepIntervalMs={700} />);
const water = (html: string) => [...html.matchAll(/data-water-index="(\d+)" data-amount="(\d+)" data-current="(true|false)"/g)].map(m => [Number(m[1]), Number(m[2]), m[3] === 'true']);
const cardValue = (html: string, name: string) => {
  const start = html.indexOf(`data-number-cell="${name}"`);
  return /data-number-value="true">(.*?)<\/dd>/.exec(html.slice(start))![1].replace(/<[^>]+>/g, '');
};

describe('Trapping Rain Water — the bar visualizer', () => {
  it('before any water: an empty overlay, the cards not set yet', () => {
    const html = render(steps[0]);
    expect(html).toContain('data-testid="water" data-total="0" data-current=""');
    expect(water(html)).toEqual([]);
    expect(cardValue(html, 'water')).toBe('—not set');
  });

  it('a step that adds water: that bar’s pool is current; the earlier pools stay; the total matches the cards', () => {
    const adds = steps.filter(s => s.codeRef?.startsWith('add-'));
    const second = adds[1];
    const html = render(second);
    const pools = water(html);
    expect(pools.filter(p => p[2])).toEqual([[second.water!.current!, second.water!.amounts[second.water!.current!], true]]);
    expect(pools.map(p => p[0])).toEqual(second.water!.amounts.flatMap((a, i) => (a > 0 ? [i] : [])));
    expect(html).toContain(`data-total="${second.variables!.water}"`);
    expect(cardValue(html, 'water')).toBe(String(second.variables!.water));
    expect(cardValue(html, 'trapped here')).toBe(String(second.water!.amounts[second.water!.current!]));
  });

  it('left and right are drawn under their bars', () => {
    const compare = steps.find(s => s.codeRef === 'compare-heights')!;
    const html = render(compare);
    expect(html).toMatch(/data-bar-index="0"[^>]*data-pointers="left"/);
    expect(html).toMatch(/data-bar-index="11"[^>]*data-pointers="right"/);
  });

  it('the last step: all 6 units drawn (bars 2, 4, 5, 6, 9 hold 1, 1, 2, 1, 1) and the outcome text', () => {
    const html = render(steps[steps.length - 1]);
    expect(water(html).map(p => [p[0], p[1]])).toEqual([[2, 1], [4, 1], [5, 2], [6, 1], [9, 1]]);
    expect(html).toContain('data-testid="water" data-total="6"');
    expect(html).toContain('Trapped water: 6 units');
  });

  it('no other array algorithm draws water', () => {
    for (const d of getAllAlgorithms().filter(a => (a.visual ?? 'array') === 'array' && a.id !== 'trapping-rain-water')) {
      const s = d.generateSteps([...d.defaultInput], d.inputSpec?.target ? { target: d.inputSpec.target.defaultValue } : d.inputSpec?.secondArray ? { second: [...d.inputSpec.secondArray.defaultValue] } : undefined);
      for (const step of [s[0], s[s.length - 1]]) {
        expect(step.water, d.id).toBeUndefined();
        expect(render(step, s), d.id).not.toContain('data-testid="water"');
      }
    }
  });
});
