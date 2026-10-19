import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExecutionStep } from '../../../types/algorithm';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';

// renderToStaticMarkup reads zustand's server snapshot (the store's initial state), so the store hook is replaced
// here by one that serves real generator steps at a chosen position. Only this file is affected.
const store = vi.hoisted(() => ({ steps: [] as ExecutionStep[], currentStepIndex: 0 }));
vi.mock('../../../store/useVisualizerStore', () => ({ useVisualizerStore: () => store }));

const { ExplanationPanel } = await import('../ExplanationPanel');

const comparingAt = (steps: ExecutionStep[], index: number) => {
  store.steps = steps;
  store.currentStepIndex = index;
  return renderToStaticMarkup(<ExplanationPanel />).match(/data-testid="comparing-values"[^>]*>([^<]*)</)![1];
};

describe('Explanation panel "Comparing" field on Bubble Sort swaps (audit L2)', () => {
  it('the compare and if-greater steps show the real comparison; the swap step shows none', () => {
    const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([2, 1]);
    expect(comparingAt(steps, steps.findIndex(s => s.type === 'compare'))).toBe('2 vs 1');
    expect(comparingAt(steps, steps.findIndex(s => s.codeRef === 'if-greater'))).toBe('2 vs 1');
    // was "1 vs 2": the post-swap values, the reverse of the comparison that ran
    expect(comparingAt(steps, steps.findIndex(s => s.type === 'swap'))).toBe('N/A');
  });

  it('no Bubble Sort swap step ever shows a comparison (default input)', () => {
    const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([8, 3, 5, 1, 6]);
    const swaps = steps.map((s, i) => [s, i] as const).filter(([s]) => s.type === 'swap');
    expect(swaps.length).toBeGreaterThan(0);
    for (const [, i] of swaps) expect(comparingAt(steps, i), `step ${i}`).toBe('N/A');
  });
});
