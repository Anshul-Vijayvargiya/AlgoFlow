/**
 * inputParsing — pure parsing and validation of user-entered arrays and targets.
 *
 * Nothing here runs an algorithm or changes what the user typed: values are parsed exactly as
 * entered, and algorithm requirements (e.g. "sorted ascending") are reported as validation errors —
 * never "fixed" silently. The only transformation offered anywhere is the explicit, user-triggered
 * `sortedCopy`, which the UI discloses.
 */
import type { AlgorithmDefinition, NumberField } from '../types/algorithm';

/** Keeps bars and pointer labels legible; far above anything the traces need to demonstrate. */
export const MAX_ARRAY_SIZE = 16;
/** Linked lists are drawn as node boxes with arrows; 10 nodes stay legible on a phone. */
export const MAX_LIST_SIZE = 10;
export const MIN_VALUE = -999;
export const MAX_VALUE = 999;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const WHOLE_NUMBER = /^-?\d+$/;
const DECIMAL = /^-?\d*\.\d+$/;

const show = (token: string) => (token.length > 12 ? `${token.slice(0, 12)}…` : token);

function parseWholeNumber(token: string, what: string, min = MIN_VALUE, max = MAX_VALUE): ParseResult<number> {
  if (!WHOLE_NUMBER.test(token)) {
    if (DECIMAL.test(token)) return { ok: false, message: `${what} ("${show(token)}") is a decimal — only whole numbers are supported.` };
    if (/\s/.test(token)) return { ok: false, message: `${what} ("${show(token)}") contains a space — separate values with commas.` };
    return { ok: false, message: `${what} ("${show(token)}") is not a whole number.` };
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return { ok: false, message: `${what} (${show(token)}) is out of range — use values from ${min} to ${max}.` };
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

/** one field of a number algorithm (n; a, b): a whole number within the field's own range */
export function parseNumberField(text: string, field: Pick<NumberField, 'label' | 'min' | 'max'>): ParseResult<number> {
  const token = text.trim();
  if (token === '') return { ok: false, message: `Enter a value for "${field.label}".` };
  return parseWholeNumber(token, `"${field.label}"`, field.min, field.max);
}

/** the values of a number algorithm: exactly one per declared field, each a whole number within its range */
function validateNumbers(def: Pick<AlgorithmDefinition, 'name' | 'inputSpec'>, values: number[]): InputValidation {
  const fields = def.inputSpec?.numbers ?? [];
  if (values.length !== fields.length) {
    return { ok: false, canSortCopy: false, message: `${def.name} takes ${fields.map(f => f.label).join(' and ')} (${fields.length} value${fields.length === 1 ? '' : 's'}).` };
  }
  for (let i = 0; i < fields.length; i++) {
    if (!Number.isInteger(values[i])) return { ok: false, canSortCopy: false, message: `Enter a whole number for "${fields[i].label}".` };
    const r = parseNumberField(String(values[i]), fields[i]);
    if (!r.ok) return { ok: false, canSortCopy: false, message: r.message };
  }
  return { ok: true };
}

export type NumberDraftValidation = { ok: true; values: number[] } | { ok: false; field: number; message: string };

/** what the user has typed into a number algorithm's fields, in order; the first invalid field is reported */
export function validateNumberDraft(def: Pick<AlgorithmDefinition, 'inputSpec'>, texts: readonly string[]): NumberDraftValidation {
  const fields = def.inputSpec?.numbers ?? [];
  const values: number[] = [];
  for (let i = 0; i < fields.length; i++) {
    const r = parseNumberField(texts[i] ?? '', fields[i]);
    if (!r.ok) return { ok: false, field: i, message: r.message };
    values.push(r.value);
  }
  return { ok: true, values };
}

/** Index i such that a[i-1] > a[i], or -1 when the array is non-decreasing. */
export function firstUnsortedIndex(array: number[]): number {
  for (let i = 1; i < array.length; i++) if (array[i - 1] > array[i]) return i;
  return -1;
}

/** The ONLY transformation the app offers; always a copy, always user-triggered and disclosed in the UI. */
export const sortedCopy = (array: number[]): number[] => [...array].sort((a, b) => a - b);

/** `field: 'array'` marks a problem with the values themselves (too few, too small), not with their order */
export type InputValidation = { ok: true } | { ok: false; message: string; canSortCopy: boolean; field?: 'array' };

const nodes = (n: number) => `${n} node${n === 1 ? '' : 's'}`;

/** The longest input an algorithm accepts: 16 array values, 10 list nodes, or 9 when the operation adds a node. */
export function maxInputLength(def: Pick<AlgorithmDefinition, 'inputSpec' | 'visual'>): number {
  if (def.visual !== 'linked-list') return MAX_ARRAY_SIZE;
  return def.inputSpec?.addsNode ? MAX_LIST_SIZE - 1 : MAX_LIST_SIZE;
}

/** The positions a list of `length` nodes accepts: insert at 0..length (length appends), delete at 0..length−1. */
export const lastListIndex = (bound: 'insert' | 'delete', length: number) => (bound === 'insert' ? length : length - 1);

/**
 * The position used when none was chosen: the declared default, moved into range for a list of `length` nodes (so a
 * default never makes a short list invalid). null when there is no valid position: deleting from an empty list.
 */
export function defaultListIndex(spec: { defaultValue: number; bound: 'insert' | 'delete' }, length: number): number | null {
  const last = lastListIndex(spec.bound, length);
  return last < 0 ? null : Math.min(spec.defaultValue, last);
}

function tooManyNodesMessage(def: Pick<AlgorithmDefinition, 'name' | 'inputSpec' | 'visual'>, count: number): string {
  const max = maxInputLength(def);
  return def.inputSpec?.addsNode
    ? `Too many nodes (${count}). ${def.name} adds one, and the visualizer shows at most ${MAX_LIST_SIZE}, so start with at most ${max}.`
    : `Too many nodes (${count}). The visualizer shows at most ${MAX_LIST_SIZE}.`;
}

/**
 * Checks the array/target (and, for linked-list operations, the value and index) against the algorithm's declared
 * input requirements. An invalid linked-list index is rejected here, before anything runs.
 */
export function validateAlgorithmInput(
  def: Pick<AlgorithmDefinition, 'name' | 'inputSpec' | 'visual'>,
  array: number[],
  target: number | null,
  index: number | null = null
): InputValidation {
  const spec = def.inputSpec;
  if (def.visual === 'numbers') return validateNumbers(def, array);
  if (def.visual === 'linked-list') {
    if (array.length > maxInputLength(def)) return { ok: false, canSortCopy: false, message: tooManyNodesMessage(def, array.length) };
  } else if (array.length > MAX_ARRAY_SIZE) {
    return { ok: false, canSortCopy: false, message: `Too many values (${array.length}). The visualizer supports at most ${MAX_ARRAY_SIZE}.` };
  }
  if (spec?.minLength !== undefined && array.length < spec.minLength) {
    return {
      ok: false,
      canSortCopy: false,
      field: 'array',
      message: `${def.name} needs at least ${spec.minLength} values; ${array.length === 0 ? 'the array is empty' : `got ${array.length}`}.`,
    };
  }
  if (spec?.minValue !== undefined) {
    const i = array.findIndex(v => v < spec.minValue!);
    if (i !== -1) {
      return {
        ok: false,
        canSortCopy: false,
        field: 'array',
        message: `Value ${i + 1} (${array[i]}) is below ${spec.minValue}: ${def.name} takes values from ${spec.minValue} to ${MAX_VALUE}.`,
      };
    }
  }
  if (spec?.target && (target === null || !Number.isInteger(target))) {
    return { ok: false, canSortCopy: false, message: `Enter a value for "${spec.target.label}".` };
  }
  // linked-list operations carry their value in the same field as a search target
  if (spec?.value && (target === null || !Number.isInteger(target))) {
    return { ok: false, canSortCopy: false, message: `Enter a value for "${spec.value.label}".` };
  }
  if (spec?.index) {
    if (index === null || !Number.isInteger(index)) {
      return { ok: false, canSortCopy: false, message: `Enter a value for "${spec.index.label}".` };
    }
    const last = lastListIndex(spec.index.bound, array.length);
    if (last < 0) {
      return { ok: false, canSortCopy: false, message: `The list is empty, so there is no node to delete at index ${index}.` };
    }
    if (index < 0 || index > last) {
      return {
        ok: false,
        canSortCopy: false,
        message:
          spec.index.bound === 'insert'
            ? `Index ${index} is out of range. For a list of ${nodes(array.length)}, insert at 0 to ${last} (${last} appends at the end).`
            : `Index ${index} is out of range. For a list of ${nodes(array.length)}, delete at 0 to ${last}.`,
      };
    }
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
  if (!v.ok) return { ok: false, field: v.field ?? 'order', message: v.message, canSortCopy: v.canSortCopy, array: a.value, target };
  return { ok: true, array: a.value, target };
}

export type ListDraftValidation =
  | { ok: true; list: number[]; value: number | null; index: number | null }
  | { ok: false; field: 'list' | 'value' | 'index'; message: string };

/**
 * Validates what the user has typed into the linked-list form (values, and the operation's value and position when
 * it takes them). The rules are validateAlgorithmInput's: this only parses the text and says which field is wrong.
 */
export function validateListDraft(
  def: Pick<AlgorithmDefinition, 'name' | 'inputSpec' | 'visual'>,
  listText: string,
  valueText: string,
  indexText: string
): ListDraftValidation {
  const spec = def.inputSpec;
  // counted before parsing, so a long list gets the node-limit message rather than the array one
  const body = listText.trim().replace(/^\[(.*)\]$/, '$1').trim();
  const count = body === '' ? 0 : body.split(',').length;
  if (count > maxInputLength(def)) return { ok: false, field: 'list', message: tooManyNodesMessage(def, count) };
  const a = parseArrayInput(listText);
  if (!a.ok) return { ok: false, field: 'list', message: a.message };
  let value: number | null = null;
  if (spec?.value) {
    const v = parseTargetInput(valueText, spec.value.label);
    if (!v.ok) return { ok: false, field: 'value', message: v.message };
    value = v.value;
  }
  let index: number | null = null;
  if (spec?.index) {
    const i = parseTargetInput(indexText, spec.index.label);
    if (!i.ok) return { ok: false, field: 'index', message: i.message };
    index = i.value;
  }
  const v = validateAlgorithmInput(def, a.value, value, index);
  // the remaining problems are the position (out of range, or nothing to delete in an empty list)
  if (!v.ok) return { ok: false, field: v.message.startsWith('The list is empty') ? 'list' : 'index', message: v.message };
  return { ok: true, list: a.value, value, index };
}
