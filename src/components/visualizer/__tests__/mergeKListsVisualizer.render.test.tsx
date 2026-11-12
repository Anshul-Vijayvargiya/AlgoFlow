import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { MergeKListsVisualizer } from '../MergeKListsVisualizer';
import { HeapVisualizer } from '../HeapVisualizer';
import { LinkedListVisualizer } from '../LinkedListVisualizer';

// The real MergeKListsVisualizer for steps of the real Merge k Sorted Lists trace: the input lists, the min heap as a
// tree and as its array, and the merged list with its dummy node and tail.
const run = (lists: string) => getAlgorithmDefinition('heap-merge-k-sorted-lists')!.generateSteps([], { texts: [lists] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<MergeKListsVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, '');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
/** the part of the page inside one of the three sections */
const section = (html: string, id: 'klists-inputs' | 'klists-heap' | 'klists-merged') => {
  const order = ['klists-inputs', 'klists-heap', 'klists-merged', 'klists-vars'];
  const from = html.indexOf(`data-testid="${id}"`);
  const to = html.indexOf(`data-testid="${order[order.indexOf(id) + 1]}"`);
  return html.slice(from, to);
};
/** every input node as "id=value:status" */
const inputs = (html: string) => [...section(html, 'klists-inputs').matchAll(/data-node="([a-z0-9]+)" data-value="(-?\d+)" data-status="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
/** the heap array's cells as "k=value(Llist):state" (with the index variables on it after a /) */
const heapCells = (html: string) =>
  [...html.matchAll(/data-heap-index="(\d+)" data-node-id="[a-z0-9]+" data-value="(-?\d+)" data-list="(\d+)" data-state="([a-z]+)" data-pointers="([a-z,]*)"/g)].map(
    m => `${m[1]}=${m[2]}(L${m[3]}):${m[4]}${m[5] ? `/${m[5]}` : ''}`
  );
/** the tree's nodes, in the same shape */
const treeNodes = (html: string) =>
  [...html.matchAll(/data-heap-node="(\d+)" data-node-id="[a-z0-9]+" data-value="(-?\d+)" data-list="(\d+)" data-state="([a-z]+)" data-pointers="([a-z,]*)"/g)].map(
    m => `${m[1]}=${m[2]}(L${m[3]}):${m[4]}${m[5] ? `/${m[5]}` : ''}`
  );
/** the merged list's nodes as "value(Llist):state" (with tail / node on it after a /) */
const merged = (html: string) =>
  [...html.matchAll(/data-merged="\d+" data-node-id="[a-z0-9]+" data-value="(-?\d+)" data-list="(\d+)" data-state="([a-z]+)" data-marks="([a-z,]*)"/g)].map(
    m => `${m[1]}(L${m[2]}):${m[3]}${m[4] ? `/${m[4]}` : ''}`
  );
const vars = (html: string) => Object.fromEntries([...html.matchAll(/data-var="([a-z]+)" data-value="([^"]*)"/g)].map(m => [m[1], m[2]]));
const legend = (html: string) => [...html.matchAll(/data-legend="([a-z-]+)"/g)].map(m => m[1]);

const EXAMPLE = '[[1,4,5],[1,3,4],[2,6]]';
const STEPS = run(EXAMPLE);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('MergeKListsVisualizer', () => {
  it('has three sections, in order: the input lists, the min heap and the merged list', () => {
    const html = decode(render(STEPS[0]));
    const order = ['data-testid="klists-inputs"', 'data-testid="klists-heap"', 'data-testid="klists-merged"'].map(t => html.indexOf(t));
    expect(order.every(k => k > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text(html)).toContain('Input lists (as given)');
    expect(text(html)).toContain('Min heap (one node per list at most)');
    expect(text(html)).toContain('Merged list (0 of 8 nodes)');
    expect(html).toMatch(/data-testid="klists-visualizer" data-phase="build" data-lists="3" data-nodes="8"/);
  });

  it('the first step: every list in its own row with its L tag, nodes, arrows and NULL; everything waiting', () => {
    const html = decode(render(STEPS[0]));
    expect(inputs(html)).toEqual(['l0n0=1:waiting', 'l0n1=4:waiting', 'l0n2=5:waiting', 'l1n0=1:waiting', 'l1n1=3:waiting', 'l1n2=4:waiting', 'l2n0=2:waiting', 'l2n1=6:waiting']);
    expect([...html.matchAll(/data-list="(\d)" data-length="(\d)"/g)].map(m => `L${m[1]}:${m[2]}`)).toEqual(['L0:3', 'L1:3', 'L2:2']);
    expect(text(section(html, 'klists-inputs'))).toContain('L01→4→5→NULL');
    expect(text(section(html, 'klists-inputs'))).toContain('L22→6→NULL');
    expect(html).toContain('data-testid="klists-heap-empty"');
    expect(text(html)).toContain('The heap is empty.');
    expect(text(html)).toContain('Not started: the dummy node is created once the heads are in the heap.');
    expect(vars(html)).toEqual({ i: '', size: '0', min: '', node: '', tail: '' });
    expect(html).not.toContain('data-testid="klists-result"');
    expect(legend(html)).toEqual(['waiting']);
  });

  it('each list keeps one tag and tint; the tag is text, shown with the node in the heap array and in the merged list', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect([...html.matchAll(/data-list-tag="(\d)" class="[^"]*(text-[a-z]+-\d+)"[^>]*>L(\d)</g)].map(m => `${m[1]}:${m[2]}:L${m[3]}`)).toEqual(['0:text-cyan-300:L0', '1:text-amber-300:L1', '2:text-emerald-300:L2']);
    // under every merged node: its list's tag, in that list's tint
    const tags = [...section(html, 'klists-merged').matchAll(/<span class="text-\[10px\] font-bold leading-none (text-[a-z]+-\d+)">L(\d)<\/span>/g)].map(m => `L${m[2]}:${m[1]}`);
    expect(tags).toEqual(['L0:text-cyan-300', 'L1:text-amber-300', 'L2:text-emerald-300', 'L1:text-amber-300', 'L0:text-cyan-300', 'L1:text-amber-300', 'L0:text-cyan-300', 'L2:text-emerald-300']);
    const mid = decode(render(at('merge-loop', 0)));
    expect([...section(mid, 'klists-heap').matchAll(/<span class="text-\[10px\] font-bold leading-none (text-[a-z]+-\d+)">L(\d)<\/span>/g)].map(m => `L${m[2]}:${m[1]}`)).toEqual(['L0:text-cyan-300', 'L1:text-amber-300', 'L2:text-emerald-300']);
    // and inside every node of the tree
    expect([...mid.matchAll(/<text[^>]*>L(\d)<\/text>/g)].map(m => `L${m[1]}`)).toEqual(['L0', 'L1', 'L2']);
  });

  it('the build loop: the row being looked at is marked with i, and a pushed head is in the heap in both drawings', () => {
    const check = decode(render(at('check-head', 1)));
    expect(check).toMatch(/data-list="1" data-length="3" data-current="true"/);
    expect([...check.matchAll(/data-current="(true|false)"/g)].map(m => m[1])).toEqual(['false', 'true', 'false']);
    expect(text(section(check, 'klists-inputs'))).toContain('◀ i');
    expect(vars(check).i).toBe('1');
    const stored = decode(render(at('ins-store@head', 1)));
    expect(inputs(stored).slice(0, 4)).toEqual(['l0n0=1:heap', 'l0n1=4:waiting', 'l0n2=5:waiting', 'l1n0=1:heap']);
    expect(heapCells(stored)).toEqual(['0=1(L0):normal', '1=1(L1):inserted/i']);
    expect(treeNodes(stored)).toEqual(heapCells(stored));
    expect(stored).toMatch(/data-testid="klists-heap-array" data-values="1,1" data-ids="l0n0,l1n0"/);
    expect(legend(stored)).toEqual(['waiting', 'heap', 'heap-inserted']);
    expect(text(stored)).toContain('heap: just pushed');
  });

  it('a comparison marks both positions, their edge and the index variables; a swap likewise', () => {
    const compare = decode(render(at('su-check@head', 1)));
    expect(heapCells(compare)).toEqual(['0=1(L0):compared/parent', '1=1(L1):normal', '2=2(L2):compared/i']);
    expect(treeNodes(compare)).toEqual(heapCells(compare));
    expect([...compare.matchAll(/data-heap-edge="(\d)" data-tone="([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`)).toEqual(['1:normal', '2:compared']);
    // (the message holds a "<": the text is taken from the markup before it is decoded)
    expect(text(render(at('su-check@head', 1)))).toContain('heap[0]=1 <= heap[2]=2 → TRUE');
    const steps = run('[[2],[1]]');
    const swap = decode(render(steps.find(s => s.codeRef === 'su-swap@head')!));
    expect(heapCells(swap)).toEqual(['0=1(L1):swapped/parent', '1=2(L0):swapped/i']);
    expect([...swap.matchAll(/data-heap-edge="(\d)" data-tone="([a-z]+)"/g)].map(m => `${m[1]}:${m[2]}`)).toEqual(['1:swapped']);
    expect(legend(swap)).toContain('heap-swapped');
  });

  it('pop: the root is the current minimum, the last node moves to the root and its slot leaves, then the sift down', () => {
    const min = decode(render(at('pop-min@node')));
    expect(heapCells(min)).toEqual(['0=1(L0):min', '1=1(L1):normal', '2=2(L2):normal']);
    expect(inputs(min)[0]).toBe('l0n0=1:taken');
    expect(vars(min).min).toBe('1 (L0)');
    expect(text(min)).toContain('heap: the smallest: being taken');
    const moved = decode(render(at('pop-move-last@node')));
    expect(heapCells(moved)).toEqual(['0=2(L2):moved', '1=1(L1):normal', '2=2(L2):leaving']);
    expect(moved).toMatch(/data-heap-edge="2" data-tone="normal"[^>]*stroke-dasharray="4 3"/);
    const shrunk = decode(render(at('pop-shrink@node')));
    expect(heapCells(shrunk)).toEqual(['0=2(L2):normal', '1=1(L1):normal']);
    const left = decode(render(at('sd-check-left@node')));
    expect(heapCells(left)).toEqual(['0=2(L2):compared/i,smallest', '1=1(L1):compared/l']);
    expect(text(render(at('sd-check-left@node')))).toContain('l=1 < size=2 && heap[1]=1 < heap[smallest=0]=2 → TRUE');
  });

  it('the merged list: dummy first with tail on it, then each node as it is linked, with tail and node under it', () => {
    const start = decode(render(at('init-tail')));
    expect(start).toMatch(/data-testid="klists-dummy" data-marks="tail"/);
    expect(merged(start)).toEqual([]);
    expect(text(section(start, 'klists-merged'))).toContain('dummy▲ tail');
    const linked = decode(render(at('link-node')));
    expect(merged(linked)).toEqual(['1(L0):linked/node']);
    expect(linked).toMatch(/data-testid="klists-dummy" data-marks="tail"/);
    expect(linked).toMatch(/data-testid="klists-merged" data-values="1" data-ids="l0n0" data-tail="dummy"/);
    expect(legend(linked)).toContain('linked');
    expect(inputs(linked)[0]).toBe('l0n0=1:merged');
    const advanced = decode(render(at('advance-tail')));
    expect(merged(advanced)).toEqual(['1(L0):merged/tail,node']);
    expect(advanced).toMatch(/data-testid="klists-dummy" data-marks=""/);
    expect(vars(advanced)).toMatchObject({ node: '1 (L0)', tail: '1 (L0)' });
    const third = decode(render(at('link-node', 2)));
    expect(merged(third)).toEqual(['1(L0):merged', '1(L1):merged/tail', '2(L2):linked/node']);
    expect(text(third)).toContain('Merged list (3 of 8 nodes)');
    expect(third).not.toContain('data-testid="klists-merged-end"');
  });

  it('the end: every node merged, the list closed with NULL, and the result announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(merged(html)).toEqual(['1(L0):merged', '1(L1):merged', '2(L2):merged', '3(L1):merged', '4(L0):merged', '4(L1):merged', '5(L0):merged', '6(L2):merged/tail,node']);
    expect(inputs(html).every(n => n.endsWith(':merged'))).toBe(true);
    expect(html).toContain('data-testid="klists-merged-end"');
    expect(html).toMatch(/role="status" data-testid="klists-result"/);
    expect(text(html)).toContain('Merged 8 nodes from 3 lists: 1 → 1 → 2 → 3 → 4 → 4 → 5 → 6');
    expect(html).toMatch(/data-testid="klists-phase" data-phase="done"[^>]*>Done</);
    expect(html).toMatch(/data-testid="klists-calls" data-depth="0"/);
    expect(text(html)).toContain('calls: none (returned)');
  });

  it('empty lists are shown as NULL, and no lists at all says so', () => {
    const empty = decode(render(run('[[],[7],[]]')[0]));
    expect([...empty.matchAll(/data-list-end="(\d)"[^>]*>([^<]*)</g)].map(m => `L${m[1]}:${m[2]}`)).toEqual(['L0:NULL (empty list)', 'L1:NULL', 'L2:NULL (empty list)']);
    expect(inputs(empty)).toEqual(['l1n0=7:waiting']);
    const none = run('[]');
    const first = decode(render(none[0]));
    expect(first).toContain('data-testid="klists-no-lists"');
    expect(text(first)).toContain('[ ] — no lists');
    const done = decode(render(none.at(-1)!));
    expect(text(done)).toContain('No lists: the merged list is empty (NULL)');
    expect(done).toMatch(/data-testid="klists-dummy" data-marks="tail"/);
    expect(done).toContain('data-testid="klists-merged-end"');
  });

  it('screen readers get the lists, the heap and the merged list in words; the drawings are hidden from them', () => {
    const html = decode(render(at('sd-check-left@node')));
    for (const id of ['klists-inputs', 'klists-heap', 'klists-merged']) expect(html).toMatch(new RegExp(`data-testid="${id}"[^>]*aria-hidden="true"`));
    expect(html).toContain('Input lists: L0: 1, 4, 5; L1: 1, 3, 4; L2: 2, 6.');
    expect(html).toContain('Min heap of 2: heap[0] = 2 (L2), being compared; heap[1] = 1 (L1), being compared.');
    expect(html).toContain('Index variables: i = 0, l = 1, smallest = 0.');
    expect(html).toContain('The merged list is empty: only the dummy node.');
    expect(html).toContain('tail is at the dummy node.');
    const later = decode(render(at('link-node', 1)));
    expect(later).toContain('Merged list after the dummy node: 1 (L0), then 1 (L1), just linked.');
    expect(later).toContain('tail is at 1 (L0).');
  });

  it('nothing is worked out here: the picture follows the step it is given, even one the algorithm would never produce', () => {
    const fake: ExecutionStep = {
      id: 0,
      state: [],
      type: 'assign',
      message: 'made up',
      mergeK: {
        lists: [[9, 1], [5]],
        nodes: [
          { id: 'l0n0', value: 9, list: 0, index: 0, next: 'l0n1' },
          { id: 'l0n1', value: 1, list: 0, index: 1, next: null },
          { id: 'l1n0', value: 5, list: 1, index: 0, next: null },
        ],
        heads: ['l0n0', 'l1n0'],
        heap: ['l0n0'],
        phase: 'merge',
        calls: ['made up'],
        pointers: [{ name: 'i', index: 0 }],
        listIndex: null,
        min: null,
        node: null,
        dummy: true,
        tail: 'l1n0',
        merged: ['l1n0', 'l0n1'],
      },
    };
    const html = decode(render(fake));
    expect(inputs(html)).toEqual(['l0n0=9:heap', 'l0n1=1:merged', 'l1n0=5:merged']);
    expect(heapCells(html)).toEqual(['0=9(L0):focus/i']);
    expect(merged(html)).toEqual(['5(L1):merged/tail', '1(L0):merged']);
    expect(html).toMatch(/data-testid="klists-merged" data-values="5,1"/);
    expect(text(html)).toContain('made up');
    expect(html).not.toContain('data-testid="klists-result"');
  });

  it('responsive: rows and lists wrap instead of scrolling, and the tree scales down to the width it has', () => {
    const steps = run('[[1,2,3,4,5],[1,2,3],[2],[3,4],[5]]');
    const html = decode(render(steps.at(-1)!));
    expect(merged(html)).toHaveLength(12);
    expect(html).toMatch(/data-list="0" data-length="5" data-current="false" class="[^"]*flex flex-wrap/);
    expect(section(html, 'klists-merged')).toMatch(/<ol class="[^"]*flex flex-wrap/);
    expect(html).not.toContain('overflow-x-auto');
    const full = decode(render(steps.find(s => s.codeRef === 'merge-loop')!));
    expect(heapCells(full)).toHaveLength(5);
    expect(full).toMatch(/<svg viewBox="0 0 248 220" width="248" height="220" style="max-width:100%;height:auto" data-testid="klists-tree"/);
  });

  it('a step of another algorithm draws nothing, and the other visualizers ignore a Merge k Sorted Lists step', () => {
    expect(renderToStaticMarkup(<MergeKListsVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<MergeKListsVisualizer currentStep={getAlgorithmDefinition('heap-last-stone-weight')!.generateSteps([2, 7])[0]} />)).toBe('');
    expect(renderToStaticMarkup(<HeapVisualizer currentStep={STEPS[0]} />)).toBe('');
    expect(renderToStaticMarkup(<LinkedListVisualizer currentStep={STEPS[0]} />)).not.toContain('klists');
  });
});
