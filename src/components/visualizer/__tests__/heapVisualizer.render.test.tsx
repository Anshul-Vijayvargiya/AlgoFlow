import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { HeapVisualizer } from '../HeapVisualizer';

// The real HeapVisualizer for steps of the real Last Stone Weight trace: the max heap as a tree (the main view) and as its
// array, the index variables, what the step did, the two stones of the round and their smash, the smashes so far.
const run = (...stones: number[]) => getAlgorithmDefinition('heap-last-stone-weight')!.generateSteps(stones);
const render = (s: ExecutionStep) => renderToStaticMarkup(<HeapVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
/** position → "value:state:pointers", read from the tree and from the array */
const tree = (html: string) => [...html.matchAll(/data-heap-node="(\d+)" data-value="(\d+)" data-state="([a-z]+)" data-pointers="([^"]*)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}:${m[4]}`);
const cells = (html: string) => [...html.matchAll(/data-heap-index="(\d+)" data-value="(\d+)" data-state="([a-z]+)" data-pointers="([^"]*)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}:${m[4]}`);
const place = (html: string) => [...html.matchAll(/data-heap-node="(\d+)"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => `${m[1]}:${m[2]},${m[3]}`);

const STEPS = run(2, 7, 4, 1, 8, 1);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('HeapVisualizer', () => {
  it('the tree is the main view, one node per heap position, and the array below shows the same values and states on every step', () => {
    for (const s of STEPS) {
      const html = render(s);
      expect(tree(html), `step ${s.id} ${s.codeRef}`).toEqual(cells(html));
      expect(tree(html).map(t => Number(t.split('=')[1].split(':')[0])), `step ${s.id}`).toEqual([...s.heap!.heap]);
    }
    const html = render(STEPS[0]);
    expect(html.indexOf('data-testid="heap-tree"')).toBeLessThan(html.indexOf('data-testid="heap-array"'));
    expect(html).toContain('data-testid="heap-stones"');
  });

  it('a position is drawn in the same place on every step: level by level, children below their parent', () => {
    const first = place(render(STEPS[0]));
    const byIndex = new Map(first.map(p => [Number(p.split(':')[0]), p.split(':')[1].split(',').map(Number)]));
    for (const s of STEPS.filter((_, k) => k % 17 === 0)) {
      for (const p of place(render(s))) expect(p).toBe(first.find(q => q.startsWith(`${p.split(':')[0]}:`)));
    }
    for (let k = 1; k < 6; k++) {
      const parent = byIndex.get(Math.floor((k - 1) / 2))!;
      const child = byIndex.get(k)!;
      expect(child[1]).toBeGreaterThan(parent[1]);
      expect(child[0] < parent[0]).toBe(k % 2 === 1);
    }
  });

  it('siftDown compares a child with largest: both are marked, with the index variables at their positions, in the tree and the array', () => {
    const s = STEPS.find(x => x.codeRef === 'sd-check-right' && x.result === 'true')!; // r=4 (8) > largest=1 (7)
    const html = render(s);
    expect(tree(html)).toContain('1=7:compared:i,largest');
    expect(tree(html)).toContain('4=8:compared:r');
    expect(tree(html)).toContain('3=1:normal:l');
    expect(cells(html)).toContain('4=8:compared:r');
    expect(html).toMatch(/data-heap-edge="4" data-tone="compared"/);
    expect(decode(html)).toContain('heap[1] = 7 being compared; heap[4] = 8 being compared.');
    expect(decode(html)).toContain('Index variables: i = 1, l = 3, r = 4, largest = 1.');
  });

  it('a swap is marked on both stones and on the edge between them; the legend says what it means', () => {
    const html = decode(render(at('sd-swap')));
    // largest is already the child's position here
    expect(tree(html)).toContain('1=8:swapped:i');
    expect(tree(html)).toContain('4=7:swapped:r,largest');
    expect(html).toMatch(/data-heap-edge="4" data-tone="swapped"/);
    expect(html).toMatch(/data-legend="swapped"[^>]*>.*just swapped/);
    expect(html).not.toContain('data-legend="compared"');
  });

  it('popMax: top is held in the smash panel, the last stone moves to the root (its old slot dashed), then the slot goes', () => {
    const top = decode(render(at('pop-top')));
    expect(top).toMatch(/data-testid="heap-smash" data-y="" data-x="" data-top="8" data-popping="y"/);
    expect(top).toContain('popMax for y: top = 8');
    const moved = render(at('pop-move-last'));
    expect(tree(moved)).toEqual(['0=1:moved:', '1=7:normal:', '2=4:normal:', '3=1:normal:', '4=2:normal:', '5=1:leaving:']);
    expect(moved).toMatch(/data-heap-edge="5" data-tone="normal"[^>]*stroke-dasharray="4 3"/);
    expect(decode(moved)).toContain('heap[0] = 1 moved to the root; heap[5] = 1 about to be removed.');
    expect(tree(render(at('pop-shrink')))).toHaveLength(5);
  });

  it('the two stones of the round, then the smash: the difference goes back as a new stone, marked as inserted', () => {
    const decided = decode(render(at('check-equal')));
    expect(decided).toMatch(/data-y="8" data-x="7" data-top="" data-popping="" data-outcome="unequal"/);
    expect(decided).toContain('y − x = 8 − 7 = 1: 7 destroyed, 1 goes back');
    const inserted = render(at('push-diff'));
    expect(tree(inserted)).toContain('4=1:inserted:');
    expect(decode(inserted)).toContain('heap[4] = 1 just inserted');
    // before the check, nothing is decided yet
    expect(render(at('pop-x', 1))).toMatch(/data-outcome=""/);
  });

  it('equal stones: both destroyed, nothing goes back', () => {
    const steps = run(4, 4);
    const html = decode(render(steps.find(s => s.codeRef === 'check-equal')!));
    expect(html).toMatch(/data-outcome="equal"/);
    expect(html).toContain('4 = 4: both destroyed, nothing goes back');
    expect(html).toContain('data-testid="heap-empty"');
  });

  it('the smashes so far, in order, and the calls in progress', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect([...html.matchAll(/data-smash="([^"]*)"/g)].map(m => m[1])).toEqual(['8,7,1', '4,2,2', '2,1,1', '1,1,0']);
    expect(html).toContain('8 vs 7 → 1');
    expect(html).toContain('1 vs 1 → both destroyed');
    const inner = decode(render(STEPS.find(s => s.codeRef === 'sd-largest' && s.heap!.phase === 'smash')!));
    expect(inner).toContain('lastStoneWeight(stones) › popMax(heap) › siftDown(heap, 5, 0)');
    expect(inner).toMatch(/data-testid="heap-calls" data-depth="3"/);
  });

  it('the phase is named: copy, build, smash, done', () => {
    expect(render(STEPS[0])).toMatch(/data-testid="heap-phase" data-phase="copy"[^>]*>Copy the stones</);
    expect(render(at('call-build'))).toMatch(/data-phase="build"[^>]*>Build the max heap</);
    expect(render(at('smash-loop'))).toMatch(/data-phase="smash"[^>]*>Smash the two heaviest</);
    expect(render(STEPS.at(-1)!)).toMatch(/data-phase="done"[^>]*>Done</);
  });

  it('the end: the last stone is marked and the answer stated; no answer before it', () => {
    const html = render(STEPS.at(-1)!);
    expect(tree(html)).toEqual(['0=1:result:']);
    expect(html).toMatch(/role="status" data-testid="heap-result"/);
    expect(decode(html)).toContain('The last stone weighs 1');
    expect(render(STEPS[10])).not.toContain('data-testid="heap-result"');
  });

  it('no stones at all: an empty heap, the stones shown as empty, the answer 0', () => {
    const html = decode(render(run().at(-1)!));
    expect(html).toContain('[ ] (empty)');
    expect(html).toContain('The heap is empty.');
    expect(html).toContain('No stones at all: the answer is 0');
    expect(html).toContain('The max heap is empty.');
  });

  it('the drawing scales down to fit instead of scrolling, and is hidden from assistive technology, which gets it in words', () => {
    const html = render(run(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)[0]);
    // 10 stones: four levels, eight slots of 54 px on the bottom level, plus 16 px each side
    expect(html).toMatch(/<svg viewBox="0 0 464 [\d.]+" width="464" height="[\d.]+" style="max-width:100%;height:auto" aria-hidden="true" data-testid="heap-tree"/);
    expect(html).not.toContain('overflow-x-auto');
    expect(decode(html)).toContain('aria-label="Heap array: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"');
    expect(decode(html)).toContain('aria-label="Stones as given: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"');
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<HeapVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});
