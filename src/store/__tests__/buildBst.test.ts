import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';
import { buildBstDefinition } from '../../engine/algorithms/tree/buildBst';
import { levelOrderText } from '../../engine/tree/binaryTree';

// Build a BST in the visualizer store: drawn as a tree but fed by the store's array input paths (its example, custom
// input, playback, Randomize), and kept apart from the traversals' level-order text input.
const st = () => useVisualizerStore.getState();
const built = () => levelOrderText(st().steps.at(-1)!.tree!);
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('Build a BST in the visualizer store', () => {
  it('opens on its example and builds it', () => {
    st().setAlgorithm('build-bst');
    expect(st()).toMatchObject({ array: [50, 30, 70, 20, 40, 60, 80], executionStatus: 'ok', inputSource: 'default', currentStepIndex: 0 });
    expect(built()).toBe('[50, 30, 70, 20, 40, 60, 80]');
  });

  it('custom values are inserted in the order entered; duplicates, empty and one-value inputs run', () => {
    st().setAlgorithm('build-bst');
    expect(st().applyInput([3, 1, 2, 3], null).ok).toBe(true);
    expect(st().array).toEqual([3, 1, 2, 3]);
    expect(built()).toBe('[3, 1, null, null, 2]');
    expect(st().steps).toEqual(buildBstDefinition.generateSteps([3, 1, 2, 3]));
    expect(st().applyInput([], null).ok).toBe(true);
    expect(built()).toBe('[]');
    expect(st().applyInput([7], null).ok).toBe(true);
    expect(built()).toBe('[7]');
  });

  it('playback walks the steps, and reset goes back to the empty tree without re-running the trace', () => {
    st().setAlgorithm('build-bst');
    const steps = st().steps;
    st().nextStep();
    st().nextStep();
    expect(st().currentStepIndex).toBe(2);
    st().setCurrentStepIndex(steps.length - 1);
    expect(st().steps[st().currentStepIndex].type).toBe('complete');
    st().reset();
    expect(st().currentStepIndex).toBe(0);
    expect(st().steps).toBe(steps);
    expect(st().steps[0].tree!.nodes).toEqual([]);
  });

  it('Randomize keeps the length and always builds a valid tree of the distinct values', () => {
    st().setAlgorithm('build-bst');
    for (let k = 0; k < 10; k++) {
      st().randomizeArray();
      expect(st().array).toHaveLength(7);
      expect(st().executionStatus).toBe('ok');
      expect(st().steps.at(-1)!.tree!.nodes).toHaveLength(new Set(st().array).size);
    }
  });

  it('switching between a traversal (tree text) and Build a BST (array) gives each its own kind of input', () => {
    st().setAlgorithm('tree-inorder');
    expect(st().executionStatus).toBe('ok');
    st().setAlgorithm('build-bst');
    expect(st()).toMatchObject({ array: [50, 30, 70, 20, 40, 60, 80], executionStatus: 'ok' });
    st().setAlgorithm('tree-inorder');
    expect(st().executionStatus).toBe('ok');
    expect(st().steps.at(-1)!.tree!.build).toBeUndefined();
  });

  it('a custom array carries over from an array algorithm, as between array algorithms', () => {
    st().setAlgorithm('bubble-sort');
    expect(st().applyInput([9, 4, 12], null).ok).toBe(true);
    st().setAlgorithm('build-bst');
    expect(st()).toMatchObject({ array: [9, 4, 12], inputSource: 'custom', executionStatus: 'ok' });
    expect(built()).toBe('[9, 4, 12]');
  });
});
