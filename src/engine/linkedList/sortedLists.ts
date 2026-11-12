/**
 * Several sorted linked lists given in LeetCode's format, e.g. "[[1, 4, 5], [1, 3, 4], [2, 6]]": an outer pair of
 * brackets holding one bracketed list per linked list. "[]" inside is an empty list; "[]" alone is no lists at all.
 *
 * Nothing is repaired or reordered: a list that is not in ascending order (equal neighbours are allowed) is reported
 * with the list and the positions that break the order, never sorted. Lists are named L0, L1, … and positions count
 * from 0, as the visualizer shows them.
 */

/** five rows of five nodes, a heap of three levels and a merged list of twelve nodes stay legible on a phone */
export const MAX_LISTS = 5;
export const MAX_LIST_NODES = 5;
export const MAX_TOTAL_NODES = 12;
const MIN_VALUE = -999;
const MAX_VALUE = 999;

export type SortedListsParse = { ok: true; lists: number[][] } | { ok: false; message: string };

const EXAMPLE = '[[1, 4, 5], [1, 3, 4], [2, 6]]';
const fail = (message: string): SortedListsParse => ({ ok: false, message });
const show = (token: string) => (token.length > 12 ? `${token.slice(0, 12)}…` : token);

/** the values of one list, from the text between its brackets */
function parseValues(body: string, name: string): { ok: true; values: number[] } | { ok: false; message: string } {
  if (body.trim() === '') return { ok: true, values: [] };
  const values: number[] = [];
  for (const [k, raw] of body.split(',').entries()) {
    const token = raw.trim();
    const what = `List ${name}, value ${k + 1}`;
    if (token === '') return { ok: false, message: `${what} is empty: separate values with single commas.` };
    if (!/^-?\d+$/.test(token)) {
      if (/^-?\d*\.\d+$/.test(token)) return { ok: false, message: `${what} ("${show(token)}") is a decimal: only whole numbers are supported.` };
      return { ok: false, message: `${what} ("${show(token)}") is not a whole number.` };
    }
    const value = Number(token);
    if (!Number.isSafeInteger(value) || value < MIN_VALUE || value > MAX_VALUE) {
      return { ok: false, message: `${what} (${show(token)}) is out of range: use values from ${MIN_VALUE} to ${MAX_VALUE}.` };
    }
    values.push(value === 0 ? 0 : value); // normalises "-0"
  }
  return { ok: true, values };
}

/** parses the lists and checks every limit and each list's order; every problem is reported in words, nothing is guessed */
export function parseSortedLists(text: string): SortedListsParse {
  const trimmed = text.trim();
  if (trimmed === '') return fail(`Enter the lists, e.g. ${EXAMPLE}.`);
  if (!trimmed.startsWith('[')) return fail(`The lists are missing their opening "[". Write them like ${EXAMPLE}.`);
  if (!trimmed.endsWith(']') || trimmed.length < 2) return fail(`The lists are missing their closing "]". Write them like ${EXAMPLE}.`);
  const inner = trimmed.slice(1, -1);

  const lists: number[][] = [];
  let pos = 0;
  const skipSpaces = () => {
    while (pos < inner.length && /\s/.test(inner[pos])) pos++;
  };
  skipSpaces();
  while (pos < inner.length) {
    const name = `L${lists.length}`;
    if (inner[pos] !== '[') {
      if (inner[pos] === ',') return fail(lists.length === 0 ? 'There is a comma before the first list: remove it.' : `There is an extra comma after list L${lists.length - 1}: remove it.`);
      if (inner[pos] === ']') return fail('There is a "]" without a matching "[": check the brackets.');
      return fail(`Each list needs its own brackets, e.g. ${EXAMPLE}; found "${show(inner.slice(pos).trim())}" where list ${name} should start.`);
    }
    const close = inner.indexOf(']', pos + 1);
    if (close === -1) return fail(`List ${name} is missing its closing "]".`);
    const body = inner.slice(pos + 1, close);
    if (body.includes('[')) return fail(`List ${name} contains another "[": lists cannot be nested, and each needs its own closing "]".`);
    const parsed = parseValues(body, name);
    if (!parsed.ok) return fail(parsed.message);
    lists.push(parsed.values);
    pos = close + 1;
    skipSpaces();
    if (pos >= inner.length) break;
    if (inner[pos] !== ',') {
      if (inner[pos] === ']') return fail('There is a "]" without a matching "[": check the brackets.');
      return fail(`Separate lists with a comma: found "${show(inner.slice(pos).trim())}" after list ${name}.`);
    }
    pos++;
    skipSpaces();
    if (pos >= inner.length) return fail(`There is an extra comma after list ${name}: remove it.`);
  }

  if (lists.length > MAX_LISTS) return fail(`Too many lists (${lists.length}). The visualizer supports at most ${MAX_LISTS}.`);
  for (const [i, list] of lists.entries()) {
    if (list.length > MAX_LIST_NODES) return fail(`List L${i} has ${list.length} nodes. The visualizer supports at most ${MAX_LIST_NODES} per list.`);
  }
  const total = lists.reduce((sum, list) => sum + list.length, 0);
  if (total > MAX_TOTAL_NODES) return fail(`Too many nodes (${total} in all the lists). The visualizer supports at most ${MAX_TOTAL_NODES}.`);
  for (const [i, list] of lists.entries()) {
    for (let k = 1; k < list.length; k++) {
      if (list[k - 1] > list[k]) {
        return fail(`List L${i} is not sorted: position ${k - 1} (${list[k - 1]}) is greater than position ${k} (${list[k]}). Every list must be in ascending order.`);
      }
    }
  }
  return { ok: true, lists };
}

/** the lists of text the app has already accepted; refuses anything else (a direct call with invalid text) */
export function sortedListsFromText(text: string): number[][] {
  const parsed = parseSortedLists(text);
  if (!parsed.ok) throw new RangeError(parsed.message);
  return parsed.lists;
}
