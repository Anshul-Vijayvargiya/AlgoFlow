import { expect } from '@playwright/test';
import type { VisualizerApp, UiState } from './visualizerApp';
import { engineListSteps, expectedLine, intentPattern, type AlgorithmId, type ExecutionStep, type ListParams, type ProgrammingLanguage } from './engineTrace';
import { chainFrom } from '../../src/engine/linkedList/listSnapshot';

export interface ListWalkResult {
  steps: ExecutionStep[];
  final: UiState;
  observed: UiState[];
}

/**
 * Steps the REAL UI (its Next button) through a linked-list operation and, at every step, compares what is on screen
 * with the engine's snapshot for the same input: counter, messages, TRUE/FALSE badge, highlighted code line, the list
 * drawn from HEAD, the nodes drawn outside it, HEAD / TAIL, every named pointer (NULL ones at the terminator), the
 * changed link / HEAD / TAIL, the explanation's list read-out, and that no bars are drawn. A TRACE-vs-ENGINE check:
 * results are asserted separately against `listOracle`.
 */
export async function walkListAndCompare(
  app: VisualizerApp,
  id: AlgorithmId,
  list: number[],
  params: ListParams = {},
  lang: ProgrammingLanguage = 'cpp'
): Promise<ListWalkResult> {
  const steps = engineListSteps(id, list, params);
  const problems: string[] = [];

  await app.reset();
  await app.expectStep(1);
  await app.expectTotal(steps.length);
  const observed = await app.collectStates(steps.length);
  if (observed.length !== steps.length) problems.push(`the UI offered only ${observed.length} of ${steps.length} steps`);

  for (let i = 0; i < Math.min(steps.length, observed.length); i++) {
    const s = observed[i];
    const e = steps[i];
    const snap = e.list!;
    const at = `step ${i + 1}/${steps.length} [${e.codeRef}]`;
    if (s.step !== i + 1 || s.total !== steps.length) {
      problems.push(`${at}: counter shows ${s.step}/${s.total}`);
      break;
    }
    if (s.currentAction !== e.message) problems.push(`${at}: current action "${s.currentAction}" != "${e.message}"`);
    if (s.message !== e.message) problems.push(`${at}: step message "${s.message}" != "${e.message}"`);
    if (s.explanation !== (e.explanation ?? '')) problems.push(`${at}: explanation "${s.explanation}" != "${e.explanation}"`);
    const wantResult = e.result === 'true' ? 'TRUE' : e.result === 'false' ? 'FALSE' : null;
    if (s.result !== wantResult) problems.push(`${at}: result badge "${s.result}" != "${wantResult}"`);

    const line = expectedLine(id, lang, e);
    if (!s.activeLine || s.activeLine.n !== line.n || s.activeLine.text !== line.text) {
      problems.push(`${at}: highlighted line ${JSON.stringify(s.activeLine)} != ${line.n} "${line.text}"`);
    } else if (!intentPattern(id, e).test(s.activeLine.text)) {
      problems.push(`${at}: highlighted line "${s.activeLine.text}" does not match ${intentPattern(id, e)}`);
    }
    if (s.unmapped) problems.push(`${at}: UI reports an unmapped step`);
    if (s.bars.length) problems.push(`${at}: ${s.bars.length} array bars are drawn for a linked list`);

    const v = s.list;
    if (!v) {
      problems.push(`${at}: no linked-list view`);
      continue;
    }
    const chain = chainFrom(snap, snap.head);
    if (v.chain.map(n => n.id).join() !== chain.join()) problems.push(`${at}: drawn chain [${v.chain.map(n => n.id)}] != snapshot [${chain}]`);
    if (v.chain.map(n => n.value).join() !== e.state.join()) problems.push(`${at}: drawn values [${v.chain.map(n => n.value)}] != state [${e.state}]`);
    const outside = snap.nodes.filter(n => !chain.includes(n.id)).map(n => n.id).sort();
    if (v.outside.map(n => n.id).sort().join() !== outside.join()) problems.push(`${at}: outside nodes [${v.outside.map(n => n.id)}] != [${outside}]`);
    for (const n of [...v.chain, ...v.outside]) {
      const sn = snap.nodes.find(m => m.id === n.id)!;
      if (n.next !== (sn.next ?? 'null')) problems.push(`${at}: ${n.id}.next drawn ${n.next} != ${sn.next}`);
      const named = Object.entries(snap.pointers).filter(([, p]) => p === n.id).map(([k]) => k);
      if (n.pointers.join() !== named.join()) problems.push(`${at}: pointers on ${n.id} [${n.pointers}] != [${named}]`);
    }
    if (v.outside.some(n => n.reason === 'detached') !== snap.detached.length > 0) problems.push(`${at}: detached nodes drawn wrongly`);
    const nullNamed = Object.entries(snap.pointers).filter(([, p]) => p === null).map(([k]) => k);
    if (v.nullPointers.join() !== nullNamed.join()) problems.push(`${at}: NULL pointers [${v.nullPointers}] != [${nullNamed}]`);
    if (v.headAt.join() !== (snap.head ?? 'null')) problems.push(`${at}: HEAD drawn at ${v.headAt} != ${snap.head}`);
    if (v.tailAt.join() !== (snap.tail ?? 'null')) problems.push(`${at}: TAIL drawn at ${v.tailAt} != ${snap.tail}`);
    const c = snap.changed;
    if (v.changedArrows.join() !== (c?.kind === 'next' ? c.node : '')) problems.push(`${at}: changed arrows [${v.changedArrows}] != ${JSON.stringify(c)}`);
    if (v.headChanged !== (c?.kind === 'head')) problems.push(`${at}: HEAD highlight ${v.headChanged} != ${JSON.stringify(c)}`);
    if (v.tailChanged !== (c?.kind === 'tail')) problems.push(`${at}: TAIL highlight ${v.tailChanged} != ${JSON.stringify(c)}`);
    const wantState = e.state.length ? `${e.state.join(' → ')} → NULL` : 'NULL (empty)';
    if (s.stateText !== wantState) problems.push(`${at}: explanation list "${s.stateText}" != "${wantState}"`);
  }

  expect(problems, `UI vs engine trace for ${id} ${JSON.stringify(list)} ${JSON.stringify(params)} (${lang})`).toEqual([]);
  return { steps, final: observed[observed.length - 1], observed };
}
