import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildExecution } from '../buildExecution';
import { getAlgorithmDefinition, getAllAlgorithms } from '../AlgorithmRegistry';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import type { AlgorithmDefinition, AlgorithmId } from '../../types/algorithm';

afterEach(() => vi.restoreAllMocks());

const bubble = getAlgorithmDefinition('bubble-sort')!;

describe('buildExecution — failure kinds are distinct', () => {
  it('ok: a registered algorithm returns its real trace', () => {
    const r = buildExecution('bubble-sort', [3, 1, 2]);
    expect(r.status).toBe('ok');
    expect(r.steps.length).toBeGreaterThan(2);
    expect(r.steps[r.steps.length - 1].state).toEqual([1, 2, 3]);
    expect('error' in r).toBe(false);
  });

  it('unimplemented: a known id explicitly marked implemented:false', () => {
    const r = buildExecution('heap-sort', [3, 1, 2]);
    expect(r.status).toBe('unimplemented');
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].actionLabel).toBe('Not Implemented');
    expect('error' in r).toBe(false);
  });

  it('invalid-algorithm: an unknown id is an error, not "coming soon"', () => {
    const r = buildExecution('not-a-real-algorithm' as AlgorithmId, [1, 2]);
    expect(r.status).toBe('invalid-algorithm');
    expect(r.steps).toEqual([]);
    expect(r).toHaveProperty('error.kind', 'invalid-algorithm');
    expect(JSON.stringify(r)).not.toMatch(/not implemented yet/i);
  });

  it('invalid-algorithm: an id marked implemented in the nav data but missing from the registry', () => {
    const r = buildExecution('bubble-sort', [1], () => undefined);
    expect(r.status).toBe('invalid-algorithm');
    expect(r).toHaveProperty('error.detail');
    expect((r as { error: { detail: string } }).error.detail).toMatch(/marked implemented/);
  });

  it('generator-error: a throwing generator is surfaced, never reported as unimplemented', () => {
    const boom = new Error('kaboom in generateSteps');
    const broken: AlgorithmDefinition = {
      ...bubble,
      generateSteps: () => {
        throw boom;
      },
    };
    const r = buildExecution('bubble-sort', [3, 1, 2], () => broken);
    expect(r.status).toBe('generator-error');
    expect(r.steps).toEqual([]);
    const err = (r as { error: { kind: string; message: string; detail?: string; cause?: unknown } }).error;
    expect(err.kind).toBe('generator-error');
    expect(err.cause).toBe(boom);
    expect(err.detail).toBe('kaboom in generateSteps');
    expect(JSON.stringify(r.steps)).not.toMatch(/not implemented/i);
  });

  it('the user-facing message never contains the raw error text or a stack trace', () => {
    const broken: AlgorithmDefinition = {
      ...bubble,
      generateSteps: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'x')");
      },
    };
    const r = buildExecution('bubble-sort', [1], () => broken) as { error: { message: string } };
    expect(r.error.message).not.toMatch(/TypeError|Cannot read|\sat\s|\.ts:/);
  });

  it('a non-Error throw is still reported as a generator error', () => {
    const broken: AlgorithmDefinition = {
      ...bubble,
      generateSteps: () => {
        throw 'string failure';
      },
    };
    const r = buildExecution('bubble-sort', [1], () => broken);
    expect(r.status).toBe('generator-error');
    expect((r as { error: { detail: string } }).error.detail).toBe('string failure');
  });

  it('does not mutate the caller input', () => {
    const input = [3, 1, 2];
    buildExecution('bubble-sort', input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('registry ↔ navigation consistency', () => {
  it('every registered algorithm is listed in the nav data as implemented', () => {
    for (const d of getAllAlgorithms()) {
      const nav = ALGORITHM_NAV.find(a => a.id === d.id);
      expect(nav, d.id).toBeDefined();
      expect(nav!.implemented, d.id).toBe(true);
    }
  });

  it('every nav entry marked implemented is registered, and every unimplemented one is not', () => {
    for (const nav of ALGORITHM_NAV) {
      expect(Boolean(getAlgorithmDefinition(nav.id)), nav.id).toBe(nav.implemented);
    }
  });

  it('every nav entry builds without an error status', () => {
    for (const nav of ALGORITHM_NAV) {
      const r = buildExecution(nav.id, [5, 3, 8, 1]);
      expect(['ok', 'unimplemented'], nav.id).toContain(r.status);
    }
  });
});

describe('visualizer store — failure states are explicit', () => {
  const st = () => useVisualizerStore.getState();

  it('implemented algorithm: status ok, no error, steps present', () => {
    st().setAlgorithm('linear-search');
    expect(st().executionStatus).toBe('ok');
    expect(st().executionError).toBeNull();
    expect(st().steps.length).toBeGreaterThan(2);
  });

  it('unimplemented algorithm: status unimplemented, no error, single stub step', () => {
    st().setAlgorithm('heap-sort');
    expect(st().executionStatus).toBe('unimplemented');
    expect(st().executionError).toBeNull();
    expect(st().steps).toHaveLength(1);
    expect(st().resolveCurrentLine()).toBeNull();
  });

  it('invalid id: status invalid-algorithm with an error and no steps (logged in dev)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    st().setAlgorithm('bogus-id' as AlgorithmId);
    expect(st().executionStatus).toBe('invalid-algorithm');
    expect(st().executionError?.kind).toBe('invalid-algorithm');
    expect(st().steps).toEqual([]);
    expect(spy).toHaveBeenCalled();
    st().setAlgorithm('bubble-sort');
    expect(st().executionStatus).toBe('ok');
    expect(st().executionError).toBeNull();
  });

  it('switching algorithm clears a previous error and resets position', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    st().setAlgorithm('bogus-id' as AlgorithmId);
    st().setAlgorithm('merge-sort');
    expect(st().executionError).toBeNull();
    expect(st().currentStepIndex).toBe(0);
    expect(st().steps.length).toBeGreaterThan(2);
  });

  it('a step with an unknown codeRef resolves to no line (null), not line 1', () => {
    st().setAlgorithm('bubble-sort');
    const real = st().steps;
    useVisualizerStore.setState({
      steps: real.map((s, i) => (i === 0 ? { ...s, codeRef: 'bogus-ref' } : s)),
      currentStepIndex: 0,
    });
    expect(st().resolveCurrentLine()).toBeNull();
    useVisualizerStore.setState({ steps: real, currentStepIndex: 0 });
    expect(st().resolveCurrentLine()).toBe(bubble.lineMap.cpp['fn-entry']);
  });

  it('language switch keeps steps and position; only the resolved line changes', () => {
    st().setAlgorithm('bubble-sort');
    for (let i = 0; i < 5; i++) st().nextStep();
    const steps = st().steps;
    const idx = st().currentStepIndex;
    st().setLanguage('cpp');
    const cppLine = st().resolveCurrentLine();
    st().setLanguage('python');
    expect(st().steps).toBe(steps);
    expect(st().currentStepIndex).toBe(idx);
    expect(st().resolveCurrentLine()).toBe(bubble.lineMap.python[steps[idx].codeRef!]);
    expect(cppLine).toBe(bubble.lineMap.cpp[steps[idx].codeRef!]);
    st().setLanguage('cpp');
  });
});
