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

describe('Explanation panel summary rows: arrays unchanged; text and tree steps show their own data, never an empty array', () => {
  const panel = (steps: ExecutionStep[], index: number) => {
    store.steps = steps;
    store.currentStepIndex = index;
    return renderToStaticMarkup(<ExplanationPanel />);
  };
  const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  /** the label and value of a summary row (step-positions or step-state) */
  const row = (html: string, testId: string) => {
    const at = html.indexOf(`data-testid="${testId}"`);
    const before = html.slice(0, at);
    const label = [...before.matchAll(/<span class="text-slate-400[^"]*">(?:<svg.*?<\/svg>)?([^<]+)<\/span>/g)].at(-1)![1];
    const tag = html.slice(at, html.indexOf('</span>', at));
    return { label, value: decode(tag.slice(tag.indexOf('>') + 1)), kind: /data-kind="([a-z]+)"/.exec(tag)![1], truncated: /class="[^"]*truncate/.test(tag.split('>')[0]) };
  };

  it('arrays: Indices and Array State exactly as before (no new truncation on the indices)', () => {
    const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([2, 1]);
    const html = panel(steps, steps.findIndex(s => s.type === 'compare'));
    expect(row(html, 'step-positions')).toEqual({ label: 'Indices:', value: '[0, 1]', kind: 'array', truncated: false });
    expect(row(html, 'step-state')).toEqual({ label: 'Array State:', value: '[2, 1]', kind: 'array', truncated: true });
  });

  it('text with several rows: each pointer named by its row, and every string quoted', () => {
    const steps = getAlgorithmDefinition('find-first-occurrence')!.generateSteps([], { texts: ['hello', 'll'] });
    const k = steps.findIndex(s => s.codeRef === 'compare' && (s.variables as { i: number; j: number }).j === 1);
    const html = panel(steps, k);
    const { i } = steps[k].variables as { i: number };
    expect(row(html, 'step-positions')).toMatchObject({ label: 'Pointers:', value: `haystack.i = ${i}, haystack.i + j = ${i + 1}, needle.j = 1`, kind: 'text' });
    expect(row(html, 'step-state')).toMatchObject({ label: 'Strings:', value: 'haystack = "hello"; needle = "ll"', kind: 'text' });
    expect(html).not.toContain('Array State:');
    expect(html).not.toContain('Indices:');
  });

  it('text with one row: pointers by their own name; before any pointer exists, None (not an empty array)', () => {
    const steps = getAlgorithmDefinition('roman-to-integer')!.generateSteps([], { texts: ['IV'] });
    expect(row(panel(steps, steps.findIndex(s => s.codeRef === 'read-value')), 'step-positions').value).toBe('i = 0');
    const start = panel(steps, 0);
    expect(row(start, 'step-positions').value).toBe('None');
    expect(row(start, 'step-state').value).toBe('s = "IV"');
    expect(start).not.toMatch(/data-testid="step-state"[^>]*>\[\]</);
  });

  it('trees: the current node and the output so far', () => {
    const steps = getAlgorithmDefinition('tree-inorder')!.generateSteps([], { texts: ['[1, 2, 3, 4, 5, null, 6]'] });
    const thirdVisit = steps.map((s, i) => [s, i] as const).filter(([s]) => s.codeRef === 'visit')[2][1];
    const html = panel(steps, thirdVisit);
    expect(row(html, 'step-positions')).toMatchObject({ label: 'Current node:', value: '5', kind: 'tree' });
    expect(row(html, 'step-state')).toMatchObject({ label: 'Output:', value: '[4, 2, 5]', kind: 'tree' });
    const start = panel(steps, 0);
    expect([row(start, 'step-positions').value, row(start, 'step-state').value]).toEqual(['None', '[]']);
    expect(html).not.toContain('Array State:');
  });
});
