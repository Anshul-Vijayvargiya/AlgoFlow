import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useVisualizerStore } from '../../../store/useVisualizerStore';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import { ExecutionControls, SizeSelect } from '../ExecutionControls';
import { getSizeOptions } from '../sizeOptions';
import type { AlgorithmId } from '../../../types/algorithm';
import { parseBars, renderStep, rolesOf } from './visualTestUtils';

const st = () => useVisualizerStore.getState();
const current = () => {
  const { selectedAlgorithm, steps, currentStepIndex } = st();
  return renderStep(selectedAlgorithm, steps, currentStepIndex);
};

beforeEach(() => {
  st().setAlgorithm('bubble-sort');
  st().reset();
});

describe('rendered bars (real ArrayVisualizer + real traces)', () => {
  it('compare → amber COMPARE bars with pointer chips; swap → SWAP bars; both with accessible names', () => {
    st().setAlgorithm('bubble-sort');
    const { steps } = st();
    const cmp = steps.findIndex(s => s.type === 'compare');
    const html = renderStep('bubble-sort', steps, cmp);
    const bars = parseBars(html);
    expect(rolesOf(bars, 'compare')).toEqual(steps[cmp].indices);
    expect(bars.find(b => b.index === 0)!.pointers).toEqual(['j']);
    expect(bars.find(b => b.index === 1)!.pointers).toEqual(['j+1']);
    expect(html).toContain('COMPARE');
    expect(html).toContain('aria-label="Index 0, value 8, being compared, pointer j"');

    const sw = steps.findIndex(s => s.type === 'swap');
    const swHtml = renderStep('bubble-sort', steps, sw);
    expect(rolesOf(parseBars(swHtml), 'swap')).toEqual(steps[sw].indices);
    expect(swHtml).toContain('SWAP');
  });

  it('pointer chips follow the step and are absent when the step has no pointers', () => {
    st().setAlgorithm('linear-search');
    const { steps } = st();
    const k = steps.findIndex(s => s.codeRef === 'compare-target' && s.pointers!.i === 2);
    expect(parseBars(renderStep('linear-search', steps, k)).find(b => b.pointers.includes('i'))!.index).toBe(2);
    const first = parseBars(renderStep('linear-search', steps, 0));
    expect(first.flatMap(b => b.pointers)).toEqual([]);
  });

  it('target and pivot values are shown only when the trace defines them', () => {
    st().setAlgorithm('linear-search');
    expect(current()).toContain('target = 7');
    st().setAlgorithm('quick-sort');
    const { steps } = st();
    const k = steps.findIndex(s => s.codeRef === 'pick-pivot');
    expect(renderStep('quick-sort', steps, k)).toContain('pivot = 70');
    st().setAlgorithm('bubble-sort');
    expect(current()).not.toMatch(/target =|pivot =/);
  });

  it('Merge Sort: buffers are rendered with the active cell; the left value is not on any highlighted bar', () => {
    const def = getAlgorithmDefinition('merge-sort')!;
    const steps = def.generateSteps([2, 3, 1, 0]);
    const k = steps.findIndex(s => s.type === 'compare' && s.comparedValues!.val1 === 2 && s.comparedValues!.val2 === 1);
    const html = renderStep('merge-sort', steps, k);
    expect(html).toContain('data-buffer="left"');
    expect(html).toContain('data-buffer="right"');
    expect(html).toContain('left buffer');
    // exactly one active cell per buffer, holding the compared values
    const active = [...html.matchAll(/data-buffer-cell="(\d+)" data-buffer-active="true"[^>]*>(\d+)</g)].map(m => Number(m[2]));
    expect(active).toEqual([2, 1]);
    // the only COMPARE bar is the right element (bar 3, value 1); bar 0 (value 0) is NOT highlighted
    const bars = parseBars(html);
    expect(rolesOf(bars, 'compare')).toEqual([3]);
    expect(bars[0].role).not.toBe('compare');
  });
});

describe('final-state styling', () => {
  it('sorted array: all bars sorted + "Array sorted" status', () => {
    st().setAlgorithm('merge-sort');
    st().setCurrentStepIndex(st().steps.length - 1);
    const html = current();
    const bars = parseBars(html);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every(b => b.role === 'sorted')).toBe(true);
    expect(html).toContain('Array sorted');
    expect(html).toContain('role="status"');
  });

  it('search not found: NO bar is green/sorted/found and the status says not found', () => {
    for (const id of ['linear-search', 'binary-search', 'two-pointer'] as AlgorithmId[]) {
      const steps = getAlgorithmDefinition(id)!.generateSteps([4, 2, 9, 7], { target: 1000 });
      const html = renderStep(id, steps, steps.length - 1);
      expect(parseBars(html).every(b => b.role === 'default'), id).toBe(true);
      expect(html, id).toContain('Target not found');
      expect(html, id).toContain('data-outcome-kind="not-found"');
      expect(html, id).not.toContain('Array sorted');
    }
  });

  it('search found: exactly the matching bar is a MATCH, others stay plain', () => {
    const steps = getAlgorithmDefinition('linear-search')!.generateSteps([4, 2, 9, 7], { target: 9 });
    const html = renderStep('linear-search', steps, steps.length - 1);
    const bars = parseBars(html);
    expect(rolesOf(bars, 'found')).toEqual([2]);
    expect(bars.filter(b => b.role !== 'found').every(b => b.role === 'default')).toBe(true);
    expect(html).toContain('Target found');
  });

  it('empty arrays: no bars (so nothing nonexistent can be shown as sorted) and an explicit status', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort'] as AlgorithmId[]) {
      const steps = getAlgorithmDefinition(id)!.generateSteps([]);
      for (let i = 0; i < steps.length; i++) {
        const html = renderStep(id, steps, i);
        expect(parseBars(html), `${id} step ${i}`).toEqual([]);
        expect(html).not.toContain('MATCH');
      }
      expect(renderStep(id, steps, steps.length - 1)).toContain('Empty array');
    }
  });

  it('no status banner is shown before the final step', () => {
    st().setAlgorithm('selection-sort');
    for (let i = 0; i < st().steps.length - 1; i++) {
      st().setCurrentStepIndex(i);
      expect(current(), `step ${i}`).not.toContain('role="status"');
    }
  });
});

describe('Previous / Next / Reset restore the exact visual state', () => {
  for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'linear-search', 'binary-search', 'two-pointer'] as AlgorithmId[]) {
    it(`${id}: forward render at every step equals the render after stepping back to it, and Reset equals step 0`, () => {
      st().setAlgorithm(id);
      const total = st().steps.length;
      const forward: string[] = [current()];
      for (let i = 1; i < total; i++) {
        st().nextStep();
        forward.push(current());
      }
      for (let i = total - 2; i >= 0; i--) {
        st().previousStep();
        expect(current(), `${id} back to step ${i}`).toBe(forward[i]);
      }
      st().setCurrentStepIndex(Math.floor(total / 2));
      st().reset();
      expect(current(), `${id} reset`).toBe(forward[0]);
    });
  }

  it('Reset leaves no stale highlights or pointers from a mid-run step', () => {
    st().setAlgorithm('quick-sort');
    st().setCurrentStepIndex(st().steps.findIndex(s => s.type === 'compare'));
    const mid = parseBars(current());
    expect(mid.some(b => b.role === 'compare')).toBe(true);
    expect(mid.some(b => b.pointers.length > 0)).toBe(true);
    st().reset();
    const bars = parseBars(current());
    expect(bars.some(b => b.role === 'compare')).toBe(false);
    const fresh = getAlgorithmDefinition('quick-sort')!.generateSteps([...getAlgorithmDefinition('quick-sort')!.defaultInput]);
    expect(current()).toBe(renderStep('quick-sort', fresh, 0));
  });
});

describe('changing algorithms never preserves stale visual state', () => {
  it('after switching, the render equals a fresh render of the new algorithm\'s first step', () => {
    const ids: AlgorithmId[] = ['quick-sort', 'merge-sort', 'binary-search', 'insertion-sort', 'bubble-sort'];
    for (const from of ids) {
      for (const to of ids.filter(x => x !== from)) {
        st().setAlgorithm(from);
        st().setCurrentStepIndex(Math.floor(st().steps.length / 2));
        st().setAlgorithm(to);
        const fresh = getAlgorithmDefinition(to)!.generateSteps([...getAlgorithmDefinition(to)!.defaultInput]);
        expect(current(), `${from} → ${to}`).toBe(renderStep(to, fresh, 0));
        expect(st().currentStepIndex).toBe(0);
      }
    }
  });

  it('merge buffers / pivot / target pills from the previous algorithm do not leak', () => {
    st().setAlgorithm('merge-sort');
    st().setCurrentStepIndex(st().steps.findIndex(s => s.buffers));
    expect(current()).toContain('data-buffer=');
    st().setAlgorithm('bubble-sort');
    expect(current()).not.toMatch(/data-buffer=|pivot =|target =|Off-array/);
  });

  it('switching to an unimplemented algorithm leaves no bars to render', () => {
    st().setAlgorithm('heap-sort');
    expect(st().executionStatus).toBe('unimplemented');
    expect(st().steps[0].state).toEqual([]);
    expect(parseBars(current())).toEqual([]);
  });

  it('an execution error leaves no steps (the page shows the error card instead of the visualizer)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    st().setAlgorithm('nope' as AlgorithmId);
    expect(st().executionStatus).toBe('invalid-algorithm');
    expect(st().steps).toEqual([]);
    vi.restoreAllMocks();
    st().setAlgorithm('bubble-sort');
  });
});

describe('Size dropdown reflects the actual input size', () => {
  // Store-connected components cannot be SSR-rendered with live state (zustand serves its INITIAL state to
  // server renders), so the control is tested through its presentational SizeSelect plus the store; the real
  // connected DOM is covered by the Playwright run.
  const selectedSize = (size: number) => {
    const html = renderToStaticMarkup(<SizeSelect size={size} onChange={() => {}} />);
    const opts = [...html.matchAll(/<option value="(\d+)"([^>]*)>/g)].map(m => ({ v: Number(m[1]), sel: /selected/.test(m[2]) }));
    return { selected: opts.filter(o => o.sel).map(o => o.v), all: opts.map(o => o.v) };
  };

  it('Merge Sort (8 elements) selects 8, not 5', () => {
    st().setAlgorithm('merge-sort');
    expect(st().arraySize).toBe(8);
    const r = selectedSize(st().arraySize);
    expect(r.selected).toEqual([8]);
    expect(r.all).toEqual([5, 7, 8, 10, 12]);
  });

  it('every algorithm\'s default size is the selected option, and equals the trace length of the array', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'linear-search', 'binary-search', 'two-pointer'] as AlgorithmId[]) {
      st().setAlgorithm(id);
      expect(st().arraySize, id).toBe(st().array.length);
      expect(st().steps[0].state, id).toHaveLength(st().arraySize);
      expect(selectedSize(st().arraySize).selected, id).toEqual([st().array.length]);
    }
  });

  it('presets are unchanged when the current size is already a preset; a chosen size is shown and applied', () => {
    expect(getSizeOptions(7)).toEqual([5, 7, 10, 12]);
    st().setAlgorithm('merge-sort');
    st().setArraySize(12);
    expect(selectedSize(st().arraySize).selected).toEqual([12]);
    expect(st().array).toHaveLength(12);
    expect(st().steps[0].state).toHaveLength(12);
  });
});

// CI regression (small phone, 16 values): a pointer chip wider than its bar must not hang past the chart edge. The
// first/last bars pin their pointer row to the outer edge (pixel geometry is covered by e2e/tests/responsive.spec.ts).
describe('pointer chip alignment at the chart edges', () => {
  const aligns = (html: string) => [...html.matchAll(/data-chip-align="([a-z]+)"/g)].map(m => m[1]);

  it('the first bar aligns its chip to the start, the last to the end, every other bar centres it', () => {
    st().setAlgorithm('binary-search');
    const { steps } = st();
    const k = steps.findIndex(s => s.pointers && Object.keys(s.pointers).length > 0);
    const html = renderStep('binary-search', steps, k);
    const n = parseBars(html).length;
    expect(n).toBeGreaterThan(2);
    expect(aligns(html)).toEqual(['start', ...Array(n - 2).fill('center'), 'end']);
  });

  it('a single bar keeps its chip centred', () => {
    st().setAlgorithm('linear-search');
    const step = { ...st().steps[0], state: [7], indices: [0], pointers: { i: 0 } };
    expect(aligns(renderStep('linear-search', [step], 0))).toEqual(['center']);
  });
});

// CI regression (WebKit axe scans): a text button re-enabled after being disabled (opacity 0.4) must not animate its
// opacity, or it is briefly drawn at 2.85:1 contrast while already enabled. Classes are static, so the initial-state
// server render is enough here; the axe scans in e2e/tests/a11y-scan.spec.ts cover the rendered result.
describe('playback text buttons do not animate opacity when re-enabled', () => {
  const classOf = (html: string, label: string) => new RegExp(`aria-label="${label}"[^>]*class="([^"]*)"|class="([^"]*)"[^>]*aria-label="${label}"`).exec(html);

  it.each(['Previous step', 'Next step', 'Randomize'])('%s uses transition-colors, never transition-all/opacity', label => {
    const m = classOf(renderToStaticMarkup(<ExecutionControls />), label);
    expect(m, `button "${label}" rendered`).not.toBeNull();
    const cls = (m![1] ?? m![2]).split(/\s+/);
    expect(cls).toContain('disabled:opacity-40');
    expect(cls).toContain('transition-colors');
    expect(cls.some(c => c === 'transition-all' || c === 'transition-opacity' || c === 'transition')).toBe(false);
  });
});
