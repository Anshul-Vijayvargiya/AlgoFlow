import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { definition, type ExecutionStep, type ProgrammingLanguage } from '../support/engineTrace';
import { resolveCodeRef } from '../../src/engine/AlgorithmRegistry';

/**
 * Merge k Sorted Lists through the real UI: the lists are typed into the lists field; what each step shows (every input
 * node's status, the min heap as a tree and as its array, the merged list with its dummy node, tail and node, the
 * variables, the step's description and the highlighted line) is checked against the engine's own trace for the same
 * lists. The results themselves are checked against a sort of all the values, and the four listings are compiled and
 * run, in the unit tests (mergeKSortedLists.test.ts, scripts/__tests__/mergeKSortedListsListings.test.ts).
 */
const ID = 'heap-merge-k-sorted-lists' as const;
const EXAMPLE = '[[1,4,5],[1,3,4],[2,6]]';
/** five lists, a list of five nodes and twelve nodes in all: every limit at once */
const FULL = '[[1,2,3,4,5],[1,2,3],[2],[3,4],[5]]';
const engine = (lists: string) => definition(ID).generateSteps([], { texts: [lists] });
const field = (page: Page) => page.locator('#text-input-lists');

async function enter(page: Page, lists: string) {
  await field(page).fill(lists);
  await page.locator('#apply-input').click();
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(lists).length));
}

interface ListsUi {
  step: number;
  line: number | null;
  phase: string;
  inputs: string[];
  current: string[];
  heap: string[];
  tree: string[];
  merged: string[];
  dummy: string | null;
  vars: string[];
  note: string;
  action: string;
  result: string | null;
}

/** what the page shows at this step and the next count - 1 (clicking the real Next button in the page) */
const collect = (page: Page, count: number): Promise<ListsUi[]> =>
  page.evaluate(async count => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
    const heapNode = (e: HTMLElement | SVGElement, k: string | undefined) => `${k}=${e.dataset.nodeId}:${e.dataset.value}:L${e.dataset.list}:${e.dataset.state}:${e.dataset.pointers}`;
    const read = (): ListsUi => {
      const active = document.querySelector<HTMLElement>('[data-line][aria-current="step"]');
      return {
        step: Number(q('step-counter')?.dataset.step),
        line: active ? Number(active.dataset.line) : null,
        phase: q('klists-visualizer')?.dataset.phase ?? '',
        inputs: all('[data-node]').map(e => `${e.dataset.node}=${e.dataset.value}:${e.dataset.status}`),
        current: all('[data-list][data-length]').map(e => e.dataset.current ?? ''),
        heap: all('[data-heap-index]').map(e => heapNode(e, e.dataset.heapIndex)),
        tree: [...document.querySelectorAll<SVGGElement>('[data-heap-node]')].map(e => heapNode(e, e.dataset.heapNode)),
        merged: all('[data-merged]').map(e => `${e.dataset.nodeId}:${e.dataset.value}:L${e.dataset.list}:${e.dataset.state}:${e.dataset.marks}`),
        dummy: q('klists-dummy')?.dataset.marks ?? null,
        vars: all('[data-testid="klists-vars"] [data-var]').map(e => `${e.dataset.var}=${e.dataset.value}`),
        note: q('klists-note')?.textContent ?? '',
        action: q('klists-operation')?.textContent ?? '',
        result: q('klists-result')?.textContent ?? null,
      };
    };
    const states = [read()];
    for (let i = 1; i < count; i++) {
      const next = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('Next'));
      if (!next || next.disabled) break;
      const before = q('step-counter')?.getAttribute('data-step');
      next.click();
      for (let tries = 0; tries < 500 && q('step-counter')?.getAttribute('data-step') === before; tries++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      states.push(read());
    }
    return states;
  }, count);

/** what the engine's step says the page shows, in the collector's shape */
function expected(lang: ProgrammingLanguage, s: ExecutionStep, k: number): ListsUi {
  const v = s.mergeK!;
  const node = (id: string) => v.nodes.find(n => n.id === id)!;
  const named = (id: string) => `${node(id).value} (L${node(id).list})`;
  const status = (id: string) => (v.merged.includes(id) ? 'merged' : v.min === id || v.node === id ? 'taken' : v.heap.includes(id) ? 'heap' : 'waiting');
  const focus = v.pointers.find(p => p.name === 'i')?.index;
  const heapState = (id: string, at: number) =>
    v.swapped?.includes(at)
      ? 'swapped'
      : v.moved?.from === at
        ? 'leaving'
        : v.moved?.to === at
          ? 'moved'
          : v.inserted === at
            ? 'inserted'
            : v.compared?.includes(at)
              ? 'compared'
              : at === 0 && v.min === id
                ? 'min'
                : focus === at
                  ? 'focus'
                  : 'normal';
  const heap = v.heap.map((id, at) => `${at}=${id}:${node(id).value}:L${node(id).list}:${heapState(id, at)}:${v.pointers.filter(p => p.index === at).map(p => p.name).join(',')}`);
  return {
    step: k + 1,
    line: resolveCodeRef(definition(ID), lang, s.codeRef),
    phase: v.phase,
    inputs: v.nodes.map(n => `${n.id}=${n.value}:${status(n.id)}`),
    current: v.lists.map((_, i) => (v.listIndex === i ? 'true' : 'false')),
    heap,
    tree: heap,
    merged: v.merged.map(id => `${id}:${node(id).value}:L${node(id).list}:${v.linked === id ? 'linked' : 'merged'}:${[...(v.tail === id ? ['tail'] : []), ...(v.node === id ? ['node'] : [])].join(',')}`),
    dummy: v.dummy ? (v.tail === 'dummy' ? 'tail' : '') : null,
    vars: [
      `i=${v.listIndex ?? ''}`,
      `size=${v.heap.length}`,
      `min=${v.min ? named(v.min) : ''}`,
      `node=${v.node ? named(v.node) : ''}`,
      `tail=${v.tail === null ? '' : v.tail === 'dummy' ? 'dummy' : named(v.tail)}`,
    ],
    note: s.message,
    action: s.actionLabel ?? '',
    result: v.result?.text ?? null,
  };
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id} | ${n.target.join(' ')}`)).sort();
}

test.describe('Merge k Sorted Lists', () => {
  test('listed under HEAP & PRIORITY QUEUE right after Last Stone Weight (not Coming Soon); opens its own three sections with the example', async ({ app, page }) => {
    const text = ((await app.sidebar.textContent()) ?? '').replace(/\s+/g, ' ');
    const at = (t: string) => text.indexOf(t);
    expect(at('HEAP & PRIORITY QUEUE')).toBeGreaterThan(-1);
    expect(at('HEAP & PRIORITY QUEUE')).toBeLessThan(at('Last Stone Weight'));
    expect(at('Last Stone Weight')).toBeLessThan(at('Merge k Sorted Lists'));
    await expect(app.sidebar.getByRole('button', { name: 'Merge k Sorted Lists', exact: true })).toHaveAttribute('title', definition(ID).subtitle);
    await app.selectAlgorithm(ID);
    await expect(app.heading).toHaveText('Merge k Sorted Lists');
    await expect(page.getByText('Coming Soon')).toHaveCount(0);
    await expect(page.getByTestId('klists-visualizer')).toBeVisible();
    for (const id of ['klists-inputs', 'klists-heap', 'klists-merged']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(field(page)).toHaveValue(EXAMPLE);
    await expect(page.locator('[data-node]')).toHaveCount(8);
    await expect(page.locator('[data-list][data-length]')).toHaveCount(3);
    await expect(page.locator('#text-input-hint')).toContainText('At most 5 lists, 5 nodes per list and 12 nodes in all');
    await expect(page.getByText('O(N log k)').first()).toBeVisible();
    // its own view: not the max heap of Last Stone Weight, not the single linked list, not bars
    await expect(page.getByTestId('heap-visualizer')).toHaveCount(0);
    await expect(page.getByTestId('array-visualizer')).toHaveCount(0);
    await expect(page.locator('[data-bar-index]')).toHaveCount(0);
    await expect(page.getByTestId('text-input-panel')).toBeVisible();
  });

  test(`${EXAMPLE}: every step as traced (lists, heap, merged list, variables and line), ending with 1 → 1 → 2 → 3 → 4 → 4 → 5 → 6`, async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    const steps = engine(EXAMPLE);
    const shown = await collect(page, steps.length);
    expect(shown.map(u => u.step)).toEqual(steps.map((_, k) => k + 1));
    for (const [k, s] of steps.entries()) expect(shown[k], `step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    await expect(page.getByTestId('klists-result')).toHaveText('Merged 8 nodes from 3 lists: 1 → 1 → 2 → 3 → 4 → 4 → 5 → 6');
    await expect(page.getByTestId('klists-merged')).toHaveAttribute('data-values', '1,1,2,3,4,4,5,6');
    await expect(page.locator('[data-node][data-status="merged"]')).toHaveCount(8);
  });

  test('ties, an empty list and every limit: every step as traced for five lists and twelve nodes', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    for (const lists of ['[[2,2],[],[2],[2,2]]', FULL]) {
      await enter(page, lists);
      const steps = engine(lists);
      const shown = await collect(page, steps.length);
      expect(shown).toHaveLength(steps.length);
      for (const [k, s] of steps.entries()) expect(shown[k], `${lists} step ${k + 1}: ${s.message}`).toEqual(expected('cpp', s, k));
    }
    await expect(page.getByTestId('klists-merged')).toHaveAttribute('data-values', '1,1,2,2,2,3,3,3,4,4,5,5');
  });

  test('a pop takes the root, links that same node after the tail and pushes its successor', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, '[[1,3],[2]]');
    const steps = engine('[[1,3],[2]]');
    const go = async (index: number) => {
      await app.advance(index - ((await app.stepNumber()) - 1));
      await app.expectStep(index + 1);
    };
    await go(steps.findIndex(s => s.codeRef === 'pop-min@node'));
    await expect(page.locator('[data-heap-index="0"]')).toHaveAttribute('data-state', 'min');
    await expect(page.locator('[data-node="l0n0"]')).toHaveAttribute('data-status', 'taken');
    await expect(page.locator('[data-testid="klists-vars"] [data-var="min"]')).toHaveAttribute('data-value', '1 (L0)');
    await go(steps.findIndex(s => s.codeRef === 'pop-move-last@node'));
    await expect(page.locator('[data-heap-index="0"]')).toHaveAttribute('data-state', 'moved');
    await expect(page.locator('[data-heap-index="1"]')).toHaveAttribute('data-state', 'leaving');
    await go(steps.findIndex(s => s.codeRef === 'link-node'));
    await expect(page.locator('[data-merged="0"]')).toHaveAttribute('data-node-id', 'l0n0');
    await expect(page.locator('[data-merged="0"]')).toHaveAttribute('data-state', 'linked');
    await expect(page.getByTestId('klists-dummy')).toHaveAttribute('data-marks', 'tail');
    await expect(page.getByTestId('klists-note')).toHaveText('tail->next = node — dummy → 1');
    await app.next();
    await expect(page.locator('[data-merged="0"]')).toHaveAttribute('data-marks', 'tail,node');
    await expect(page.getByTestId('klists-dummy')).toHaveAttribute('data-marks', '');
    await app.next();
    await expect(page.getByTestId('klists-note')).toHaveText('node->next != NULL → TRUE (next is 3)');
    await go(steps.findIndex(s => s.codeRef === 'ins-store@next'));
    await expect(page.getByTestId('klists-heap-array')).toHaveAttribute('data-ids', 'l1n0,l0n1');
    await expect(page.locator('[data-heap-index="1"]')).toHaveAttribute('data-state', 'inserted');
    await expect(page.locator('[data-node="l0n1"]')).toHaveAttribute('data-status', 'heap');
    await app.goToLastStep();
    await expect(page.getByTestId('klists-merged')).toHaveAttribute('data-ids', 'l0n0,l1n0,l0n1');
    await expect(page.getByTestId('klists-merged-end')).toBeVisible();
  });

  for (const lang of ['c', 'cpp', 'java', 'python'] as const) {
    test(`the ${lang} code panel shows the merge loop, and the highlighted line follows the trace`, async ({ app, page }) => {
      test.slow();
      await app.selectAlgorithm(ID);
      await app.setLanguage(lang);
      const def = definition(ID);
      const LOOP = { c: 'while (size > 0) {', cpp: 'while (!pq.empty()) {', java: 'while (!pq.isEmpty()) {', python: 'while heap:' };
      const POP = { c: 'struct ListNode *node = pop(heap, &size);', cpp: 'ListNode *node = pq.top();', java: 'ListNode node = pq.poll();', python: 'val, i, node = heapq.heappop(heap)' };
      const PUSH = { c: 'if (heap[parent]->val <= heap[i]->val)', cpp: 'pq.push(node->next);', java: 'pq.add(node.next);', python: 'heapq.heappush(heap, (node.next.val, i, node.next))' };
      await expect(page.locator(`[data-line="${def.lineMap[lang]['merge-loop']}"]`)).toContainText(LOOP[lang]);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['pop-node']}"]`)).toContainText(POP[lang]);
      await expect(page.locator(`[data-line="${def.lineMap[lang]['su-check@next']}"]`)).toContainText(PUSH[lang]);
      const steps = engine(EXAMPLE);
      const shown = await collect(page, steps.length);
      expect(shown.map(u => u.line)).toEqual(steps.map(s => resolveCodeRef(def, lang, s.codeRef)));
    });
  }

  for (const [lists, values, message] of [
    ['[]', '', 'No lists: the merged list is empty (NULL)'],
    ['[[]]', '', 'The list is empty: the merged list is empty (NULL)'],
    ['[[],[]]', '', 'All 2 lists are empty: the merged list is empty (NULL)'],
    ['[[1,2,3]]', '1,2,3', 'Merged 3 nodes from 1 list: 1 → 2 → 3'],
    ['[[],[1]]', '1', 'Merged 1 node from 2 lists: 1'],
    ['[[5],[1],[3],[2],[4]]', '1,2,3,4,5', 'Merged 5 nodes from 5 lists: 1 → 2 → 3 → 4 → 5'],
    ['[[2,2],[2],[2,2]]', '2,2,2,2,2', 'Merged 5 nodes from 3 lists: 2 → 2 → 2 → 2 → 2'],
    ['[[-5,-1,3],[],[-2,0]]', '-5,-2,-1,0,3', 'Merged 5 nodes from 3 lists: -5 → -2 → -1 → 0 → 3'],
    ['[[1,4,7,10],[2,5,8,11],[3,6,9,12]]', '1,2,3,4,5,6,7,8,9,10,11,12', 'Merged 12 nodes from 3 lists: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12'],
  ] as const) {
    test(`through the UI: ${lists} → ${values === '' ? 'the empty list' : values}`, async ({ app, page }) => {
      await app.selectAlgorithm(ID);
      await enter(page, lists);
      const total = values === '' ? 0 : values.split(',').length;
      await expect(page.locator('[data-node]')).toHaveCount(total);
      await expect(page.locator('[data-node][data-status="waiting"]')).toHaveCount(total);
      await app.goToLastStep();
      await expect(page.getByTestId('klists-result')).toHaveText(message);
      await expect(page.getByTestId('klists-merged')).toHaveAttribute('data-values', values);
      await expect(page.locator('[data-merged]')).toHaveCount(total);
      await expect(page.locator('[data-node][data-status="merged"]')).toHaveCount(total);
      await expect(page.getByTestId('klists-heap')).toHaveAttribute('data-size', '0');
      await expect(page.getByTestId('klists-merged-end')).toBeVisible();
    });
  }

  test('malformed brackets, bad values, unsorted lists and inputs over a limit are refused with Visualize disabled', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    for (const [bad, message] of [
      ['', 'Enter a value for "lists".'],
      ['1,2', 'missing their opening "["'],
      ['[1, 2, 3]', 'Each list needs its own brackets'],
      ['[[1,2]', 'List L0 is missing its closing "]"'],
      ['[[1]]]', 'a "]" without a matching "["'],
      ['[[1] [2]]', 'Separate lists with a comma'],
      ['[[1],[1.5]]', 'List L1, value 1 ("1.5") is a decimal'],
      ['[[1,x]]', 'List L0, value 2 ("x") is not a whole number'],
      ['[[1000]]', 'List L0, value 1 (1000) is out of range: use values from -999 to 999'],
      ['[[1,3,2]]', 'List L0 is not sorted: position 1 (3) is greater than position 2 (2)'],
      ['[[1],[5,4]]', 'List L1 is not sorted: position 0 (5) is greater than position 1 (4)'],
      ['[[],[],[],[],[],[]]', 'Too many lists (6). The visualizer supports at most 5.'],
      ['[[1,2,3,4,5,6]]', 'List L0 has 6 nodes. The visualizer supports at most 5 per list.'],
      ['[[1,2,3,4,5],[1,2,3,4,5],[1,2,3]]', 'Too many nodes (13 in all the lists). The visualizer supports at most 12.'],
    ]) {
      await field(page).fill(bad);
      await expect(page.getByTestId('input-error'), bad).toContainText(message);
      await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#apply-input')).toBeDisabled();
    }
    // the trace on screen is still the valid one, and the lists were not sorted for the user
    await expect(page.locator('[data-node]')).toHaveCount(8);
    await expect(field(page)).toHaveValue('[[1,2,3,4,5],[1,2,3,4,5],[1,2,3]]');
    await field(page).fill(' [ [1, 2] , [ ] ] ');
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.locator('#apply-input')).toBeEnabled();
    await page.locator('#apply-input').click();
    await expect(page.locator('[data-list][data-length]')).toHaveCount(2);
    await expect(page.locator('[data-list-end="1"]')).toHaveText('NULL (empty list)');
  });

  test('Randomize loads one of the examples and keeps the custom lists for Restore', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    const custom = '[[3],[1,2]]';
    await enter(page, custom);
    const examples = definition(ID).inputSpec!.textExamples!.map(e => e[0]);
    await app.randomizeButton.click();
    const first = await field(page).inputValue();
    expect(examples).toContain(first);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(first).length));
    await expect(page.getByTestId('input-notice')).toContainText('lists = "[[3],[1,2]]"');
    await app.randomizeButton.click();
    const second = await field(page).inputValue();
    expect(examples).toContain(second);
    expect(second).not.toBe(first);
    await page.locator('#restore-input').click();
    await expect(field(page)).toHaveValue(custom);
    await expect(page.getByTestId('input-notice')).toHaveCount(0);
    await expect(page.getByTestId('step-counter')).toHaveAttribute('data-total', String(engine(custom).length));
    await expect(page.locator('[data-node]')).toHaveCount(3);
  });

  test('other algorithms are unaffected: Last Stone Weight keeps its max heap and array, a tree keeps its field, and neither takes these lists', async ({ app, page }) => {
    await app.selectAlgorithm(ID);
    await enter(page, '[[3],[1,2]]');
    await app.selectAlgorithm('heap-last-stone-weight');
    await expect(page.getByTestId('heap-visualizer')).toBeVisible();
    await expect(page.getByTestId('klists-visualizer')).toHaveCount(0);
    await expect(page.locator('#array-input')).toHaveValue('2, 7, 4, 1, 8, 1');
    await app.goToLastStep();
    await expect(page.getByTestId('heap-result')).toBeVisible();
    await app.selectAlgorithm('tree-inorder');
    await expect(page.locator('#text-input-root')).toHaveValue('[1, 2, 3, 4, 5, null, 6]');
    await expect(page.getByTestId('klists-visualizer')).toHaveCount(0);
    await page.locator('#text-input-root').fill('[[1],[2]]');
    await expect(page.getByTestId('input-error')).toBeVisible();
    await app.selectAlgorithm('reverse-linked-list');
    await expect(page.getByTestId('klists-visualizer')).toHaveCount(0);
    // and coming back loads the example, not another algorithm's input
    await app.selectAlgorithm(ID);
    await expect(field(page)).toHaveValue(EXAMPLE);
    await expect(page.getByTestId('input-error')).toHaveCount(0);
    await expect(page.getByTestId('klists-visualizer')).toBeVisible();
  });

  test('Play runs to the result; Previous steps back; Reset returns to the lists as given', async ({ app, page }) => {
    test.slow();
    await app.selectAlgorithm(ID);
    await enter(page, '[[2],[1]]');
    await app.setSpeed('fast');
    await app.play();
    await expect(page.getByTestId('klists-result')).toHaveText('Merged 2 nodes from 2 lists: 1 → 2', { timeout: 60_000 });
    const total = await app.totalSteps();
    expect(total).toBe(engine('[[2],[1]]').length);
    await app.previous();
    await app.expectStep(total - 1);
    await expect(page.getByTestId('klists-result')).toHaveCount(0);
    await app.reset();
    await app.expectStep(1);
    await expect(page.locator('[data-node][data-status="waiting"]')).toHaveCount(2);
    await expect(page.getByTestId('klists-heap')).toHaveAttribute('data-size', '0');
    await expect(page.getByTestId('klists-merged-pending')).toBeVisible();
  });

  for (const width of [390, 320]) {
    test(`phone width (${width}px): five lists, a full heap and twelve merged nodes stay inside the screen, wrapping instead of scrolling`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.selectAlgorithm(ID);
      await enter(page, FULL);
      const steps = engine(FULL);
      const inside = async (selector: string, count: number, what: string) => {
        const boxes = await page.locator(selector).evaluateAll(els => els.map(e => JSON.parse(JSON.stringify(e.getBoundingClientRect())) as { left: number; right: number; width: number }));
        expect(boxes, what).toHaveLength(count);
        for (const [k, b] of boxes.entries()) {
          expect(b.width, `${what} ${k}`).toBeGreaterThan(0);
          expect(b.left, `${what} ${k}`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${what} ${k}`).toBeLessThanOrEqual(width);
        }
      };
      // the heap is full (one node per list) and the first comparisons of a sift are marked
      await app.advance(steps.findIndex(s => s.codeRef === 'sd-check-left@node'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-node]', 12, 'input node');
      await inside('[data-list-tag]', 5, 'list tag');
      await inside('[data-heap-index]', 4, 'heap cell');
      await inside('[data-testid="klists-tree"]', 1, 'heap tree');
      await inside('[data-testid="klists-note"] span', 1, 'note');
      // the values inside the input nodes are not cut off
      const fits = await page.locator('[data-node]').evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth));
      expect(fits).toBe(true);
      await app.goToLastStep();
      await expect(page.getByTestId('klists-result')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await inside('[data-merged]', 12, 'merged node');
      await inside('[data-testid="klists-dummy"]', 1, 'dummy');
      await inside('[data-testid="klists-result"]', 1, 'result');
      await expect(page.getByTestId('klists-merged')).toHaveAttribute('data-values', '1,1,2,2,2,3,3,3,4,4,5,5');
    });
  }

  for (const theme of ['dark', 'galaxy', 'light', 'sunset'] as const) {
    test(`axe-core WCAG 2.1 A/AA on a push, a comparison, a pop, a link and the result, with all five list tags: no violations (${theme})`, async ({ app, page }) => {
      test.slow();
      await page.locator('#header-theme-select').selectOption(theme);
      await app.selectAlgorithm(ID);
      await enter(page, FULL);
      const steps = engine(FULL);
      const settle = () => page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
      const first = (ref: string, from = 0) => steps.findIndex((s, k) => k >= from && s.codeRef === ref);
      const pop = first('pop-min@node');
      const stops = [first('ins-store@head'), first('su-check@head'), pop, first('pop-move-last@node', pop), first('sd-check-left@node', pop), first('link-node', pop), first('su-swap@next', pop)];
      expect(stops.every(k => k >= 0)).toBe(true);
      expect(stops).toEqual([...stops].sort((a, b) => a - b));
      let at = 0;
      for (const index of stops) {
        await app.advance(index - at);
        at = index;
        await settle();
        expect(await violations(page), `${theme}: step ${index + 1} (${steps[index].codeRef})`).toEqual([]);
      }
      await app.goToLastStep();
      await settle();
      expect(await violations(page), `${theme}: result`).toEqual([]);
    });
  }
});
