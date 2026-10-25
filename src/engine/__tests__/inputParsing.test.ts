import { describe, it, expect } from 'vitest';
import {
  MAX_ARRAY_SIZE,
  MAX_LIST_SIZE,
  MAX_VALUE,
  MIN_VALUE,
  defaultListIndex,
  firstUnsortedIndex,
  lastListIndex,
  parseArrayInput,
  parseTargetInput,
  sortedCopy,
  validateAlgorithmInput,
  validateDraft,
  validateListDraft,
} from '../inputParsing';
import { getAllAlgorithms, visualKindOf } from '../AlgorithmRegistry';
import type { AlgorithmDefinition } from '../../types/algorithm';
import { def } from './testUtils';

const okArray = (text: string) => {
  const r = parseArrayInput(text);
  if (!r.ok) throw new Error(`expected ok for "${text}": ${r.message}`);
  return r.value;
};
const badArray = (text: string) => {
  const r = parseArrayInput(text);
  if (r.ok) throw new Error(`expected an error for "${text}" but got ${JSON.stringify(r.value)}`);
  return r.message;
};

describe('parseArrayInput', () => {
  it('parses comma-separated integers exactly as entered (order, duplicates, negatives preserved)', () => {
    expect(okArray('5, 1, 4, 2')).toEqual([5, 1, 4, 2]);
    expect(okArray('5,1,4,2')).toEqual([5, 1, 4, 2]);
    expect(okArray('  7 ,  -3 , 0 ,7 ')).toEqual([7, -3, 0, 7]);
    expect(okArray('2, 2, 1, 2')).toEqual([2, 2, 1, 2]);
    expect(okArray('[3, 2, 1]')).toEqual([3, 2, 1]);
    expect(okArray('42')).toEqual([42]);
    expect(okArray(`${MIN_VALUE}, ${MAX_VALUE}`)).toEqual([MIN_VALUE, MAX_VALUE]);
  });

  it('never reorders or deduplicates', () => {
    const text = '9, 3, 9, -1, 3, 0';
    expect(okArray(text)).toEqual([9, 3, 9, -1, 3, 0]);
  });

  it('blank input is the empty array', () => {
    expect(okArray('')).toEqual([]);
    expect(okArray('   ')).toEqual([]);
    expect(okArray('[]')).toEqual([]);
    expect(okArray('[  ]')).toEqual([]);
  });

  it('normalises "-0" to 0', () => {
    const v = okArray('-0, 0');
    expect(Object.is(v[0], 0)).toBe(true);
  });

  it('rejects malformed values with an understandable message naming the position', () => {
    expect(badArray('1, abc, 3')).toMatch(/Value 2 \("abc"\) is not a whole number/);
    expect(badArray('1,,3')).toMatch(/Value 2 is empty/);
    expect(badArray('1, 2,')).toMatch(/Value 3 is empty/);
    expect(badArray(',1')).toMatch(/Value 1 is empty/);
    expect(badArray('1.5, 2')).toMatch(/Value 1 \("1.5"\) is a decimal/);
    expect(badArray('1 2, 3')).toMatch(/Value 1 \("1 2"\) contains a space/);
    expect(badArray('1e3')).toMatch(/not a whole number/);
    expect(badArray('+5')).toMatch(/not a whole number/);
    expect(badArray('--5')).toMatch(/not a whole number/);
    expect(badArray('0x10')).toMatch(/not a whole number/);
    expect(badArray('NaN, Infinity')).toMatch(/Value 1 \("NaN"\)/);
    expect(badArray('1; 2; 3')).toMatch(/contains a space|not a whole number/);
  });

  it('enforces the value range (inclusive)', () => {
    expect(badArray(`${MAX_VALUE + 1}`)).toMatch(/out of range/);
    expect(badArray(`${MIN_VALUE - 1}`)).toMatch(/out of range/);
    expect(badArray('99999999999999999999999')).toMatch(/out of range/);
  });

  it('enforces the maximum size and reports the count', () => {
    const ok = Array.from({ length: MAX_ARRAY_SIZE }, (_, i) => i).join(',');
    expect(okArray(ok)).toHaveLength(MAX_ARRAY_SIZE);
    const tooMany = Array.from({ length: MAX_ARRAY_SIZE + 1 }, (_, i) => i).join(',');
    expect(badArray(tooMany)).toBe(`Too many values (${MAX_ARRAY_SIZE + 1}). The visualizer supports at most ${MAX_ARRAY_SIZE}.`);
    // huge input cannot crash or hang the parser
    const huge = Array.from({ length: 100000 }, () => '1').join(',');
    expect(badArray(huge)).toMatch(/Too many values \(100000\)/);
  });

  it('long garbage tokens are truncated in messages', () => {
    expect(badArray('x'.repeat(500))).toMatch(/"x{12}…"/);
  });
});

describe('parseTargetInput', () => {
  it('accepts zero, negative and positive integers', () => {
    expect(parseTargetInput('7')).toEqual({ ok: true, value: 7 });
    expect(parseTargetInput(' 0 ')).toEqual({ ok: true, value: 0 });
    expect(parseTargetInput('-4')).toEqual({ ok: true, value: -4 });
    expect(parseTargetInput('-0')).toEqual({ ok: true, value: 0 });
  });
  it('rejects blank, decimals, text and out-of-range', () => {
    for (const t of ['', '   ', '1.5', 'abc', '1,2', '1000', '-1000', 'NaN']) {
      expect(parseTargetInput(t, 'Target value').ok, `"${t}"`).toBe(false);
    }
    const blank = parseTargetInput('', 'Target sum');
    expect(blank.ok ? '' : blank.message).toBe('Enter a value for "Target sum".');
  });
});

describe('sortedness helpers', () => {
  it('firstUnsortedIndex / sortedCopy never mutate and treat duplicates as sorted', () => {
    expect(firstUnsortedIndex([])).toBe(-1);
    expect(firstUnsortedIndex([1])).toBe(-1);
    expect(firstUnsortedIndex([1, 2, 2, 3])).toBe(-1);
    expect(firstUnsortedIndex([1, 3, 2])).toBe(2);
    expect(firstUnsortedIndex([-1, -5])).toBe(1);
    const original = [5, 1, 4];
    const copy = sortedCopy(original);
    expect(copy).toEqual([1, 4, 5]);
    expect(original).toEqual([5, 1, 4]);
    expect(copy).not.toBe(original);
    expect(sortedCopy([10, -2, 3, -10, 0])).toEqual([-10, -2, 0, 3, 10]); // numeric, not lexicographic
  });
});

describe('algorithm input specs (declared on the real definitions)', () => {
  it('exactly Linear Search, Binary Search and Two Pointer take a target', () => {
    const withTarget = getAllAlgorithms().filter(d => d.inputSpec?.target).map(d => d.id).sort();
    expect(withTarget).toEqual(['binary-search', 'linear-search', 'two-pointer']);
  });
  it('exactly Binary Search and Two Pointer require sorted input; Linear Search and the sorts do not', () => {
    const sortedReq = getAllAlgorithms().filter(d => d.inputSpec?.sortedRequired).map(d => d.id).sort();
    expect(sortedReq).toEqual(['binary-search', 'two-pointer']);
  });
  it('every default input satisfies its own algorithm\'s requirements with its default target', () => {
    for (const d of getAllAlgorithms()) {
      const spec = d.inputSpec;
      const v = validateAlgorithmInput(d, d.defaultInput, (spec?.target ?? spec?.value)?.defaultValue ?? null, spec?.index?.defaultValue ?? null);
      expect(v.ok, d.id).toBe(true);
    }
  });
});

describe('validateAlgorithmInput', () => {
  it('Binary Search / Two Pointer: unsorted input is rejected with the offending indexes and a sort-a-copy option', () => {
    for (const id of ['binary-search', 'two-pointer']) {
      const v = validateAlgorithmInput(def(id), [5, 1, 4, 2], 4);
      expect(v.ok, id).toBe(false);
      if (!v.ok) {
        expect(v.canSortCopy).toBe(true);
        expect(v.message).toContain('index 0 (5) is greater than index 1 (1)');
        expect(v.message).toContain(def(id).name);
      }
    }
  });
  it('sorted, duplicate, negative, single and empty arrays are valid for Binary Search', () => {
    for (const a of [[1, 2, 3], [1, 1, 2, 2], [-5, -1, 0, 3], [7], []]) {
      expect(validateAlgorithmInput(def('binary-search'), a, 0).ok, JSON.stringify(a)).toBe(true);
    }
  });
  it('Linear Search and the sorts accept any order', () => {
    expect(validateAlgorithmInput(def('linear-search'), [9, 1, 8], 1).ok).toBe(true);
    for (const id of ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort', 'heap-sort']) {
      expect(validateAlgorithmInput(def(id), [9, 1, 8, 1, -4], null).ok, id).toBe(true);
      expect(validateAlgorithmInput(def(id), [], null).ok, id).toBe(true);
    }
  });
  it('a required target must be present', () => {
    for (const id of ['linear-search', 'binary-search', 'two-pointer']) {
      const v = validateAlgorithmInput(def(id), [1, 2, 3], null);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.message).toMatch(/Enter a value for/);
    }
    expect(validateAlgorithmInput(def('linear-search'), [1, 2, 3], 0).ok).toBe(true); // zero is a valid target
    expect(validateAlgorithmInput(def('linear-search'), [1, 2, 3], -7).ok).toBe(true);
  });
  it('rejects arrays above the maximum size', () => {
    const v = validateAlgorithmInput(def('bubble-sort'), Array(MAX_ARRAY_SIZE + 1).fill(1), null);
    expect(v.ok).toBe(false);
  });
});

describe('validateDraft (what the input panel shows)', () => {
  it('reports the failing field: array, target or order', () => {
    expect(validateDraft(def('linear-search'), '1, x', '3')).toMatchObject({ ok: false, field: 'array' });
    expect(validateDraft(def('linear-search'), '1, 2', '')).toMatchObject({ ok: false, field: 'target' });
    expect(validateDraft(def('linear-search'), '1, 2', '2.5')).toMatchObject({ ok: false, field: 'target' });
    expect(validateDraft(def('binary-search'), '3, 1', '1')).toMatchObject({ ok: false, field: 'order', canSortCopy: true, array: [3, 1], target: 1 });
  });
  it('returns the parsed values on success; sorting algorithms have no target', () => {
    expect(validateDraft(def('linear-search'), '4, 2, 9', '-2')).toEqual({ ok: true, array: [4, 2, 9], target: -2 });
    expect(validateDraft(def('quick-sort'), '3, 1, 2', 'ignored')).toEqual({ ok: true, array: [3, 1, 2], target: null });
    expect(validateDraft(def('quick-sort'), '', '')).toEqual({ ok: true, array: [], target: null });
  });
});

// Linked-list operations (Phase 1 foundations): no list operation is registered yet, so these use minimal stand-in
// definitions that declare the same input specs the real operations will.
describe('linked-list input validation (rejected before execution)', () => {
  type ListDef = Pick<AlgorithmDefinition, 'name' | 'inputSpec' | 'visual'>;
  const traverse: ListDef = { name: 'Traverse', visual: 'linked-list' };
  const insertHead: ListDef = { name: 'Insert at Head', visual: 'linked-list', inputSpec: { addsNode: true, value: { label: 'Value', hint: '', defaultValue: 5 } } };
  const insertAt: ListDef = {
    name: 'Insert at Index',
    visual: 'linked-list',
    inputSpec: { addsNode: true, value: { label: 'Value', hint: '', defaultValue: 5 }, index: { label: 'Index', hint: '', defaultValue: 1, bound: 'insert' } },
  };
  const deleteAt: ListDef = { name: 'Delete at Index', visual: 'linked-list', inputSpec: { index: { label: 'Index', hint: '', defaultValue: 0, bound: 'delete' } } };
  const list = (n: number) => Array.from({ length: n }, (_, k) => k + 1);

  it('lists hold at most 10 nodes; operations that add a node need room for it', () => {
    expect(MAX_LIST_SIZE).toBe(10);
    expect(validateAlgorithmInput(traverse, list(10), null).ok).toBe(true);
    expect(validateAlgorithmInput(traverse, list(11), null)).toEqual({ ok: false, canSortCopy: false, message: 'Too many nodes (11). The visualizer shows at most 10.' });
    expect(validateAlgorithmInput(insertHead, list(9), 5).ok).toBe(true);
    const full = validateAlgorithmInput(insertHead, list(10), 5);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.message).toBe('Too many nodes (10). Insert at Head adds one, and the visualizer shows at most 10, so start with at most 9.');
  });

  it('empty and single-node lists, duplicates and negatives are valid', () => {
    for (const a of [[], [7], [3, 3, 3], [-5, 0, -5]]) expect(validateAlgorithmInput(traverse, a, null).ok, JSON.stringify(a)).toBe(true);
  });

  it('a declared value is required; zero and negatives are values', () => {
    expect(validateAlgorithmInput(insertHead, [1], null)).toEqual({ ok: false, canSortCopy: false, message: 'Enter a value for "Value".' });
    expect(validateAlgorithmInput(insertHead, [1], 0).ok).toBe(true);
    expect(validateAlgorithmInput(insertHead, [1], -7).ok).toBe(true);
  });

  it('insert index: 0..length (length appends); anything else is rejected with the valid range', () => {
    for (const i of [0, 1, 3]) expect(validateAlgorithmInput(insertAt, [1, 2, 3], 9, i).ok, `index ${i}`).toBe(true);
    expect(validateAlgorithmInput(insertAt, [], 9, 0).ok).toBe(true); // inserting into an empty list
    for (const i of [-1, 4, 100]) {
      const r = validateAlgorithmInput(insertAt, [1, 2, 3], 9, i);
      expect(r).toEqual({ ok: false, canSortCopy: false, message: `Index ${i} is out of range. For a list of 3 nodes, insert at 0 to 3 (3 appends at the end).` });
    }
    expect(validateAlgorithmInput(insertAt, [1, 2, 3], 9, null)).toEqual({ ok: false, canSortCopy: false, message: 'Enter a value for "Index".' });
  });

  it('delete index: 0..length-1; an empty list has no index to delete', () => {
    for (const i of [0, 2]) expect(validateAlgorithmInput(deleteAt, [1, 2, 3], null, i).ok, `index ${i}`).toBe(true);
    for (const i of [-1, 3]) {
      expect(validateAlgorithmInput(deleteAt, [1, 2, 3], null, i)).toEqual({ ok: false, canSortCopy: false, message: `Index ${i} is out of range. For a list of 3 nodes, delete at 0 to 2.` });
    }
    expect(validateAlgorithmInput(deleteAt, [4], null, 1)).toEqual({ ok: false, canSortCopy: false, message: 'Index 1 is out of range. For a list of 1 node, delete at 0 to 0.' });
    expect(validateAlgorithmInput(deleteAt, [], null, 0)).toEqual({ ok: false, canSortCopy: false, message: 'The list is empty, so there is no node to delete at index 0.' });
  });

  it('array algorithms are unaffected: still 16 values, and the index argument is ignored', () => {
    expect(validateAlgorithmInput(def('bubble-sort'), list(16), null).ok).toBe(true);
    expect(validateAlgorithmInput(def('bubble-sort'), list(17), null).ok).toBe(false);
    expect(validateAlgorithmInput(def('bubble-sort'), list(11), null, -5).ok).toBe(true);
  });

  it('exactly the LINKED_LIST operations are drawn as linked lists and the FUNDAMENTALS as numbers; every other algorithm is still an array', () => {
    for (const d of getAllAlgorithms()) {
      expect(visualKindOf(d), d.id).toBe(d.category === 'LINKED_LIST' ? 'linked-list' : d.category === 'FUNDAMENTALS' ? 'numbers' : 'array');
    }
    expect(visualKindOf(undefined)).toBe('array');
    expect(visualKindOf(traverse)).toBe('linked-list');
  });
});

describe('list positions', () => {
  it('insert accepts 0..length, delete 0..length−1', () => {
    expect(lastListIndex('insert', 3)).toBe(3);
    expect(lastListIndex('delete', 3)).toBe(2);
    expect(lastListIndex('insert', 0)).toBe(0);
    expect(lastListIndex('delete', 0)).toBe(-1);
  });

  it('the default position moves into range for short lists; an empty list has nothing to delete', () => {
    const ins = { defaultValue: 2, bound: 'insert' as const };
    const del = { defaultValue: 2, bound: 'delete' as const };
    expect([0, 1, 2, 3, 9].map(n => defaultListIndex(ins, n))).toEqual([0, 1, 2, 2, 2]);
    expect([0, 1, 2, 3, 9].map(n => defaultListIndex(del, n))).toEqual([null, 0, 1, 2, 2]);
  });
});

describe('linked-list form drafts (the same rules as the store, with the field to mark)', () => {
  it('parses the list, the value and the position', () => {
    expect(validateListDraft(def('ll-insert-at'), '4, 7, 9', '5', '3')).toEqual({ ok: true, list: [4, 7, 9], value: 5, index: 3 });
    expect(validateListDraft(def('ll-traverse'), '', '', '')).toEqual({ ok: true, list: [], value: null, index: null });
    expect(validateListDraft(def('ll-search'), '[1, 2]', '-3', '')).toEqual({ ok: true, list: [1, 2], value: -3, index: null });
  });

  it('reports the field that is wrong', () => {
    expect(validateListDraft(def('ll-traverse'), '1, x', '', '')).toMatchObject({ ok: false, field: 'list' });
    expect(validateListDraft(def('ll-search'), '1, 2', '', '')).toEqual({ ok: false, field: 'value', message: 'Enter a value for "Target value".' });
    expect(validateListDraft(def('ll-insert-head'), '1', '2.5', '')).toMatchObject({ ok: false, field: 'value', message: expect.stringMatching(/decimal/) });
    expect(validateListDraft(def('ll-delete-at'), '1, 2', '', '')).toEqual({ ok: false, field: 'index', message: 'Enter a value for "Position".' });
    expect(validateListDraft(def('ll-delete-at'), '1, 2', '', '2')).toEqual({ ok: false, field: 'index', message: 'Index 2 is out of range. For a list of 2 nodes, delete at 0 to 1.' });
    expect(validateListDraft(def('ll-insert-at'), '', '1', '1')).toMatchObject({ ok: false, field: 'index' });
    expect(validateListDraft(def('ll-delete-at'), '', '', '0')).toEqual({ ok: false, field: 'list', message: 'The list is empty, so there is no node to delete at index 0.' });
  });

  it('the node limit is reported as such, even beyond the array limit', () => {
    const many = (n: number) => Array.from({ length: n }, (_, k) => k).join(', ');
    expect(validateListDraft(def('ll-traverse'), many(10), '', '').ok).toBe(true);
    expect(validateListDraft(def('ll-traverse'), many(11), '', '')).toEqual({ ok: false, field: 'list', message: 'Too many nodes (11). The visualizer shows at most 10.' });
    expect(validateListDraft(def('ll-traverse'), many(MAX_ARRAY_SIZE + 4), '', '')).toEqual({ ok: false, field: 'list', message: `Too many nodes (${MAX_ARRAY_SIZE + 4}). The visualizer shows at most 10.` });
    expect(validateListDraft(def('ll-insert-tail'), many(10), '1', '')).toEqual({
      ok: false,
      field: 'list',
      message: 'Too many nodes (10). Insert at Tail adds one, and the visualizer shows at most 10, so start with at most 9.',
    });
  });
});
