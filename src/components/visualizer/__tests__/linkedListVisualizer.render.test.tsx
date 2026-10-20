import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import { chainFrom, nodeById } from '../../../engine/linkedList/listSnapshot';
import { LinkedListVisualizer } from '../LinkedListVisualizer';
import { deriveOutcome } from '../barVisuals';
import { deriveListView, listFoundPosition } from '../listVisuals';
import { getSizeOptions } from '../sizeOptions';

const LIST_OPS: AlgorithmId[] = [
  'll-build', 'll-traverse', 'll-search', 'll-insert-head', 'll-insert-tail', 'll-insert-at', 'll-delete-head', 'll-delete-tail', 'll-delete-at', 'reverse-linked-list',
];
const gen = (id: AlgorithmId, input: number[], params?: Record<string, unknown>) => getAlgorithmDefinition(id)!.generateSteps([...input], params);

/** Renders the REAL LinkedListVisualizer for one step, wired exactly as VisualizerPage wires it. */
function render(id: AlgorithmId, steps: ExecutionStep[], index: number): string {
  const def = getAlgorithmDefinition(id)!;
  return renderToStaticMarkup(
    <LinkedListVisualizer
      currentStep={steps[index]}
      previousStep={steps[index - 1]}
      foundPosition={listFoundPosition(steps, index)}
      outcome={deriveOutcome(steps, index)}
      valueLabel={def.inputSpec?.value?.label}
      showPosition={Boolean(def.inputSpec?.index)}
    />
  );
}

type Attrs = Record<string, string>;
const attrsOf = (tag: string): Attrs => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const tags = (html: string, attr: string): Attrs[] => [...html.matchAll(new RegExp(`<[a-z]+[^>]*\\b${attr}="[^"]*"[^>]*>`, 'g'))].map(m => attrsOf(m[0]));
const nodes = (html: string) => tags(html, 'data-list-node');
/** the part of the markup inside the HEAD chain list */
const chainHtml = (html: string) => html.slice(html.indexOf('data-testid="list-chain"'), html.indexOf('</ol>', html.indexOf('data-testid="list-chain"')));
const chainNodes = (html: string) => nodes(chainHtml(html));
const endChip = (html: string, label: 'HEAD' | 'TAIL') => tags(html, 'data-end-chip').filter(a => a['data-end-chip'] === label);
const nullTerminator = (html: string) => tags(html, 'data-null-terminator').find(a => a['data-null-terminator'] === 'main')!;
const at = (steps: ExecutionStep[], ref: string, nth = 0) => steps.map((s, k) => [s, k] as const).filter(([s]) => s.codeRef === ref)[nth][1];

describe('LinkedListVisualizer — every step of every operation draws its snapshot', () => {
  const INPUTS = [[], [5], [5, 5], [4, 7, 1, 9], [3, 1, 3, 2, 3, 0, 8, 6, 2]];
  const paramsFor = (id: AlgorithmId, input: number[]): Record<string, unknown>[] => {
    if (id === 'll-insert-at') return [0, Math.floor(input.length / 2), input.length].map(index => ({ index, value: 6 }));
    if (id === 'll-delete-at') return input.length ? [0, Math.floor((input.length - 1) / 2), input.length - 1].map(index => ({ index })) : [];
    return [{ value: 3 }];
  };

  for (const id of LIST_OPS) {
    it(`${id}: the chain, HEAD, TAIL, pointers, outside nodes and changed link match the snapshot`, () => {
      for (const input of INPUTS) {
        for (const params of paramsFor(id, input)) {
          const steps = gen(id, input, params);
          steps.forEach((step, k) => {
            const label = `${id} ${JSON.stringify(input)} ${JSON.stringify(params)} step ${k} (${step.codeRef})`;
            const s = step.list!;
            const html = render(id, steps, k);
            const chain = chainFrom(s, s.head);
            // the HEAD chain, in order, with values: exactly the snapshot (and the step's state)
            expect(chainNodes(html).map(n => n['data-list-node']), label).toEqual(chain);
            expect(chainNodes(html).map(n => Number(n['data-value'])), label).toEqual(step.state);
            // every node of the snapshot is drawn exactly once; nodes off the chain are drawn as outside
            const all = nodes(html);
            expect(all.map(n => n['data-list-node']).sort(), label).toEqual(s.nodes.map(n => n.id).sort());
            for (const n of all) {
              const snap = nodeById(s, n['data-list-node'])!;
              expect(n['data-next'], label).toBe(snap.next ?? 'null');
              expect(n['data-position'], label).toBe(chain.includes(snap.id) ? String(chain.indexOf(snap.id)) : 'outside');
              expect(n['data-head'] === 'true', label).toBe(s.head === snap.id);
              expect(n['data-tail'] === 'true', label).toBe(s.tail === snap.id);
              const named = Object.entries(s.pointers).filter(([, v]) => v === snap.id).map(([p]) => p);
              expect(n['data-pointers'] ? n['data-pointers'].split(',') : [], label).toEqual(named);
              expect(n['data-link-changed'] === 'true', label).toBe(s.changed?.kind === 'next' && s.changed.node === snap.id);
            }
            // NULL: HEAD/TAIL chips sit on the NULL terminator exactly when they are NULL, as do NULL variables
            const nul = nullTerminator(html);
            expect(nul['data-pointers'] ? nul['data-pointers'].split(',') : [], label).toEqual(Object.entries(s.pointers).filter(([, v]) => v === null).map(([p]) => p));
            expect(endChip(html, 'HEAD'), label).toHaveLength(1);
            expect(endChip(html, 'TAIL'), label).toHaveLength(1);
            // the changed link / HEAD / TAIL is the only highlighted one
            const changedArrows = tags(html, 'data-arrow-from').filter(a => a['data-changed'] === 'true').map(a => a['data-arrow-from']);
            expect(changedArrows, label).toEqual(s.changed?.kind === 'next' ? [s.changed.node] : []);
            expect(endChip(html, 'HEAD')[0]['data-changed'] === 'true', label).toBe(s.changed?.kind === 'head');
            expect(endChip(html, 'TAIL')[0]['data-changed'] === 'true', label).toBe(s.changed?.kind === 'tail');
            // arrows follow the snapshot's next links
            for (const a of tags(html, 'data-arrow-from')) expect(a['data-arrow-to'], label).toBe(nodeById(s, a['data-arrow-from'])!.next ?? 'null');
            expect(html, label).not.toMatch(/undefined|NaN/);
          });
        }
      }
    });
  }
});

describe('LinkedListVisualizer — specific states', () => {
  it('nodes are boxes with a value and a next cell; positions are labelled; the terminator says NULL', () => {
    const steps = gen('ll-traverse', [4, 7, 1]);
    const html = render('ll-traverse', steps, 0);
    expect(chainNodes(html).map(n => n['data-value'])).toEqual(['4', '7', '1']);
    expect(chainNodes(html).map(n => n['data-position'])).toEqual(['0', '1', '2']);
    expect(html).toContain('aria-label="Position 0, value 4, HEAD, next → value 7 at position 1"');
    expect(html).toContain('aria-label="Position 2, value 1, TAIL, next → NULL"');
    expect(html).toMatch(/data-testid="null-terminator"[^>]*>NULL</);
    expect(html).toContain('HEAD → 4 → 7 → 1 → NULL. TAIL → node 1 at position 2.');
  });

  it('empty list: HEAD and TAIL both sit on NULL and the list says it is empty', () => {
    const html = render('ll-traverse', gen('ll-traverse', []), 0);
    expect(chainNodes(html)).toEqual([]);
    expect(html).toContain('data-testid="list-empty"');
    expect(html).toContain('HEAD → NULL, the list is empty. TAIL → NULL.');
    const nul = html.slice(0, html.indexOf('data-testid="null-terminator"'));
    expect(nul.match(/data-end-chip="(HEAD|TAIL)"/g)).toEqual(['data-end-chip="HEAD"', 'data-end-chip="TAIL"']);
  });

  it('single node: it is both HEAD and TAIL and points to NULL', () => {
    const [n] = chainNodes(render('ll-traverse', gen('ll-traverse', [5]), 0));
    expect([n['data-head'], n['data-tail'], n['data-next']]).toEqual(['true', 'true', 'null']);
  });

  it('pointer positions: curr walks node by node and is drawn on the NULL terminator after the last one', () => {
    const steps = gen('ll-traverse', [4, 7]);
    const currOn = (k: number) => {
      const html = render('ll-traverse', steps, k);
      const node = nodes(html).find(n => n['data-pointers'].split(',').includes('curr'));
      return node ? node['data-value'] : nullTerminator(html)['data-pointers'].includes('curr') ? 'NULL' : '—';
    };
    const loops = steps.map((s, k) => [s, k] as const).filter(([s]) => s.codeRef === 'loop').map(([, k]) => k);
    expect(loops.map(currOn)).toEqual(['4', '7', 'NULL']);
  });

  it('reverse: prev = NULL is drawn at NULL; mid-loop the cut-off part is shown as not reachable from HEAD', () => {
    const steps = gen('reverse-linked-list', [1, 2, 3]);
    expect(nullTerminator(render('reverse-linked-list', steps, at(steps, 'set-prev')))['data-pointers']).toBe('prev');
    const html = render('reverse-linked-list', steps, at(steps, 'advance-prev', 1));
    expect(chainNodes(html).map(n => n['data-value'])).toEqual(['1']);
    const view = deriveListView(steps[at(steps, 'advance-prev', 1)])!;
    expect(view.segments.map(g => [g.reason, g.nodes.map(n => n.value), g.end])).toEqual([
      ['unreachable', [2], { kind: 'node', id: 'n1', value: 1, position: 0 }],
      ['unreachable', [3], { kind: 'null' }],
    ]);
    expect(html).toContain('Not reachable from HEAD');
    expect(html).toContain('data-segment-end="n1"');
  });

  it('link highlighting: only the arrow whose next just changed is highlighted, and labelled', () => {
    const steps = gen('ll-insert-at', [4, 7, 9], { index: 2, value: 5 });
    const html = render('ll-insert-at', steps, at(steps, 'link-prev'));
    const changed = tags(html, 'data-arrow-from').filter(a => a['data-changed'] === 'true');
    expect(changed).toEqual([expect.objectContaining({ 'data-arrow-from': 'n2', 'data-arrow-to': 'n4' })]);
    expect(html).toContain('new link');
    expect(html).toContain('link just changed');
    // a step that changes nothing highlights nothing
    expect(render('ll-insert-at', steps, at(steps, 'check-tail'))).not.toContain('data-changed="true"');
  });

  it('HEAD / TAIL highlighting follows the changed metadata, including transitional states', () => {
    const steps = gen('ll-insert-head', [], { value: 8 });
    const setHead = render('ll-insert-head', steps, at(steps, 'set-head'));
    expect(endChip(setHead, 'HEAD')[0]['data-changed']).toBe('true');
    // HEAD → the new node while TAIL is still NULL: the TAIL chip is on the NULL terminator
    const beforeNull = setHead.slice(0, setHead.indexOf('data-testid="null-terminator"'));
    const nullBox = beforeNull.slice(beforeNull.lastIndexOf('data-arrow-from'));
    expect(nullBox.match(/data-end-chip="(HEAD|TAIL)"/g)).toEqual(['data-end-chip="TAIL"']);
    expect(chainNodes(setHead)[0]['data-tail']).toBe('false');
    expect(deriveListView(steps[at(steps, 'set-head')])!.tailNull).toBe(true);
    const setTail = render('ll-insert-head', steps, at(steps, 'set-tail'));
    expect(endChip(setTail, 'TAIL')[0]['data-changed']).toBe('true');
    expect(chainNodes(setTail)[0]['data-tail']).toBe('true');
  });

  it('created nodes: drawn outside the list and marked NEW, until a link or HEAD reaches them', () => {
    const steps = gen('ll-insert-tail', [4], { value: 9 });
    const created = render('ll-insert-tail', steps, at(steps, 'create-node'));
    const n2 = nodes(created).find(n => n['data-list-node'] === 'n2')!;
    expect([n2['data-position'], n2['data-new'], n2['data-pointers']]).toEqual(['outside', 'true', 'node']);
    expect(created).toContain('data-reason="detached"');
    expect(created).toContain('Outside the list');
    const linked = render('ll-insert-tail', steps, at(steps, 'link-tail'));
    expect(nodes(linked).find(n => n['data-list-node'] === 'n2')!['data-position']).toBe('1');
    expect(linked).not.toContain('data-testid="list-segment"');
  });

  it('deletion: the unlinked node is drawn separately (TAIL may still name it), then shown as released', () => {
    const steps = gen('ll-delete-tail', [4, 7, 9]);
    const unlinked = render('ll-delete-tail', steps, at(steps, 'unlink'));
    const n3 = nodes(unlinked).find(n => n['data-list-node'] === 'n3')!;
    expect([n3['data-position'], n3['data-tail'], n3['data-pointers']]).toEqual(['outside', 'true', 'temp']);
    expect(chainNodes(unlinked).map(n => n['data-value'])).toEqual(['4', '7']);
    const released = render('ll-delete-tail', steps, at(steps, 'release'));
    expect(nodes(released).map(n => n['data-list-node'])).toEqual(['n1', 'n2']);
    expect(released).toMatch(/data-testid="released-node" data-value="9"/);
    // the next step no longer mentions it
    expect(render('ll-delete-tail', steps, at(steps, 'release') + 1)).not.toContain('released-node');
  });

  it('one node → empty: HEAD moves to NULL first while TAIL still names the node outside the list', () => {
    const steps = gen('ll-delete-head', [5]);
    const html = render('ll-delete-head', steps, at(steps, 'advance-head'));
    expect(chainNodes(html)).toEqual([]);
    const n1 = nodes(html)[0];
    expect([n1['data-position'], n1['data-tail'], n1['data-head']]).toEqual(['outside', 'true', 'false']);
    expect(endChip(html, 'HEAD')[0]['data-changed']).toBe('true');
  });

  it('search: comparisons and the match are highlighted; the final step reports the found position', () => {
    const steps = gen('ll-search', [4, 7, 1, 7], { value: 7 });
    const cmp = render('ll-search', steps, at(steps, 'check-match'));
    expect(chainNodes(cmp).map(n => n['data-role'])).toEqual(['compare', 'default', 'default', 'default']);
    expect(cmp).toContain('data-testid="value-pill"');
    expect(cmp).toContain('target value = 7');
    expect(cmp).not.toContain('data-testid="index-pill"'); // Search's index is a counter, not a position input
    const done = render('ll-search', steps, steps.length - 1);
    expect(chainNodes(done).map(n => n['data-role'])).toEqual(['default', 'found', 'default', 'default']);
    expect(done).toMatch(/data-outcome-kind="found"[^>]*>.*Value found at position 1/);
    const miss = gen('ll-search', [4], { value: 3 });
    expect(render('ll-search', miss, miss.length - 1)).toMatch(/data-outcome-kind="not-found"[^>]*>.*Value not found/);
  });

  it('position operations show the position; other final steps report the list size', () => {
    const steps = gen('ll-delete-at', [4, 7, 1], { index: 1 });
    expect(render('ll-delete-at', steps, 0)).toContain('position = 1');
    expect(render('ll-delete-at', steps, steps.length - 1)).toMatch(/data-outcome-kind="complete"[^>]*>.*Done — the list has 2 nodes/);
    const empty = gen('ll-delete-head', [5]);
    expect(render('ll-delete-head', empty, empty.length - 1)).toMatch(/data-outcome-kind="empty"[^>]*>.*Done — the list is empty/);
  });

  it('reduced motion and transitions: colour changes are motion-safe only', () => {
    const html = render('ll-traverse', gen('ll-traverse', [1, 2]), 1);
    for (const n of html.match(/<div role="img"[^>]*>/g)!) {
      expect(n).toContain('motion-safe:transition-colors');
      expect(n).not.toMatch(/(?<!motion-safe:)transition-(colors|all)/);
    }
  });
});

// Phase 5: every highlighted state carries visible TEXT as well as colour (WCAG 1.4.1, use of colour)
describe('LinkedListVisualizer — no state is shown by colour alone', () => {
  const visibleText = (html: string) => html.replace(/<span class="sr-only">.*?<\/span>/g, '').replace(/<[^>]+>/g, ' ');

  it('compared and matching nodes have COMPARE / MATCH badges; plain nodes have none', () => {
    const steps = gen('ll-search', [4, 7], { value: 7 });
    const cmp = render('ll-search', steps, at(steps, 'check-match'));
    expect([...cmp.matchAll(/data-role-badge="(\w+)"[^>]*>([A-Z]+)</g)].map(m => [m[1], m[2]])).toEqual([['compare', 'COMPARE']]);
    const found = render('ll-search', steps, steps.findIndex(s => s.type === 'found'));
    expect([...found.matchAll(/data-role-badge="(\w+)"[^>]*>([A-Z]+)</g)].map(m => [m[1], m[2]])).toEqual([['found', 'MATCH']]);
    expect(render('ll-search', steps, 0)).not.toContain('data-role-badge');
  });

  it('a moved HEAD / TAIL says "moved"; a changed link says "new link"; others say nothing', () => {
    const steps = gen('ll-insert-tail', [4], { value: 9 });
    expect(visibleText(render('ll-insert-tail', steps, at(steps, 'link-tail')))).toContain('new link');
    expect(visibleText(render('ll-insert-tail', steps, at(steps, 'set-tail')))).toMatch(/TAIL moved/);
    const head = gen('ll-delete-head', [4, 7]);
    expect(visibleText(render('ll-delete-head', head, at(head, 'advance-head')))).toMatch(/HEAD moved/);
    const quiet = visibleText(render('ll-insert-tail', steps, at(steps, 'check-empty')));
    expect(quiet).not.toMatch(/moved|new link/);
  });

  it('created, outside, cut-off and released nodes are named in visible text', () => {
    const ins = gen('ll-insert-head', [4], { value: 2 });
    expect(visibleText(render('ll-insert-head', ins, at(ins, 'create-node')))).toMatch(/Outside the list[\s\S]*NEW/);
    const rev = gen('reverse-linked-list', [1, 2]);
    expect(visibleText(render('reverse-linked-list', rev, at(rev, 'reverse-link')))).toContain('Not reachable from HEAD');
    const del = gen('ll-delete-head', [4, 7]);
    expect(visibleText(render('ll-delete-head', del, at(del, 'release')))).toMatch(/node\s+4\s+released/);
  });
});

// The step announcer reads each step's message; a step that changes a link, HEAD or TAIL must name what it changed.
describe('linked-list step messages announce every link / HEAD / TAIL change', () => {
  it('all ten operations, empty / single / several nodes', () => {
    const missing: string[] = [];
    for (const id of LIST_OPS) {
      const def = getAlgorithmDefinition(id)!;
      for (const input of [[], [5], [4, 7, 9]]) {
        const runs = def.inputSpec?.index
          ? [0, input.length - 1, input.length].map(index => ({ index, value: 1 }))
          : [{ value: 7 }];
        for (const p of runs) {
          let steps: ExecutionStep[];
          try {
            steps = def.generateSteps([...input], p);
          } catch {
            continue; // an index the app rejects before running
          }
          for (const s of steps) {
            const c = s.list!.changed;
            if (!c) continue;
            const named = c.kind === 'next' ? /next/i : c.kind === 'head' ? /head/i : /tail/i;
            if (!named.test(s.message)) missing.push(`${id} ${s.codeRef}: "${s.message}" does not name the ${c.kind} change`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('list size options', () => {
  it('lists offer only sizes the operation accepts (array options are unchanged)', () => {
    expect(getSizeOptions(5)).toEqual([5, 7, 10, 12]);
    expect(getSizeOptions(8)).toEqual([5, 7, 8, 10, 12]);
    expect(getSizeOptions(4, { min: 0, max: 10 })).toEqual([4, 5, 7, 10]);
    expect(getSizeOptions(3, { min: 0, max: 9 })).toEqual([3, 5, 7, 9]);
    expect(getSizeOptions(1, { min: 1, max: 10 })).toEqual([1, 5, 7, 10]);
  });
});
