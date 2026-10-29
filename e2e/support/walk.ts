import { expect } from '@playwright/test';
import type { VisualizerApp, UiState } from './visualizerApp';
import {
  definition,
  engineSteps,
  expectedLine,
  intentPattern,
  type AlgorithmId,
  type ExecutionStep,
  type ProgrammingLanguage,
} from './engineTrace';

const POINTER_LABEL: Record<string, string> = { minIdx: 'min', pivotIndex: 'pivot', inserted: 'ins', largest: 'max' };

export interface WalkResult {
  steps: ExecutionStep[];
  /** the UI state on the final step */
  final: UiState;
  /** every UI state observed, in order (step 1 .. last) */
  observed: UiState[];
}

/**
 * Steps the REAL UI (its Next button) from step 1 to the last step and, at every step, compares what is on screen with
 * the engine's trace for the same input. This is a TRACE-vs-ENGINE consistency check (the UI renders what the
 * engine produced): counter, current action, explanation, highlighted code line (number, text, and an independent
 * "intent" pattern for that operation), bar values, compared values, compare-bar indices and pointer labels.
 * Algorithm correctness is asserted separately against `oracles.ts`.
 *
 * All mismatches are collected and reported together, so one failure shows the whole picture.
 */
export async function walkAndCompareWithEngine(
  app: VisualizerApp,
  id: AlgorithmId,
  array: number[],
  target: number | null,
  lang: ProgrammingLanguage = 'cpp'
): Promise<WalkResult> {
  const steps = engineSteps(id, array, target);
  const def = definition(id);
  const problems: string[] = [];

  await app.reset();
  await app.expectStep(1);
  await app.expectTotal(steps.length);

  // one in-page pass that clicks the app's real Next button between reads (see VisualizerApp.collectStates)
  const observed = await app.collectStates(steps.length);
  if (observed.length !== steps.length) problems.push(`the UI offered only ${observed.length} of ${steps.length} steps (Next became disabled early)`);

  for (let i = 0; i < Math.min(steps.length, observed.length); i++) {
    const s = observed[i];
    const e = steps[i];
    const at = `step ${i + 1}/${steps.length} [${e.codeRef}]`;

    if (s.step !== i + 1 || s.total !== steps.length) {
      problems.push(`${at}: counter shows ${s.step}/${s.total}`);
      break;
    }
    if (s.currentAction !== e.message) problems.push(`${at}: current action "${s.currentAction}" != "${e.message}"`);
    if (s.message !== e.message) problems.push(`${at}: step message "${s.message}" != "${e.message}"`);
    if (s.explanation !== (e.explanation ?? '')) problems.push(`${at}: explanation "${s.explanation}" != "${e.explanation}"`);
    // the TRUE/FALSE badge is read right after the step changes, when a lingering previous result would still show
    const wantResult = e.result === 'true' ? 'TRUE' : e.result === 'false' ? 'FALSE' : null;
    if (s.result !== wantResult) problems.push(`${at}: result badge "${s.result}" != "${wantResult}"`);

    if (!e.codeRef) {
      // explanation-only step (e.g. "element locked"): no statement runs, so no line may be highlighted
      if (s.activeLine) problems.push(`${at}: explanation-only step highlights line ${JSON.stringify(s.activeLine)}`);
      if (!s.noStatement) problems.push(`${at}: code panel does not say that no statement runs`);
    } else {
      const line = expectedLine(id, lang, e);
      if (!s.activeLine || s.activeLine.n !== line.n || s.activeLine.text !== line.text) {
        problems.push(`${at}: highlighted line ${JSON.stringify(s.activeLine)} != ${line.n} "${line.text}"`);
      } else if (!intentPattern(id, e).test(s.activeLine.text)) {
        problems.push(`${at}: highlighted line "${s.activeLine.text}" does not match the intended operation ${intentPattern(id, e)}`);
      }
      if (s.noStatement) problems.push(`${at}: code panel says no statement runs, but the step maps to a line`);
    }
    if (s.unmapped) problems.push(`${at}: UI reports an unmapped step`);

    // as many bars as the engine's array at this step (usually the input; Merge Sorted Array adds nums2's slots)
    const n = e.state.length;
    if (s.bars.length !== n || s.bars.some((b, k) => b.value !== e.state[k])) {
      problems.push(`${at}: bar values [${s.bars.map(b => b.value)}] != state [${e.state}]`);
    }
    if (e.type === 'compare' && e.comparedValues) {
      const shown = `${e.comparedValues.val1} vs ${e.comparedValues.val2}`;
      if (s.comparing !== shown) problems.push(`${at}: Comparing panel "${s.comparing}" != "${shown}"`);
      const pivot = e.extraInfo?.pivotIndex;
      const want = [...new Set(e.indices ?? [])].filter(x => x !== pivot).sort((a, b) => a - b);
      const got = s.bars.filter(b => b.role === 'compare').map(b => b.index).sort((a, b) => a - b);
      if (got.join() !== want.join()) problems.push(`${at}: compare bars [${got}] != [${want}]`);
    }
    for (const [k, v] of Object.entries(e.pointers ?? {})) {
      if (def.positionPointers && !def.positionPointers.includes(k)) continue;
      if (Number.isInteger(v) && v >= 0 && v < n && !s.bars[v]?.pointers.includes(POINTER_LABEL[k] ?? k)) {
        problems.push(`${at}: pointer ${k}=${v} is not drawn under bar ${v}`);
      }
    }
  }

  expect(problems, `UI vs engine trace for ${id} ${JSON.stringify(array)} target=${target} (${lang})`).toEqual([]);
  return { steps, final: observed[observed.length - 1], observed };
}
