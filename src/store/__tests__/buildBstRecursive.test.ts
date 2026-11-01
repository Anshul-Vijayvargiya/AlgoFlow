import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { buildBstRecursiveDefinition } from '../../engine/algorithms/tree/buildBstRecursive';
import { levelOrderText } from '../../engine/tree/binaryTree';

// Build a BST (Recursive) in the visualizer store: the array input paths it shares with the iterative build, playback
// back and forth over its call stacks, and switching between the two variants on the same values.
const st = () => useVisualizerStore.getState();
const step = () => st().steps[st().currentStepIndex];
const built = () => levelOrderText(st().steps.at(-1)!.tree!);
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Build a BST (Recursive) in the visualizer store', () => {
  it('opens on the same example as the iterative build and builds the same tree', () => {
    st().setAlgorithm('build-bst-recursive');
    expect(st()).toMatchObject({ array: [50, 30, 70, 20, 40, 60, 80], executionStatus: 'ok', inputSource: 'default', currentStepIndex: 0 });
    expect(built()).toBe('[50, 30, 70, 20, 40, 60, 80]');
  });

  it('custom values (duplicates, negatives), empty and one-value inputs run', () => {
    st().setAlgorithm('build-bst-recursive');
    expect(st().applyInput([0, -2, 0, 3], null).ok).toBe(true);
    expect(st().array).toEqual([0, -2, 0, 3]);
    expect(built()).toBe('[0, -2, 3]');
    expect(st().steps).toEqual(buildBstRecursiveDefinition.generateSteps([0, -2, 0, 3]));
    expect(st().applyInput([], null).ok).toBe(true);
    expect(built()).toBe('[]');
    expect(st().applyInput([7], null).ok).toBe(true);
    expect(built()).toBe('[7]');
  });

  it('stepping forward then back shows exactly the earlier tree and call stack', () => {
    st().setAlgorithm('build-bst-recursive');
    const deep = st().steps.findIndex(s => s.codeRef === 'base-create' && s.tree!.build!.index === 3);
    st().setCurrentStepIndex(deep);
    const seen = step();
    const stack = seen.tree!.build!.calls;
    for (let k = 0; k < 6; k++) st().nextStep();
    expect(step().tree!.build!.calls).not.toEqual(stack);
    for (let k = 0; k < 6; k++) st().previousStep();
    expect(step()).toBe(seen);
    expect(step().tree!.build!.calls!.map(f => f.via)).toEqual(['root', 'left', 'left']);
    expect(levelOrderText(step().tree!)).toBe('[50, 30, 70]');
    st().reset();
    expect(step().tree!.build!.calls).toEqual([]);
  });

  it('a custom array carries over between the iterative and recursive builds, and both build the same tree', () => {
    st().setAlgorithm('build-bst');
    expect(st().applyInput([9, 4, 12, 4], null).ok).toBe(true);
    const iterative = built();
    st().setAlgorithm('build-bst-recursive');
    expect(st()).toMatchObject({ array: [9, 4, 12, 4], inputSource: 'custom', executionStatus: 'ok' });
    expect(built()).toBe(iterative);
    st().setAlgorithm('build-bst');
    expect(st().steps.at(-1)!.tree!.build!.calls).toBeUndefined();
  });

  it('Randomize keeps the length and always builds a valid tree of the distinct values', () => {
    st().setAlgorithm('build-bst-recursive');
    for (let k = 0; k < 10; k++) {
      st().randomizeArray();
      expect(st().executionStatus).toBe('ok');
      expect(st().steps.at(-1)!.tree!.nodes).toHaveLength(new Set(st().array).size);
    }
  });
});
