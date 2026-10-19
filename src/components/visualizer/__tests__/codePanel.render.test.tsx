import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AlgorithmId, ExecutionStep, ProgrammingLanguage } from '../../../types/algorithm';
import * as Registry from '../../../engine/AlgorithmRegistry';

// renderToStaticMarkup reads zustand's server snapshot (the store's initial state), so the store hook is replaced
// here by one that serves real generator steps and the real resolvers at a chosen position. Only this file is affected.
const store = vi.hoisted(() => ({
  selectedAlgorithm: 'bubble-sort' as AlgorithmId,
  selectedLanguage: 'cpp' as ProgrammingLanguage,
  steps: [] as ExecutionStep[],
  currentStepIndex: 0,
  resolveCurrentLine: (): number | null => null,
  resolveCurrentRange: (): { start: number; end: number } | null => null,
}));
vi.mock('../../../store/useVisualizerStore', () => ({ useVisualizerStore: () => store }));

const { CodePanel } = await import('../CodePanel');

type Ranged = (d: unknown, l: ProgrammingLanguage, r?: string) => { start: number; end: number } | null;
function render(id: AlgorithmId, lang: ProgrammingLanguage, input: number[], pick: (s: ExecutionStep) => boolean) {
  const def = Registry.getAlgorithmDefinition(id)!;
  store.selectedAlgorithm = id;
  store.selectedLanguage = lang;
  store.steps = def.generateSteps(input);
  store.currentStepIndex = store.steps.findIndex(pick);
  const step = store.steps[store.currentStepIndex];
  store.resolveCurrentLine = () => Registry.resolveCodeRef(def, lang, step.codeRef);
  const ranged = (Registry as Record<string, unknown>).resolveCodeRange as Ranged | undefined;
  store.resolveCurrentRange = () => (ranged ? ranged(def, lang, step.codeRef) : null);
  const html = renderToStaticMarkup(<CodePanel />);
  const lines = [...html.matchAll(/<div[^>]*data-line="(\d+)"[^>]*>/g)].map(m => ({
    n: Number(m[1]),
    highlighted: /data-active="true"/.test(m[0]),
    current: /aria-current="step"/.test(m[0]),
  }));
  return {
    highlighted: lines.filter(l => l.highlighted).map(l => l.n),
    current: lines.filter(l => l.current).map(l => l.n),
    here: (html.match(/← HERE/g) ?? []).length,
  };
}

describe('code panel highlights every line of a multi-line swap (audit L3-B)', () => {
  it('Bubble Sort in C: the swap step highlights lines 5–7; aria-current and "← HERE" stay on the first line', () => {
    expect(render('bubble-sort', 'c', [2, 1], s => s.type === 'swap')).toEqual({ highlighted: [5, 6, 7], current: [5], here: 1 });
  });

  it('Quick Sort in Java: the pivot placement highlights lines 21–23', () => {
    expect(render('quick-sort', 'java', [3, 1, 2], s => s.codeRef === 'place-pivot')).toEqual({ highlighted: [21, 22, 23], current: [21], here: 1 });
  });

  it('C++ and Python swaps, and every non-swap step, still highlight exactly one line', () => {
    expect(render('bubble-sort', 'cpp', [2, 1], s => s.type === 'swap')).toEqual({ highlighted: [6], current: [6], here: 1 });
    expect(render('selection-sort', 'python', [2, 1], s => s.type === 'swap')).toEqual({ highlighted: [9], current: [9], here: 1 });
    expect(render('bubble-sort', 'c', [2, 1], s => s.type === 'compare')).toEqual({ highlighted: [4], current: [4], here: 1 });
  });
});

describe('code panel: a range may start before the mapped line (audit L3-D)', () => {
  it('C Two Pointer match: lines 6–7 highlighted; aria-current and "← HERE" stay on `return true;` (line 7)', () => {
    const def = Registry.getAlgorithmDefinition('two-pointer')!;
    const html = (() => {
      store.selectedAlgorithm = 'two-pointer';
      store.selectedLanguage = 'c';
      store.steps = def.generateSteps([2, 5, 8, 12, 15, 19, 24], { target: 27 });
      store.currentStepIndex = store.steps.findIndex(s => s.type === 'found');
      const step = store.steps[store.currentStepIndex];
      store.resolveCurrentLine = () => Registry.resolveCodeRef(def, 'c', step.codeRef);
      store.resolveCurrentRange = () => Registry.resolveCodeRange(def, 'c', step.codeRef);
      return renderToStaticMarkup(<CodePanel />);
    })();
    const lines = [...html.matchAll(/<div[^>]*data-line="(\d+)"[^>]*>/g)];
    expect(lines.filter(m => /data-active="true"/.test(m[0])).map(m => Number(m[1]))).toEqual([6, 7]);
    expect(lines.filter(m => /aria-current="step"/.test(m[0])).map(m => Number(m[1]))).toEqual([7]);
    expect((html.match(/← HERE/g) ?? []).length).toBe(1);
  });
});

describe('code panel: an explanation-only step highlights no line (audit L3-E)', () => {
  const panel = (id: AlgorithmId, lang: ProgrammingLanguage, steps: ExecutionStep[], index: number) => {
    const def = Registry.getAlgorithmDefinition(id)!;
    store.selectedAlgorithm = id;
    store.selectedLanguage = lang;
    store.steps = steps;
    store.currentStepIndex = index;
    store.resolveCurrentLine = () => Registry.resolveCodeRef(def, lang, steps[index].codeRef);
    store.resolveCurrentRange = () => Registry.resolveCodeRange(def, lang, steps[index].codeRef);
    return renderToStaticMarkup(<CodePanel />);
  };

  it('Bubble and Selection "locked (sorted)" steps: no highlighted line, a neutral status, never "Unmapped step"', () => {
    for (const id of ['bubble-sort', 'selection-sort'] as AlgorithmId[]) {
      const steps = Registry.getAlgorithmDefinition(id)!.generateSteps([3, 1, 2]);
      const k = steps.findIndex(s => s.type === 'sorted');
      for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) {
        const html = panel(id, lang, steps, k);
        expect(html, `${id} ${lang}`).not.toMatch(/data-active="true"|aria-current="step"|← HERE|Unmapped step/);
        expect(html, `${id} ${lang}`).toContain('No statement runs at this step');
      }
    }
  });

  it('a codeRef missing from the line map is still reported as "Unmapped step"', () => {
    const steps = Registry.getAlgorithmDefinition('bubble-sort')!.generateSteps([2, 1]);
    const html = panel('bubble-sort', 'c', [{ ...steps[1], codeRef: 'bogus-ref' }], 0);
    expect(html).toContain('Unmapped step');
    expect(html).not.toContain('No statement runs at this step');
  });
});
