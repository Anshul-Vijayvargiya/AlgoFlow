import type { AlgorithmInputSpec, CharMark, ExecutionStep, TextRow } from '../../../types/algorithm';
import { validateTextField } from '../../inputParsing';

/**
 * The strings a text algorithm runs on: params.texts (one per declared field, as the visualizer passes them), or the
 * fields' default example when there are none. Invalid input is refused with a RangeError: the app validates first, so
 * this only guards direct calls.
 */
export function textInputs(spec: AlgorithmInputSpec, params: Record<string, unknown> | undefined, name: string): string[] {
  const fields = spec.texts ?? [];
  const given = params?.texts;
  const texts = Array.isArray(given) ? given : fields.map(f => f.defaultValue);
  if (texts.length !== fields.length || texts.some(t => typeof t !== 'string')) {
    throw new RangeError(`${name} takes ${fields.map(f => f.label).join(' and ')}.`);
  }
  fields.forEach((field, i) => {
    const r = validateTextField(texts[i], field);
    if (!r.ok) throw new RangeError(r.message);
  });
  return texts as string[];
}

/** how a string is shown in a message or a value card: quoted, so "" and spaces are visible */
export const quoted = (s: string) => JSON.stringify(s);

/** how one character is shown in a message */
export const charText = (c: string) => (c === ' ' ? "' ' (a space)" : `'${c}'`);

/** a step without its id and state (a text algorithm has no array: state is always empty) */
export type TextStepInput = Omit<ExecutionStep, 'id' | 'state'>;

export function stepRecorder() {
  const steps: ExecutionStep[] = [];
  const push = (s: TextStepInput) => {
    steps.push({ id: steps.length, state: [], ...s });
  };
  return { steps, push };
}

/** marks for a row: later entries for the same index win */
export function marks(...groups: [readonly number[], CharMark][]): TextRow['marks'] {
  const byIndex = new Map<number, CharMark>();
  for (const [indices, mark] of groups) for (const i of indices) byIndex.set(i, mark);
  return [...byIndex].sort((a, b) => a[0] - b[0]).map(([index, mark]) => ({ index, mark }));
}

/** the indices from..to (inclusive), or none when to < from */
export const range = (from: number, to: number): number[] => (to < from ? [] : Array.from({ length: to - from + 1 }, (_, k) => from + k));
