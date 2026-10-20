import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';

// As in explanationPanel.render.test: static rendering reads the store's initial state, so the store hook is replaced
// by one serving chosen values (with or without a selector, as the components call it). Only this file is affected.
const store = vi.hoisted(() => ({
  selectedAlgorithm: 'll-search' as string,
  steps: [] as unknown[],
  currentStepIndex: 0,
  array: [] as number[],
  target: null as number | null,
  index: null as number | null,
  inputRevision: 0,
  inputNotice: null as unknown,
  applyInput: () => ({ ok: true }),
  restoreOriginalInput: () => {},
}));
vi.mock('../../../store/useVisualizerStore', () => ({
  useVisualizerStore: (selector?: (s: typeof store) => unknown) => (selector ? selector(store) : store),
}));

const { ExplanationPanel } = await import('../ExplanationPanel');
const { LinkedListInputPanel } = await import('../LinkedListInputPanel');

const gen = (id: AlgorithmId, input: number[], params?: Record<string, unknown>) => getAlgorithmDefinition(id)!.generateSteps([...input], params);
const explain = (steps: ExecutionStep[], index: number) => {
  store.steps = steps;
  store.currentStepIndex = index;
  return renderToStaticMarkup(<ExplanationPanel />);
};
const textOf = (html: string, testId: string) => html.match(new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`))![1];
const readouts = (html: string) =>
  [...html.matchAll(/data-pointer-readout="([^"]+)"[^>]*>(.*?)<\/span>(?=<span data-pointer-readout|<\/div>)/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, '').replace(/&gt;/g, '>')]);

describe('Explanation panel — linked-list steps', () => {
  it('shows the list read from HEAD and positions instead of the array state and indices', () => {
    const steps = gen('ll-search', [4, 7, 1], { value: 7 });
    const k = steps.findIndex(s => s.codeRef === 'check-match');
    const html = explain(steps, k);
    expect(textOf(html, 'step-state')).toBe('4 → 7 → 1 → NULL');
    expect(html).toContain('List:');
    expect(html).toContain('Positions:');
    expect(html).not.toContain('Array State:');
    expect(html).not.toContain('Indices:');
    expect(textOf(html, 'step-positions')).toBe('[0]');
    expect(textOf(html, 'comparing-values')).toBe('4 vs 7');
  });

  it('lists HEAD, TAIL and every named pointer with where it points (NULL and outside the list included)', () => {
    const steps = gen('ll-delete-tail', [4, 7, 9]);
    const html = explain(steps, steps.findIndex(s => s.codeRef === 'unlink'));
    expect(readouts(html)).toEqual([
      ['HEAD', '→HEAD4 (#0)'],
      ['TAIL', '→TAIL9 (outside the list)'],
      ['prev', '→prev7 (#1)'],
      ['temp', '→temp9 (outside the list)'],
    ]);
    const rev = gen('reverse-linked-list', [1, 2]);
    expect(readouts(explain(rev, rev.findIndex(s => s.codeRef === 'set-prev')))).toContainEqual(['prev', '→prevNULL']);
    expect(textOf(explain(gen('ll-traverse', []), 0), 'step-state')).toBe('NULL (empty)');
  });

  it('array steps are unchanged', () => {
    const steps = gen('bubble-sort', [2, 1]);
    const html = explain(steps, 0);
    expect(html).toContain('Array State:');
    expect(textOf(html, 'step-state')).toBe('[2, 1]');
  });
});

describe('Linked-list input panel', () => {
  const panel = (id: AlgorithmId) => {
    const d = getAlgorithmDefinition(id)!;
    store.selectedAlgorithm = id;
    store.array = [...d.defaultInput];
    store.target = d.inputSpec?.value?.defaultValue ?? null;
    store.index = d.inputSpec?.index?.defaultValue ?? null;
    return renderToStaticMarkup(<LinkedListInputPanel />);
  };
  beforeEach(() => {
    store.inputNotice = null;
  });

  it('every operation has the list field; Search a target value, inserts a new value, positional ones a position', () => {
    const fields = (html: string) => [...html.matchAll(/<input id="([a-z-]+)"/g)].map(m => m[1]);
    expect(fields(panel('ll-traverse'))).toEqual(['list-input']);
    expect(fields(panel('ll-build'))).toEqual(['list-input']);
    expect(fields(panel('reverse-linked-list'))).toEqual(['list-input']);
    expect(fields(panel('ll-search'))).toEqual(['list-input', 'value-input']);
    expect(panel('ll-search')).toMatch(/<label for="value-input"[^>]*>.*Target value<\/label>/);
    for (const id of ['ll-insert-head', 'll-insert-tail'] as const) {
      expect(fields(panel(id))).toEqual(['list-input', 'value-input']);
      expect(panel(id)).toMatch(/<label for="value-input"[^>]*>.*New value<\/label>/);
    }
    expect(fields(panel('ll-insert-at'))).toEqual(['list-input', 'value-input', 'index-input']);
    expect(fields(panel('ll-delete-at'))).toEqual(['list-input', 'index-input']);
    expect(panel('ll-delete-at')).toMatch(/<label for="index-input"[^>]*>.*Position<\/label>/);
  });

  it('starts from the applied input, valid, with the node limit in the hint', () => {
    const html = panel('ll-insert-at');
    expect(html).toContain('value="4, 7, 9"');
    expect(html).toMatch(/id="value-input"[^>]*value="5"/);
    expect(html).toMatch(/id="index-input"[^>]*value="2"/);
    expect(html).not.toContain('data-testid="input-error"');
    expect(html).toContain('Up to 9 whole numbers');
    expect(panel('ll-traverse')).toContain('Up to 10 whole numbers');
  });

  it('an invalid applied input (e.g. a kept position out of range) is shown with the field marked', () => {
    store.selectedAlgorithm = 'll-delete-at';
    store.array = [1, 2];
    store.index = 5;
    const html = renderToStaticMarkup(<LinkedListInputPanel />);
    expect(html).toMatch(/data-testid="input-error" data-field="index"/);
    expect(html).toContain('Index 5 is out of range. For a list of 2 nodes, delete at 0 to 1.');
    expect(html).toMatch(/id="index-input"[^>]*aria-invalid="true"/);
    expect(html).toMatch(/id="apply-input" disabled=""/);
  });

  it('a replaced custom list can be restored', () => {
    store.inputNotice = { kind: 'replaced-custom', original: [3, 1] };
    const html = panel('ll-traverse');
    expect(html).toContain('Your entered list (3, 1) was replaced by a random one.');
    expect(html).toContain('Restore my list');
  });
});
