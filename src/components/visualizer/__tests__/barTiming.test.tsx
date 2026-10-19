import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import { ArrayVisualizer } from '../ArrayVisualizer';
import * as barVisuals from '../barVisuals';

// Audit R1: bar heights animated for a fixed 300 ms while playback can advance every 100 ms, so at fast speeds a step
// was replaced before its bars reached their new heights (measured in Chromium: 52 of 150 Insertion Sort steps at
// 100 ms). The animation now fits inside one step, and is switched off for users who prefer reduced motion.
const transitionMs = (barVisuals as Record<string, unknown>).barTransitionMs as ((interval?: number) => number) | undefined;

const render = (stepIntervalMs?: number) => {
  const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([3, 1, 2]);
  const props = { currentStep: steps[0], ...(stepIntervalMs === undefined ? {} : { stepIntervalMs }) };
  return renderToStaticMarkup(<ArrayVisualizer {...props} />);
};
/** inline transition-duration of every bar's height element */
const heightDurations = (html: string) => [...html.matchAll(/style="height:[^"]*?transition-duration:(\d+)ms"/g)].map(m => Number(m[1]));

describe('bar animation fits inside one playback step (audit R1)', () => {
  it('300 ms at the default speed and slower; 60% of the step interval when steps are faster', () => {
    expect(transitionMs, 'barTransitionMs is exported').toBeTypeOf('function');
    expect([undefined, 1200, 700, 500].map(v => transitionMs!(v))).toEqual([300, 300, 300, 300]);
    expect([400, 300, 200, 100].map(v => transitionMs!(v))).toEqual([240, 180, 120, 60]);
    // the animation always ends before the next step can appear
    for (let interval = 100; interval <= 1200; interval += 100) expect(transitionMs!(interval)).toBeLessThan(interval);
  });

  it('the rendered bar heights use that duration (default and fastest speed)', () => {
    expect(heightDurations(render())).toEqual([300, 300, 300]);
    expect(heightDurations(render(700))).toEqual([300, 300, 300]);
    expect(heightDurations(render(100))).toEqual([60, 60, 60]);
  });

  it('every bar transition is switched off when the user prefers reduced motion', () => {
    const html = render(700);
    const heights = [...html.matchAll(/<div style="height:[^"]*" class="([^"]*)"/g)].map(m => m[1]);
    expect(heights).toHaveLength(3);
    for (const cls of heights) expect(cls.split(/\s+/)).toContain('motion-reduce:transition-none');
    const bars = [...html.matchAll(/<div role="img"[^>]*class="([^"]*)"/g)].map(m => m[1]);
    expect(bars).toHaveLength(3);
    for (const cls of bars) expect(cls.split(/\s+/)).toContain('motion-reduce:transition-none');
  });
});
