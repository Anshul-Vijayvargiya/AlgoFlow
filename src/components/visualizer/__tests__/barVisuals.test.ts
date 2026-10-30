import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { deriveOutcome, deriveStepVisuals } from '../barVisuals';
import type { BarRole } from '../barVisuals';
import { EDGE_INPUTS, arrayAlgorithms, hasDefaultRun, randomArrays, traceLength } from '../../../engine/__tests__/testUtils';

// bars are drawn for array algorithms only; linked-list operations have their own visuals
const ALL = arrayAlgorithms();
const INPUTS: number[][] = [...Object.values(EDGE_INPUTS), ...randomArrays(25, 9, 31)];
const visuals = (id: AlgorithmId, step: ExecutionStep, steps: ExecutionStep[], i: number) =>
  deriveStepVisuals(step, {
    positionPointers: getAlgorithmDefinition(id)!.positionPointers,
    outcome: deriveOutcome(steps, i),
  });
const rolesWhere = (v: ReturnType<typeof deriveStepVisuals>, role: BarRole) =>
  v.bars.filter(b => b.role === role).map(b => b.index);

describe('deriveStepVisuals — only the bars the step names are emphasized (all real traces)', () => {
  it('never highlights a bar the step did not name', () => {
    for (const d of ALL) {
      // inputs the algorithm accepts (Container With Most Water refuses fewer than two or negative heights)
      for (const input of INPUTS.filter(a => hasDefaultRun(d, a))) {
        const steps = d.generateSteps([...input]);
        steps.forEach((s, i) => {
          const v = visuals(d.id, s, steps, i);
          expect(v.bars, `${d.id} step ${i}`).toHaveLength(traceLength(d, input));
          const named = new Set([...(s.indices ?? []), ...(s.sortedIndices ?? [])]);
          for (const b of v.bars) {
            const where = `${d.id} ${JSON.stringify(input)} step ${i} (${s.type}/${s.codeRef}) bar ${b.index} role ${b.role}`;
            if (['focus', 'assign', 'compare', 'swap', 'found'].includes(b.role)) expect(named.has(b.index), where).toBe(true);
            if (b.role === 'sorted') expect(s.sortedIndices ?? [], where).toContain(b.index);
            if (b.role === 'prefix') expect(s.sortedPrefixIndices ?? [], where).toContain(b.index);
            if (b.role === 'min') expect(s.pointers?.minIdx, where).toBe(b.index);
            if (b.role === 'insert') expect(s.pointers?.inserted, where).toBe(b.index);
            if (b.role === 'pivot') expect(s.extraInfo?.pivotIndex, where).toBe(b.index);
            if (b.role === 'compare') expect(s.type, where).toBe('compare');
            if (b.role === 'swap') expect(s.type, where).toBe('swap');
          }
        });
      }
    }
  });

  it('compare / swap / found steps emphasize exactly their indices (a pivot keeps its own role during compare)', () => {
    for (const d of ALL) {
      for (const input of INPUTS.filter(a => a.length > 0 && hasDefaultRun(d, a))) {
        const steps = d.generateSteps([...input]);
        steps.forEach((s, i) => {
          if (!['compare', 'swap', 'found'].includes(s.type) || !s.indices) return;
          const v = visuals(d.id, s, steps, i);
          const pivot = s.extraInfo?.pivotIndex;
          const expected = s.indices.filter(x => x !== pivot || s.type !== 'compare');
          expect(rolesWhere(v, s.type as BarRole).sort(), `${d.id} step ${i}`).toEqual([...new Set(expected)].sort());
        });
      }
    }
  });

  it('each event type maps to its documented role', () => {
    const at = (id: AlgorithmId, input: number[], pred: (s: ExecutionStep) => boolean) => {
      const steps = getAlgorithmDefinition(id)!.generateSteps(input);
      const i = steps.findIndex(pred);
      expect(i, `${id}: no matching step`).toBeGreaterThanOrEqual(0);
      return { s: steps[i], v: visuals(id, steps[i], steps, i) };
    };
    let r = at('bubble-sort', [5, 1, 4], s => s.type === 'compare');
    expect(rolesWhere(r.v, 'compare')).toEqual([0, 1]); // comparison

    r = at('bubble-sort', [5, 1, 4], s => s.type === 'swap');
    expect(rolesWhere(r.v, 'swap')).toEqual([0, 1]); // swap

    r = at('bubble-sort', [5, 1, 4], s => s.codeRef === 'inner-loop' && s.result === 'true');
    expect(rolesWhere(r.v, 'focus')).toEqual([0, 1]); // loop condition → outline

    r = at('selection-sort', [4, 2, 9, 1], s => s.codeRef === 'update-min');
    expect(rolesWhere(r.v, 'min')).toEqual([r.s.pointers!.minIdx]); // minimum selection

    r = at('insertion-sort', [3, 1, 2], s => s.codeRef === 'insert-key');
    expect(rolesWhere(r.v, 'insert')).toEqual([r.s.pointers!.inserted]); // insertion position

    r = at('insertion-sort', [3, 1, 2], s => s.codeRef === 'shift-right');
    expect(rolesWhere(r.v, 'assign')).toEqual(r.s.indices); // assignment

    r = at('linear-search', [4, 2, 9], s => s.type === 'found');
    expect(rolesWhere(r.v, 'found')).toEqual(r.s.indices); // match

    r = at('quick-sort', [3, 1, 2], s => s.type === 'compare');
    expect(rolesWhere(r.v, 'pivot')).toEqual([2]); // pivot stays visible while j is compared
    expect(rolesWhere(r.v, 'compare')).toEqual([r.s.indices![0]]);

    r = at('merge-sort', [2, 1], s => s.codeRef === 'copy-right');
    expect(rolesWhere(r.v, 'assign')).toEqual(r.s.indices); // merge write position
  });

  it('Insertion Sort: the initial prefix bar is a sorted prefix, not a finished (sorted) bar (audit M1)', () => {
    const steps = getAlgorithmDefinition('insertion-sort')!.generateSteps([6, 2, 8, 4, 3]);
    const v = visuals('insertion-sort', steps[0], steps, 0);
    expect(rolesWhere(v, 'sorted')).toEqual([]);
    expect(rolesWhere(v, 'prefix')).toEqual([0]);
  });

  it('a bar shown as sorted always holds its final value, in every sorting algorithm (audit M1)', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'heap-sort'] as AlgorithmId[]) {
      for (const input of INPUTS) {
        const steps = getAlgorithmDefinition(id)!.generateSteps([...input]);
        const final = steps[steps.length - 1].state;
        steps.forEach((s, i) => {
          for (const b of visuals(id, s, steps, i).bars) {
            if (b.role === 'sorted') expect(b.value, `${id} ${JSON.stringify(input)} step ${i} bar ${b.index}`).toBe(final[b.index]);
          }
        });
      }
    }
  });

  it('the "sorted" step adds no event highlight; locked bars come from sortedIndices', () => {
    const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([3, 1, 2]);
    const i = steps.findIndex(s => s.type === 'sorted');
    const v = visuals('bubble-sort', steps[i], steps, i);
    expect(rolesWhere(v, 'focus')).toEqual([]);
    expect(rolesWhere(v, 'sorted')).toEqual(steps[i].sortedIndices);
  });
});

describe('deriveStepVisuals — pointers follow the current step', () => {
  it('every in-range pointer is drawn exactly once on its own index; the rest are off-array', () => {
    const label = (n: string) => ({ minIdx: 'min', pivotIndex: 'pivot', inserted: 'ins', largest: 'max' } as Record<string, string>)[n] ?? n;
    for (const d of ALL) {
      // inputs the algorithm accepts (Container With Most Water refuses fewer than two or negative heights)
      for (const input of INPUTS.filter(a => hasDefaultRun(d, a))) {
        const steps = d.generateSteps([...input]);
        steps.forEach((s, i) => {
          const v = visuals(d.id, s, steps, i);
          const expected: Record<number, string[]> = {};
          const off: string[] = [];
          for (const [name, value] of Object.entries(s.pointers ?? {})) {
            if (d.positionPointers && !d.positionPointers.includes(name)) continue;
            if (Number.isInteger(value) && value >= 0 && value < traceLength(d, input)) (expected[value] ??= []).push(label(name));
            else off.push(name);
          }
          for (const b of v.bars) {
            expect([...b.pointers].sort(), `${d.id} ${JSON.stringify(input)} step ${i} bar ${b.index}`).toEqual(
              (expected[b.index] ?? []).sort()
            );
          }
          expect(v.offArray.map(o => o.name).sort(), `${d.id} step ${i} off-array`).toEqual(off.sort());
        });
      }
    }
  });

  it('several pointers on one index stay distinguishable and ordered', () => {
    const steps = getAlgorithmDefinition('binary-search')!.generateSteps([7], { target: 7 });
    const i = steps.findIndex(s => s.codeRef === 'calc-mid');
    expect(visuals('binary-search', steps[i], steps, i).bars[0].pointers).toEqual(['low', 'mid', 'high']);
  });

  it('Bubble Sort draws j and j+1 but never the pass counter i (not an array position)', () => {
    const steps = getAlgorithmDefinition('bubble-sort')!.generateSteps([5, 1, 4, 2]);
    steps.forEach((s, k) => {
      for (const b of visuals('bubble-sort', s, steps, k).bars) expect(b.pointers).not.toContain('i');
    });
    const k = steps.findIndex(s => s.type === 'compare');
    expect(visuals('bubble-sort', steps[k], steps, k).bars.map(b => b.pointers)).toEqual([['j'], ['j+1'], [], []]);
  });

  it('out-of-range pointers (j = -1, right = -1, quick i = low-1) never become bar elements', () => {
    const ins = getAlgorithmDefinition('insertion-sort')!.generateSteps([2, 1]);
    const k = ins.findIndex(s => s.codeRef === 'while-condition' && s.result === 'false' && s.pointers!.j === -1);
    expect(k).toBeGreaterThanOrEqual(0);
    const v = visuals('insertion-sort', ins[k], ins, k);
    expect(v.offArray).toContainEqual({ name: 'j', value: -1 });
    expect(v.bars.flatMap(b => b.pointers)).not.toContain('j');

    const tp = getAlgorithmDefinition('two-pointer')!.generateSteps([]);
    const vt = visuals('two-pointer', tp[1], tp, 1);
    expect(vt.bars).toEqual([]);
    expect(vt.offArray.map(o => o.name).sort()).toEqual(['left', 'right']);

    const q = getAlgorithmDefinition('quick-sort')!.generateSteps([3, 1, 2]);
    const iq = q.findIndex(s => s.codeRef === 'init-i');
    expect(visuals('quick-sort', q[iq], q, iq).offArray).toContainEqual({ name: 'i', value: -1 });
  });

  it('pointers disappear when the step no longer defines them (final step of every algorithm)', () => {
    for (const d of ALL) {
      const steps = d.generateSteps([...d.defaultInput]);
      const last = steps.length - 1;
      const v = visuals(d.id, steps[last], steps, last);
      expect(v.bars.flatMap(b => b.pointers), d.id).toEqual([]);
      expect(v.offArray, d.id).toEqual([]);
    }
  });

  it('bars outside the working range are dimmed; locked bars never are', () => {
    const bs = getAlgorithmDefinition('binary-search')!.generateSteps([1, 3, 5, 7, 9, 11, 14], { target: 14 });
    const i = bs.findIndex(s => s.codeRef === 'update-low');
    const v = visuals('binary-search', bs[i], bs, i); // low = 4, high = 6
    expect(v.range).toEqual([4, 6]);
    expect(v.bars.map(b => b.inRange)).toEqual([false, false, false, false, true, true, true]);
    const q = getAlgorithmDefinition('quick-sort')!.generateSteps([3, 1, 2, 5, 4]);
    q.forEach((s, k) => {
      for (const b of visuals('quick-sort', s, q, k).bars) if (b.role === 'sorted') expect(b.inRange).toBe(true);
    });
  });
});

describe('deriveOutcome — final-state classification comes from the trace', () => {
  const last = (id: AlgorithmId, input: number[], params?: Record<string, unknown>) => {
    const steps = getAlgorithmDefinition(id)!.generateSteps(input, params);
    const i = steps.length - 1;
    return { v: visuals(id, steps[i], steps, i), outcome: deriveOutcome(steps, i) };
  };
  const SORTS: AlgorithmId[] = ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'heap-sort'];

  it('no outcome before the final step', () => {
    for (const d of ALL) {
      const steps = d.generateSteps([...d.defaultInput]);
      for (let i = 0; i < steps.length - 1; i++) expect(deriveOutcome(steps, i), `${d.id} step ${i}`).toBeNull();
    }
  });

  it('sorting: every bar is sorted, outcome "sorted"', () => {
    for (const id of SORTS) {
      const r = last(id, [5, 1, 4, 2]);
      expect(r.outcome, id).toBe('sorted');
      expect(r.v.bars.every(b => b.role === 'sorted'), id).toBe(true);
    }
  });

  it('search FOUND: only the matching bar(s) are highlighted; the others stay plain', () => {
    const r = last('linear-search', [4, 2, 9, 7], { target: 9 });
    expect(r.outcome).toBe('found');
    expect(rolesWhere(r.v, 'found')).toEqual([2]);
    expect(r.v.bars.filter(b => b.role !== 'found').every(b => b.role === 'default')).toBe(true);
    const b = last('binary-search', [1, 3, 5, 7], { target: 5 });
    expect(b.outcome).toBe('found');
    expect(rolesWhere(b.v, 'found')).toEqual([2]);
    const t = last('two-pointer', [1, 2, 3, 4], { target: 5 });
    expect(t.outcome).toBe('found');
    expect(rolesWhere(t.v, 'found')).toHaveLength(2);
  });

  it('search NOT FOUND: outcome "not-found" and NO bar is green/sorted/found', () => {
    const cases: [AlgorithmId, number[]][] = [
      ['linear-search', [4, 2, 9, 7]],
      ['binary-search', [1, 3, 5, 7]],
      ['two-pointer', [1, 2, 3, 4]],
    ];
    for (const [id, input] of cases) {
      const r = last(id, input, { target: 1000 });
      expect(r.outcome, id).toBe('not-found');
      expect(r.v.bars.every(b => b.role === 'default'), `${id}: ${r.v.bars.map(b => b.role)}`).toBe(true);
    }
  });

  it('empty arrays: no bars at all; sort → "empty", search → "not-found"', () => {
    for (const id of SORTS) {
      const r = last(id, []);
      expect(r.outcome, id).toBe('empty');
      expect(r.v.bars, id).toEqual([]);
    }
    for (const id of ['linear-search', 'binary-search', 'two-pointer'] as AlgorithmId[]) {
      const r = last(id, []);
      expect(r.outcome, id).toBe('not-found');
      expect(r.v.bars, id).toEqual([]);
    }
  });

  it('single element sort is "sorted"', () => {
    expect(last('quick-sort', [7]).outcome).toBe('sorted');
    expect(last('merge-sort', [7]).outcome).toBe('sorted');
  });
});

describe('Merge Sort buffers are represented structurally, not by unrelated bars', () => {
  const steps = getAlgorithmDefinition('merge-sort')!.generateSteps([2, 3, 1, 0]);

  it('every merge step from init-merge on carries both buffers with a cursor', () => {
    const refs = ['init-merge', 'merge-loop', 'compare-halves', 'copy-left', 'copy-right', 'left-loop', 'copy-remaining-left', 'right-loop', 'copy-remaining-right',
      'advance-i', 'advance-k-after-left', 'advance-j', 'advance-k-after-right', 'advance-i-rest', 'advance-k-left-rest', 'advance-j-rest', 'advance-k-right-rest'];
    expect(steps.some(s => s.codeRef === 'advance-k-after-left')).toBe(true);
    for (const s of steps.filter(x => refs.includes(x.codeRef!))) {
      expect(s.buffers?.map(b => b.name), `${s.codeRef}`).toEqual(['left', 'right']);
    }
  });

  it('compare steps: the buffer cursors hold exactly the compared values (even when no bar holds the left one)', () => {
    const compares = steps.filter(s => s.type === 'compare');
    expect(compares.length).toBeGreaterThan(0);
    for (const s of compares) {
      const [l, r] = s.buffers!;
      expect(l.values[l.cursor!]).toBe(s.comparedValues!.val1);
      expect(r.values[r.cursor!]).toBe(s.comparedValues!.val2);
    }
  });

  it('the regression step (left 2 vs right 1) highlights only the right bar; the left value is in the left buffer', () => {
    const k = steps.findIndex(s => s.type === 'compare' && s.comparedValues!.val1 === 2 && s.comparedValues!.val2 === 1);
    const v = visuals('merge-sort', steps[k], steps, k);
    expect(rolesWhere(v, 'compare')).toEqual([3]);
    expect(steps[k].buffers![0]).toEqual({ name: 'left', values: [2, 3], cursor: 0 });
    expect(steps[k].buffers![1]).toEqual({ name: 'right', values: [0, 1], cursor: 1 });
  });

  it('copy steps: the buffer cursor holds the value just written to arr[k]', () => {
    for (const s of steps.filter(x => x.codeRef === 'copy-left' || x.codeRef === 'copy-remaining-left')) {
      const l = s.buffers![0];
      expect(l.values[l.cursor!]).toBe(s.state[s.indices![0]]);
    }
    for (const s of steps.filter(x => x.codeRef === 'copy-right' || x.codeRef === 'copy-remaining-right')) {
      const r = s.buffers![1];
      expect(r.values[r.cursor!]).toBe(s.state[s.indices![0]]);
    }
  });

  it('only the merge algorithms, 3Sum and 4Sum carry buffers (Merge Sort: left / right; Merge Sorted Array: nums2; 3Sum / 4Sum: the triplets / quadruplets found)', () => {
    for (const d of ALL.filter(a => !['merge-sort', 'merge-sorted-array', 'three-sum', 'four-sum'].includes(a.id))) {
      expect(d.generateSteps([...d.defaultInput]).some(s => s.buffers), d.id).toBe(false);
    }
  });
});
