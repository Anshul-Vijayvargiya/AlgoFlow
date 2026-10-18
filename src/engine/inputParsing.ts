/**
 * inputParsing — pure parsing and validation of user-entered arrays and targets.
 *
 * Nothing here runs an algorithm or changes what the user typed: values are parsed exactly as
 * entered, and algorithm requirements (e.g. "sorted ascending") are reported as validation errors —
 * never "fixed" silently. The only transformation offered anywhere is the explicit, user-triggered
 * `sortedCopy`, which the UI discloses.
 */
import type { AlgorithmDefinition } from '../types/algorithm';

/** Keeps bars and pointer labels legible; far above anything the traces need to demonstrate. */
export const MAX_ARRAY_SIZE = 16;
export const MIN_VALUE = -999;
export const MAX_VALUE = 999;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const WHOLE_NUMBER = /^-?\d+$/;
const DECIMAL = /^-?\d*\.\d+$/;

const show = (token: string) => (token.length > 12 ? `${token.slice(0, 12)}…` : token);

function parseWholeNumber(token: string, what: string): ParseResult<number> {
  if (!WHOLE_NUMBER.test(token)) {
    if (DECIMAL.test(token)) return { ok: false, message: `${what} ("${show(token)}") is a decimal — only whole numbers are supported.` };
    if (/\s/.test(token)) return { ok: false, message: `${what} ("${show(token)}") contains a space — separate values with commas.` };
    return { ok: false, message: `${what} ("${show(token)}") is not a whole number.` };
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value) || value < MIN_VALUE || value > MAX_VALUE) {
    return { ok: false, message: `${what} (${show(token)}) is out of range — use values from ${MIN_VALUE} to ${MAX_VALUE}.` };
  }
  return { ok: true, value: value === 0 ? 0 : value }; // normalises "-0"
}

/** "5, 1, 4, 2" or "[5, 1, 4, 2]" → [5, 1, 4, 2]. Blank input is the empty array. */
export function parseArrayInput(text: string): ParseResult<number[]> {
  let body = text.trim();
  if (body.startsWith('[') && body.endsWith(']')) body = body.slice(1, -1).trim();
  if (body === '') return { ok: true, value: [] };

  const tokens = body.split(',');
  if (tokens.length > MAX_ARRAY_SIZE) {
    return { ok: false, message: `Too many values (${tokens.length}). The visualizer supports at most ${MAX_ARRAY_SIZE}.` };
  }
  const values: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (token === '') {
      return { ok: false, message: `Value ${i + 1} is empty — remove the extra comma.` };
    }
    const r = parseWholeNumber(token, `Value ${i + 1}`);
    if (!r.ok) return r;
    values.push(r.value);
  }
  return { ok: true, value: values };
}

export function parseTargetInput(text: string, label = 'Target'): ParseResult<number> {
  const token = text.trim();
  if (token === '') return { ok: false, message: `Enter a value for "${label}".` };
  return parseWholeNumber(token, label);
}

/** Index i such that a[i-1] > a[i], or -1 when the array is non-decreasing. */
export function firstUnsortedIndex(array: number[]): number {
  for (let i = 1; i < array.length; i++) if (array[i - 1] > array[i]) return i;
  return -1;
}

/** The ONLY transformation the app offers; always a copy, always user-triggered and disclosed in the UI. */
export const sortedCopy = (array: number[]): number[] => [...array].sort((a, b) => a - b);

export type InputValidation = { ok: true } | { ok: false; message: string; canSortCopy: boolean };

/** Checks the array/target against the algorithm's declared input requirements. */
export function validateAlgorithmInput(
  def: Pick<AlgorithmDefinition, 'name' | 'inputSpec'>,
  array: number[],
  target: number | null
): InputValidation {
  if (array.length > MAX_ARRAY_SIZE) {
    return { ok: false, canSortCopy: false, message: `Too many values (${array.length}). The visualizer supports at most ${MAX_ARRAY_SIZE}.` };
  }
  const spec = def.inputSpec;
  if (spec?.target && (target === null || !Number.isInteger(target))) {
    return { ok: false, canSortCopy: false, message: `Enter a value for "${spec.target.label}".` };
  }
  if (spec?.sortedRequired) {
    const i = firstUnsortedIndex(array);
    if (i !== -1) {
      return {
        ok: false,
        canSortCopy: true,
        message: `${def.name} needs an array sorted in ascending order, but index ${i - 1} (${array[i - 1]}) is greater than index ${i} (${array[i]}).`,
      };
    }
  }
  return { ok: true };
}

export type DraftValidation =
  | { ok: true; array: number[]; target: number | null }
  | { ok: false; field: 'array' | 'target' | 'order'; message: string; canSortCopy: boolean; array?: number[]; target?: number | null };

/** Validates what the user has typed (array text + optional target text) for the given algorithm. */
export function validateDraft(
  def: Pick<AlgorithmDefinition, 'name' | 'inputSpec'>,
  arrayText: string,
  targetText: string
): DraftValidation {
  const a = parseArrayInput(arrayText);
  if (!a.ok) return { ok: false, field: 'array', message: a.message, canSortCopy: false };
  let target: number | null = null;
  if (def.inputSpec?.target) {
    const t = parseTargetInput(targetText, def.inputSpec.target.label);
    if (!t.ok) return { ok: false, field: 'target', message: t.message, canSortCopy: false, array: a.value };
    target = t.value;
  }
  const v = validateAlgorithmInput(def, a.value, target);
  if (!v.ok) return { ok: false, field: 'order', message: v.message, canSortCopy: v.canSortCopy, array: a.value, target };
  return { ok: true, array: a.value, target };
}
