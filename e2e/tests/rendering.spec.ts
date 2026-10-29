import { test, expect } from '../fixtures';
import { walkAndCompareWithEngine } from '../support/walk';
import { ALGORITHMS, definition, SORT_IDS, type AlgorithmId } from '../support/engineTrace';
import type { UiState } from '../support/visualizerApp';


const ALL = Object.keys(ALGORITHMS) as AlgorithmId[];
const LABEL: Record<string, string> = { minIdx: 'min', pivotIndex: 'pivot', inserted: 'ins', largest: 'max' };

/** Bar/pointer/buffer/outcome rendering rules from the visualizer contract, checked against every observed step. */
function renderingProblems(id: AlgorithmId, observed: UiState[], steps: ReturnType<typeof import('../support/engineTrace').engineSteps>): string[] {
  const problems: string[] = [];
  const def = definition(id);
  observed.forEach((s, i) => {
    const e = steps[i];
    const at = `step ${i + 1} [${e.codeRef}]`;
    const named = new Set([...(e.indices ?? []), ...(e.sortedIndices ?? [])]);
    for (const b of s.bars) {
      if (['compare', 'swap', 'found', 'assign', 'focus'].includes(b.role) && !named.has(b.index)) problems.push(`${at}: bar ${b.index} is ${b.role} but the step does not name it`);
      if (b.role === 'pivot' && e.extraInfo?.pivotIndex !== b.index) problems.push(`${at}: bar ${b.index} is pivot but pivotIndex=${e.extraInfo?.pivotIndex}`);
      if (b.role === 'min' && e.pointers?.minIdx !== b.index) problems.push(`${at}: bar ${b.index} is min but minIdx=${e.pointers?.minIdx}`);
      if (b.role === 'insert' && e.pointers?.inserted !== b.index) problems.push(`${at}: bar ${b.index} is insert but inserted=${e.pointers?.inserted}`);
      if (b.role === 'sorted' && !(e.sortedIndices ?? []).includes(b.index)) problems.push(`${at}: bar ${b.index} is sorted but not in sortedIndices`);
      if (b.role === 'prefix' && !(e.sortedPrefixIndices ?? []).includes(b.index)) problems.push(`${at}: bar ${b.index} is prefix but not in sortedPrefixIndices`);
      if (!b.inRange && b.role !== 'default') problems.push(`${at}: dimmed bar ${b.index} has role ${b.role}`);
    }
    if (e.type === 'swap') {
      const got = s.bars.filter(b => b.role === 'swap').map(b => b.index).sort((a, b) => a - b);
      const want = [...new Set(e.indices ?? [])].sort((a, b) => a - b);
      if (got.join() !== want.join()) problems.push(`${at}: swap bars [${got}] != [${want}]`);
    }
    if (e.type === 'found') {
      const got = s.bars.filter(b => b.role === 'found').map(b => b.index).sort((a, b) => a - b);
      const want = [...new Set(e.indices ?? [])].sort((a, b) => a - b);
      if (got.join() !== want.join()) problems.push(`${at}: found bars [${got}] != [${want}]`);
    }
    // pointers drawn == pointers of the step (in range, allowed); nothing extra
    const n = e.state.length;
    const expectedLabels: Record<number, string[]> = {};
    for (const [k, v] of Object.entries(e.pointers ?? {})) {
      if (def.positionPointers && !def.positionPointers.includes(k)) continue;
      if (Number.isInteger(v) && v >= 0 && v < n) (expectedLabels[v] ??= []).push(LABEL[k] ?? k);
    }
    for (const b of s.bars) {
      if ([...b.pointers].sort().join() !== (expectedLabels[b.index] ?? []).sort().join()) problems.push(`${at}: bar ${b.index} pointers [${b.pointers}] != [${expectedLabels[b.index] ?? []}]`);
    }
    // buffers
    if (e.buffers) {
      for (const bf of e.buffers) {
        const got = s.buffers[bf.name];
        const active = bf.cursor !== undefined && bf.cursor < bf.values.length ? [bf.values[bf.cursor]] : [];
        if (!got || got.cells.join() !== bf.values.join() || got.active.join() !== active.join()) problems.push(`${at}: buffer ${bf.name} ${JSON.stringify(got)} != ${JSON.stringify(bf)}`);
      }
    } else if (Object.keys(s.buffers).length) problems.push(`${at}: stale buffers ${JSON.stringify(s.buffers)}`);
    // a final-state banner exists only on the last step
    if ((e.type === 'complete') !== (s.outcome !== null)) problems.push(`${at}: outcome banner ${JSON.stringify(s.outcome)} on a ${e.type} step`);
  });
  return problems;
}

test.describe('every algorithm renders its default trace faithfully (real UI, no input typed)', () => {
  for (const id of ALL) {
    test(ALGORITHMS[id].label, async ({ app }) => {
      const d = definition(id);
      const target = d.inputSpec?.target?.defaultValue ?? null;
      await app.selectAlgorithm(id);
      // (Merge Sorted Array's bars are nums1 with a placeholder slot for each value of nums2)
      const placeholders = Array<number>(d.inputSpec?.secondArray?.defaultValue.length ?? 0).fill(0);
      expect(await app.barValues(), 'the default example is shown').toEqual([...d.defaultInput, ...placeholders]);

      const { steps, observed, final } = await walkAndCompareWithEngine(app, id, d.defaultInput, target);
      expect(renderingProblems(id, observed, steps)).toEqual([]);

      // the sorts, and Merge Sorted Array (it ends with every slot in its final, sorted place)
      if (SORT_IDS.includes(id) || id === 'merge-sorted-array') {
        expect(final.outcome?.kind).toBe('sorted');
        expect(final.bars.every(b => b.role === 'sorted')).toBe(true);
      } else if (id === 'trapping-rain-water') {
        // its answer is a computed total, not an element: the run completes, with the total in words and no bar marked found
        expect(final.outcome).toEqual({ kind: 'complete', text: 'Trapped water: 6 units' });
        expect(final.bars.every(b => b.role === 'default')).toBe(true);
      } else if (id === 'remove-duplicates-sorted') {
        // returns a count, not a found element: the run completes with the unique prefix kept, the rest left over
        const unique = new Set(d.defaultInput).size;
        expect(final.outcome?.kind).toBe('complete');
        expect(final.bars.filter(b => b.role === 'kept').map(b => b.index)).toEqual([...Array(unique).keys()]);
        expect(final.bars.slice(unique).every(b => b.role === 'default' && !b.inRange)).toBe(true);
      } else {
        expect(final.outcome?.kind).toBe('found');
        expect(final.bars.filter(b => b.role === 'found').length).toBeGreaterThan(0);
        expect(final.bars.every(b => b.role === 'found' || b.role === 'default')).toBe(true);
      }
      expect(final.chips, 'no pointer chips left on the final step').toEqual([]);
      expect(final.offArray).toBeNull();
    });
  }
});

test.describe('layout', () => {
  async function expectNoOverlap(app: import('../support/visualizerApp').VisualizerApp, steps: number) {
    const problems: string[] = [];
    await app.reset();
    for (const [i, s] of (await app.collectStates(steps)).entries()) {
      const chart = s.chart!;
      for (const [a, A] of s.chips.entries()) {
        if (A.x < chart.x - 1 || A.x + A.w > chart.x + chart.w + 1) problems.push(`step ${i + 1}: chip "${A.text}" leaves the chart`);
        for (const B of s.chips.slice(a + 1)) {
          if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) problems.push(`step ${i + 1}: chips "${A.text}" and "${B.text}" overlap`);
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  }

  test('Quick Sort with 12 (seeded) random elements: pointer chips never overlap or leave the chart', async ({ app }) => {
    await app.selectAlgorithm('quick-sort');
    await app.sizeSelect.selectOption('12');
    await expect(app.bars).toHaveCount(12);
    await expectNoOverlap(app, await app.totalSteps());
  });

  test('Binary Search with 16 values: pointer chips never overlap', async ({ app }) => {
    const sixteen = Array.from({ length: 16 }, (_, i) => i * 3 - 10);
    await app.selectAlgorithm('binary-search');
    await app.enterAndVisualize(sixteen, 29);
    await expectNoOverlap(app, await app.totalSteps());
  });
});
