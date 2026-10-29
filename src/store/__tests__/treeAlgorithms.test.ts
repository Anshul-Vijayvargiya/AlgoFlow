import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualizerStore } from '../useVisualizerStore';

// The visualizer store with the tree traversals: the tree is one level-order string (texts), never an array.
const st = () => useVisualizerStore.getState();
beforeEach(() => useVisualizerStore.setState(useVisualizerStore.getInitialState(), true));

describe('tree traversals in the visualizer store', () => {
  it('opening one loads the example tree and runs it; the array stays empty', () => {
    st().setAlgorithm('tree-inorder');
    expect(st()).toMatchObject({ array: [], texts: ['[1, 2, 3, 4, 5, null, 6]'], executionStatus: 'ok', inputSource: 'default' });
    expect(st().steps.at(-1)!.tree!.result!.text).toBe('Inorder: [4, 2, 5, 1, 3, 6]');
  });

  it('a custom tree runs exactly as typed; a malformed one is refused and changes nothing', () => {
    st().setAlgorithm('tree-level-order');
    expect(st().applyInput([], null, null, null, ['[3, 9, 20, null, null, 15, 7]']).ok).toBe(true);
    expect(st().steps.at(-1)!.tree!.result!.text).toBe('Level order: [3, 9, 20, 15, 7]');
    const r = st().applyInput([], null, null, null, ['[1, null, null, 4]']);
    expect(r).toMatchObject({ ok: false, message: 'Value 4 (4) has no parent: every node before it already has both children listed, or is null.' });
    expect(st().texts).toEqual(['[3, 9, 20, null, null, 15, 7]']);
  });

  it('switching between traversals loads the example; switching to an array algorithm never reuses the tree', () => {
    st().setAlgorithm('tree-preorder');
    expect(st().applyInput([], null, null, null, ['[1]']).ok).toBe(true);
    st().setAlgorithm('tree-postorder');
    expect(st()).toMatchObject({ texts: ['[1, 2, 3, 4, 5, null, 6]'], inputSource: 'default' });
    st().setAlgorithm('bubble-sort');
    expect(st()).toMatchObject({ texts: null, executionStatus: 'ok' });
    expect(st().array.length).toBeGreaterThan(0);
  });

  it('Randomize loads another example tree, and Restore puts a custom one back', () => {
    st().setAlgorithm('tree-inorder');
    expect(st().applyInput([], null, null, null, ['[2, 1]']).ok).toBe(true);
    st().randomizeArray();
    expect(st().texts).not.toEqual(['[2, 1]']);
    expect(st()).toMatchObject({ inputSource: 'random', executionStatus: 'ok', inputNotice: { originalTexts: ['[2, 1]'] } });
    st().restoreOriginalInput();
    expect(st().texts).toEqual(['[2, 1]']);
  });
});
