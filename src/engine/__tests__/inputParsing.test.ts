import { describe, it, expect } from 'vitest';
import {
  MAX_ARRAY_SIZE,
  MAX_VALUE,
  MIN_VALUE,
  firstUnsortedIndex,
  parseArrayInput,
  parseTargetInput,
  sortedCopy,
  validateAlgorithmInput,
  validateDraft,
} from '../inputParsing';
import { getAllAlgorithms } from '../AlgorithmRegistry';
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
      const v = validateAlgorithmInput(d, d.defaultInput, d.inputSpec?.target?.defaultValue ?? null);
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
