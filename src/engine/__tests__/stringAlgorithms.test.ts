import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { validateAlgorithmInput, validateTextDraft } from '../inputParsing';
import { def, makeRng, TEXT_INPUTS, textAlgorithms } from './testUtils';
import { ROMAN_VALUES } from '../algorithms/strings/romanToInteger';

/**
 * The seven string algorithms (visual: 'text'), run for real: final answers against independent reference
 * implementations (LeetCode's examples, edge cases and random inputs), every intermediate value shown against what the
 * code computes at that step, and invalid input refused.
 */
const run = (id: string, ...texts: string[]) => def(id).generateSteps([], { texts });
const last = (steps: ExecutionStep[]) => steps[steps.length - 1];
const answer = (id: string, ...texts: string[]) => last(run(id, ...texts)).variables!;

// ─── independent references ─────────────────────────────────────────────────────────────────────────────────────
const ROMAN_PARTS: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n: number): string {
  let out = '';
  for (const [v, sym] of ROMAN_PARTS) while (n >= v) (out += sym), (n -= v);
  return out;
}
function lcpRef(words: string[]): string {
  let p = words[0];
  for (const w of words) while (!w.startsWith(p)) p = p.slice(0, -1);
  return p;
}
function validRef(s: string): boolean {
  let prev = '';
  while (s !== prev) (prev = s), (s = s.replace(/\(\)|\[\]|\{\}/g, ''));
  return s === '';
}
const palindromeRef = (s: string) => {
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === [...clean].reverse().join('');
};
const addBinaryRef = (a: string, b: string) => (BigInt(`0b${a}`) + BigInt(`0b${b}`)).toString(2);
const lastWordRef = (s: string) => s.trimEnd().split(' ').pop()!.length;

describe('LeetCode examples and edge cases', () => {
  it('#13 Roman to Integer', () => {
    expect(answer('roman-to-integer', 'III').total).toBe(3);
    expect(answer('roman-to-integer', 'LVIII').total).toBe(58);
    expect(answer('roman-to-integer', 'MCMXCIV').total).toBe(1994);
    expect(answer('roman-to-integer', 'I').total).toBe(1);
    expect(answer('roman-to-integer', 'MMMCMXCIX').total).toBe(3999);
  });

  it('#13 every numeral from 1 to 3999 (all subtractive pairs, all lengths)', () => {
    for (let n = 1; n <= 3999; n++) expect(answer('roman-to-integer', toRoman(n)).total, toRoman(n)).toBe(n);
  });

  it('#14 Longest Common Prefix', () => {
    expect(answer('longest-common-prefix', 'flower, flow, flight').prefix).toBe('fl');
    expect(answer('longest-common-prefix', 'dog, racecar, car').prefix).toBe('');
    expect(answer('longest-common-prefix', 'a').prefix).toBe('a');
    expect(answer('longest-common-prefix', '').prefix).toBe(''); // a single empty word
    expect(answer('longest-common-prefix', 'ab, a').prefix).toBe('a'); // a shorter later word ends the prefix
    expect(answer('longest-common-prefix', ', abc').prefix).toBe('');
    expect(answer('longest-common-prefix', 'abc, abc, abc').prefix).toBe('abc');
  });

  it('#20 Valid Parentheses', () => {
    for (const [s, valid] of [['()', true], ['()[]{}', true], ['(]', false], ['([])', true], ['([)]', false], ['(', false], [')', false], ['{[()()]}', true], ['((', false]] as const) {
      expect(answer('valid-parentheses', s).valid, s).toBe(valid);
    }
  });

  it('#28 Find the Index of the First Occurrence', () => {
    expect(answer('find-first-occurrence', 'sadbutsad', 'sad').index).toBe(0);
    expect(answer('find-first-occurrence', 'leetcode', 'leeto').index).toBe(-1);
    expect(answer('find-first-occurrence', 'hello', 'll').index).toBe(2);
    expect(answer('find-first-occurrence', 'mississippi', 'issip').index).toBe(4);
    expect(answer('find-first-occurrence', 'a', 'a').index).toBe(0);
    expect(answer('find-first-occurrence', 'a', 'ab').index).toBe(-1); // the needle is longer: no alignment at all
  });

  it('#58 Length of Last Word', () => {
    expect(answer('length-of-last-word', 'Hello World').length).toBe(5);
    expect(answer('length-of-last-word', '   fly me   to   the moon  ').length).toBe(4);
    expect(answer('length-of-last-word', 'luffy is still joyboy').length).toBe(6);
    expect(answer('length-of-last-word', 'a').length).toBe(1);
    expect(answer('length-of-last-word', ' a').length).toBe(1);
  });

  it('#67 Add Binary', () => {
    expect(answer('add-binary', '11', '1').result).toBe('100');
    expect(answer('add-binary', '1010', '1011').result).toBe('10101');
    expect(answer('add-binary', '0', '0').result).toBe('0');
    expect(answer('add-binary', '111111111111', '111111111111').result).toBe('1111111111110');
  });

  it('#125 Valid Palindrome', () => {
    expect(answer('valid-palindrome', 'A man, a plan, a canal: Panama').palindrome).toBe(true);
    expect(answer('valid-palindrome', 'race a car').palindrome).toBe(false);
    expect(answer('valid-palindrome', ' ').palindrome).toBe(true);
    expect(answer('valid-palindrome', '0P').palindrome).toBe(false); // a digit is not a letter, whatever the case
    expect(answer('valid-palindrome', '.,').palindrome).toBe(true);
  });
});

describe('random inputs agree with independent references', () => {
  const rng = makeRng(2026);
  const pick = (chars: string, min: number, max: number) => {
    const n = min + Math.floor(rng() * (max - min + 1));
    return Array.from({ length: n }, () => chars[Math.floor(rng() * chars.length)]).join('');
  };

  it('Longest Common Prefix, Valid Parentheses, strStr, Length of Last Word, Add Binary, Valid Palindrome', () => {
    for (let k = 0; k < 300; k++) {
      const words = Array.from({ length: 1 + Math.floor(rng() * 4) }, () => pick('ab', 0, 5));
      expect(answer('longest-common-prefix', words.join(', ')).prefix, words.join(',')).toBe(lcpRef(words));

      const brackets = pick('()[]{}', 1, 12);
      expect(answer('valid-parentheses', brackets).valid, brackets).toBe(validRef(brackets));

      const hay = pick('ab', 1, 12);
      const needle = pick('ab', 1, 4);
      expect(answer('find-first-occurrence', hay, needle).index, `${hay}/${needle}`).toBe(hay.indexOf(needle));

      const words2 = pick('a ', 1, 20);
      if (/[^ ]/.test(words2)) expect(answer('length-of-last-word', words2).length, JSON.stringify(words2)).toBe(lastWordRef(words2));

      const a = rng() < 0.1 ? '0' : '1' + pick('01', 0, 10);
      const b = '1' + pick('01', 0, 10);
      expect(answer('add-binary', a, b).result, `${a}+${b}`).toBe(addBinaryRef(a, b));

      const text = pick('aAb,. 1', 1, 14);
      expect(answer('valid-palindrome', text).palindrome, JSON.stringify(text)).toBe(palindromeRef(text));
    }
  });
});

describe('every step shows what the code computes at that step', () => {
  it('Roman to Integer: total changes only on add/subtract steps, by exactly the symbol’s value, with the right sign', () => {
    for (const [s] of TEXT_INPUTS['roman-to-integer']) {
      let total: number | null = null;
      for (const st of run('roman-to-integer', s)) {
        const shown = st.text!.cells!.find(c => c.name === 'total')!.value as number | null;
        if (st.codeRef === 'add' || st.codeRef === 'subtract') {
          const i = st.text!.rows[0].pointers![0].index;
          const v = ROMAN_VALUES[s[i]];
          const subtract = i + 1 < s.length && v < ROMAN_VALUES[s[i + 1]];
          expect(st.codeRef, `${s} @${i}`).toBe(subtract ? 'subtract' : 'add');
          expect(shown).toBe(total! + (subtract ? -v : v));
        } else if (total !== null) {
          expect(shown, `${s} step ${st.id}`).toBe(total);
        }
        total = shown;
      }
    }
  });

  it('Valid Parentheses: the stack shown is exactly the brackets still open, after every step', () => {
    for (const [s] of TEXT_INPUTS['valid-parentheses']) {
      const open: string[] = [];
      for (const st of run('valid-parentheses', s)) {
        const i = st.text!.rows[0].pointers?.[0]?.index;
        if (st.codeRef === 'push') open.push(s[i!]);
        if (st.codeRef === 'pop') open.pop();
        expect(st.text!.stack!.items, `${s} step ${st.id} (${st.codeRef})`).toEqual(open);
        if (st.codeRef === 'push') expect(st.text!.stack!.action).toBe('push');
        if (st.codeRef === 'pop') expect(st.text!.stack!.action).toBe('pop');
      }
    }
  });

  it('strStr: each comparison reads haystack[i + j] and needle[j], with the needle aligned at i', () => {
    for (const [h, n] of TEXT_INPUTS['find-first-occurrence']) {
      for (const st of run('find-first-occurrence', h, n)) {
        if (st.codeRef !== 'compare' || st.type !== 'compare') continue;
        const { i, j } = st.variables as { i: number; j: number };
        expect(st.variables!['haystack[i + j]']).toBe(h[i + j]);
        expect(st.variables!['needle[j]']).toBe(n[j]);
        expect(st.result).toBe(h[i + j] === n[j] ? 'true' : 'false');
        expect(st.text!.rows[1].offset).toBe(i);
        const markOf = (row: number, index: number) => st.text!.rows[row].marks!.find(m => m.index === index)?.mark;
        expect(markOf(0, i + j)).toBe(st.result === 'true' ? 'match' : 'mismatch');
        expect(markOf(1, j)).toBe(st.result === 'true' ? 'match' : 'mismatch');
      }
    }
  });

  it('Length of Last Word: only spaces are skipped, only letters are counted, and length counts them', () => {
    for (const [s] of TEXT_INPUTS['length-of-last-word']) {
      const steps = run('length-of-last-word', s);
      const end = last(steps).text!.rows[0].marks!;
      for (const m of end) {
        if (m.mark === 'skipped') expect(s[m.index]).toBe(' ');
        if (m.mark === 'match') expect(s[m.index]).not.toBe(' ');
      }
      expect(end.filter(m => m.mark === 'match')).toHaveLength(lastWordRef(s));
    }
  });

  it('Add Binary: after each column, result and carry hold exactly the sum of the digits read so far', () => {
    for (const [a, b] of TEXT_INPUTS['add-binary']) {
      let column = 0;
      for (const st of run('add-binary', a, b)) {
        if (st.codeRef !== 'set-carry') continue;
        column++;
        const carry = st.variables!.carry as number;
        const bits = st.text!.rows[2].text; // shown by place value
        const low = (s: string) => BigInt(`0b${s.slice(Math.max(0, s.length - column)) || '0'}`);
        expect(BigInt(`0b${bits}`) + (BigInt(carry) << BigInt(column)), `${a}+${b} column ${column}`).toBe(low(a) + low(b));
      }
      expect(last(run('add-binary', a, b)).variables!.result).toBe(addBinaryRef(a, b));
    }
  });

  it('Valid Palindrome: left only rises, right only falls, and only letters and digits are compared', () => {
    for (const [s] of TEXT_INPUTS['valid-palindrome']) {
      let left = -1;
      let right = s.length;
      for (const st of run('valid-palindrome', s)) {
        const p = Object.fromEntries((st.text!.rows[0].pointers ?? []).map(q => [q.name, q.index]));
        if (p.left !== undefined) {
          expect(p.left).toBeGreaterThanOrEqual(left);
          expect(p.right).toBeLessThanOrEqual(right);
          left = p.left;
          right = p.right;
        }
        if (st.codeRef === 'compare') {
          expect(s[p.left]).toMatch(/[A-Za-z0-9]/);
          expect(s[p.right]).toMatch(/[A-Za-z0-9]/);
        }
      }
    }
  });

  it('every text algorithm: rows, marks and pointers stay in range, cells are shown, and no text says undefined or NaN', () => {
    for (const d of textAlgorithms()) {
      for (const texts of TEXT_INPUTS[d.id]) {
        const steps = d.generateSteps([], { texts });
        expect(steps[0].type).toBe('init');
        expect(last(steps).type).toBe('complete');
        expect(last(steps).text!.result, d.id).toBeDefined();
        for (const st of steps) {
          const where = `${d.id} ${JSON.stringify(texts)} step ${st.id}`;
          expect(st.state, where).toEqual([]);
          expect(st.text, where).toBeDefined();
          expect(st.codeRef && d.lineMap.cpp[st.codeRef], `${where}: codeRef ${st.codeRef}`).toBeTruthy();
          for (const row of st.text!.rows) {
            for (const m of row.marks ?? []) expect(m.index >= 0 && m.index < row.text.length, `${where} ${row.name} mark ${m.index}`).toBe(true);
            for (const p of row.pointers ?? []) expect(p.index >= -1 && p.index <= row.text.length, `${where} ${row.name} ${p.name}=${p.index}`).toBe(true);
          }
          expect(`${st.message} ${st.explanation ?? ''} ${JSON.stringify(st.text)}`, where).not.toMatch(/undefined|NaN/);
          if (st.type !== 'complete') expect(st.text!.result, where).toBeUndefined();
        }
      }
    }
  });
});

describe('input validation', () => {
  const rejects = (id: string, ...texts: string[]) => {
    const v = validateAlgorithmInput(def(id), [], null, null, null, texts);
    expect(v.ok, `${id} ${JSON.stringify(texts)}`).toBe(false);
    expect(() => run(id, ...texts), `${id} ${JSON.stringify(texts)}`).toThrow(RangeError);
    return v.ok ? '' : v.message;
  };

  it('Roman to Integer: only canonical numerals from 1 to 3999', () => {
    expect(rejects('roman-to-integer', 'IIII')).toMatch(/not a valid Roman numeral/);
    expect(rejects('roman-to-integer', 'IM')).toMatch(/not a valid Roman numeral/);
    expect(rejects('roman-to-integer', 'MMMM')).toMatch(/not a valid Roman numeral/);
    expect(rejects('roman-to-integer', 'iv')).toMatch(/contains "i"/);
    expect(rejects('roman-to-integer', '')).toMatch(/Enter a value/);
  });

  it('Longest Common Prefix: 1 to 6 words of lowercase letters, 12 letters at most', () => {
    expect(rejects('longest-common-prefix', 'a, b, c, d, e, f, g')).toMatch(/1 to 6 words/);
    expect(rejects('longest-common-prefix', 'Flower, flow')).toMatch(/contains "F"/);
    expect(rejects('longest-common-prefix', 'abcdefghijklm')).toMatch(/too long/);
  });

  it('Valid Parentheses: brackets only, 1 to 20', () => {
    expect(rejects('valid-parentheses', '(a)')).toMatch(/contains "a"/);
    expect(rejects('valid-parentheses', '')).toMatch(/Enter a value/);
    expect(rejects('valid-parentheses', '()'.repeat(11))).toMatch(/too long/);
  });

  it('strStr: both strings of lowercase letters, neither empty', () => {
    expect(rejects('find-first-occurrence', 'Hello', 'll')).toMatch(/haystack.*contains "H"/);
    expect(rejects('find-first-occurrence', 'hello', '')).toMatch(/Enter a value for "needle"/);
  });

  it('Length of Last Word: letters and spaces, with at least one word', () => {
    expect(rejects('length-of-last-word', '   ')).toMatch(/at least one word/);
    expect(rejects('length-of-last-word', 'hi 2u')).toMatch(/contains "2"/);
  });

  it('Add Binary: 0s and 1s without leading zeros', () => {
    expect(rejects('add-binary', '0110', '1')).toMatch(/leading zero/);
    expect(rejects('add-binary', '1', '2')).toMatch(/"b" contains "2"/);
    expect(rejects('add-binary', '', '1')).toMatch(/Enter a value for "a"/);
  });

  it('Valid Palindrome: printable ASCII, 1 to 32 characters', () => {
    expect(rejects('valid-palindrome', '')).toMatch(/Enter a value/);
    expect(rejects('valid-palindrome', 'é')).toMatch(/printable ASCII/);
    expect(rejects('valid-palindrome', 'a'.repeat(33))).toMatch(/too long/);
  });

  it('spaces are kept exactly as typed; a list field trims its words', () => {
    expect(validateAlgorithmInput(def('length-of-last-word'), [], null, null, null, ['  a  ']).ok).toBe(true);
    expect(answer('length-of-last-word', '  ab  ').length).toBe(2);
    expect(answer('longest-common-prefix', '  flower ,flow  ').prefix).toBe('flow');
  });

  it('a text algorithm takes strings only: an array, a missing or an extra string is refused', () => {
    expect(validateAlgorithmInput(def('add-binary'), [1], null, null, null, ['1', '1']).ok).toBe(false);
    expect(validateAlgorithmInput(def('add-binary'), [], null, null, null, ['1']).ok).toBe(false);
    expect(validateAlgorithmInput(def('add-binary'), [], null, null, null, null).ok).toBe(false);
    expect(() => def('add-binary').generateSteps([], { texts: ['1'] })).toThrow(RangeError);
  });

  it('the draft check names the first invalid field', () => {
    expect(validateTextDraft(def('find-first-occurrence'), ['hello', 'L'])).toMatchObject({ ok: false, field: 1 });
    expect(validateTextDraft(def('find-first-occurrence'), ['hello', 'll'])).toEqual({ ok: true, texts: ['hello', 'll'] });
  });

  it('every default and every Randomize example is valid for its own algorithm', () => {
    for (const d of textAlgorithms()) {
      const spec = d.inputSpec!;
      expect(validateAlgorithmInput(d, [], null, null, null, spec.texts!.map(f => f.defaultValue)).ok, d.id).toBe(true);
      expect(spec.textExamples!.length, d.id).toBeGreaterThanOrEqual(3);
      for (const example of spec.textExamples!) expect(validateAlgorithmInput(d, [], null, null, null, [...example]).ok, `${d.id} ${example}`).toBe(true);
    }
  });
});

describe('#680 Valid Palindrome II', () => {
  const id = 'valid-palindrome-ii';
  /** brute force: the string itself, or any single deletion, reads the same both ways */
  const ref = (s: string) => {
    const pal = (t: string) => t === [...t].reverse().join('');
    if (pal(s)) return true;
    for (let k = 0; k < s.length; k++) if (pal(s.slice(0, k) + s.slice(k + 1))) return true;
    return false;
  };

  it("LeetCode's examples and edge cases", () => {
    for (const [s, ok] of [
      ['aba', true],
      ['abca', true],
      ['abc', false],
      ['racecar', true],
      ['a', true],
      ['ab', true], // either deletion leaves one character
      ['aa', true],
      ['cbbcc', true], // only the second deletion (the right character) works
      ['deeee', true],
      ['eeccccbebaeeabebccceea', false], // both candidates get far before failing
      ['ebcbbececabbacecbbcbe', true],
    ] as const) {
      expect(answer(id, s).result, s).toBe(ok);
    }
  });

  it('500 random strings agree with trying every single deletion', () => {
    const rng = makeRng(680);
    for (let k = 0; k < 500; k++) {
      const n = 1 + Math.floor(rng() * 12);
      // mostly near-palindromes (a palindrome with one or two changes), so every path is exercised
      const half = Array.from({ length: Math.ceil(n / 2) }, () => 'abc'[Math.floor(rng() * 3)]);
      const chars = [...half, ...half.slice(0, Math.floor(n / 2)).reverse()];
      for (let e = Math.floor(rng() * 3); e > 0; e--) chars.splice(Math.floor(rng() * (chars.length + 1)), 0, 'abc'[Math.floor(rng() * 3)]);
      const s = chars.join('').slice(0, 24);
      expect(answer(id, s).result, s).toBe(ref(s));
    }
  });

  it('the steps follow the code: the outer scan up to the first mismatch, then each candidate range, with || short-circuiting', () => {
    for (const [s] of TEXT_INPUTS[id]) {
      const steps = run(id, s);
      // the first mismatch, found independently
      let l = 0;
      let r = s.length - 1;
      while (l < r && s[l] === s[r]) (l++, r--);
      const mismatch = l < r;
      const calls = steps.filter(st => st.codeRef === 'try-skip-left' || st.codeRef === 'try-skip-right');
      if (!mismatch) {
        expect(calls, s).toHaveLength(0);
        expect(last(steps).codeRef).toBe('return-true');
        continue;
      }
      const isPal = (lo: number, hi: number) => s.slice(lo, hi + 1) === [...s.slice(lo, hi + 1)].reverse().join('');
      const first = isPal(l + 1, r);
      // calls: the first candidate, and the second only when the first failed; then the return on the same line
      expect(calls.filter(st => st.type !== 'complete').map(st => st.codeRef), s).toEqual(first ? ['try-skip-left'] : ['try-skip-left', 'try-skip-right']);
      expect(last(steps).codeRef).toBe(first ? 'try-skip-left' : 'try-skip-right');
      // every comparison reads the characters its pointers name: s[left]/s[right] outside, s[i]/s[j] inside a range
      for (const st of steps) {
        const v = st.variables as Record<string, unknown>;
        if (st.codeRef === 'compare') {
          expect(v['s[left]']).toBe(s[v.left as number]);
          expect(v['s[right]']).toBe(s[v.right as number]);
          expect(st.result).toBe(s[v.left as number] !== s[v.right as number] ? 'true' : 'false');
          expect((v.left as number) <= l).toBe(true);
        }
        if (st.codeRef === 'range-compare') {
          expect(v['s[i]']).toBe(s[v.i as number]);
          expect(v['s[j]']).toBe(s[v.j as number]);
          expect(st.result).toBe(s[v.i as number] !== s[v.j as number] ? 'true' : 'false');
        }
      }
      // each candidate row is the range it checks, aligned under s
      const end = last(steps).text!;
      const leftRow = end.rows.find(row => row.name === `without s[${l}]`)!;
      const rightRow = end.rows.find(row => row.name === `without s[${r}]`)!;
      expect([leftRow.text, leftRow.offset]).toEqual([s.slice(l + 1, r + 1), l + 1]);
      expect([rightRow.text, rightRow.offset]).toEqual([s.slice(l, r), l]);
      const cards = Object.fromEntries(end.cells!.map(c => [c.name, c.value]));
      expect(cards['delete left'], s).toBe(String(first));
      expect(cards['delete right'], s).toBe(first ? 'not needed' : String(isPal(l, r - 1)));
      // the first mismatch stays marked on s
      expect(end.rows[0].marks!.filter(m => m.mark === 'mismatch').map(m => m.index)).toEqual([l, r]);
    }
  });

  it('input: lowercase letters only, 1 to 24 of them', () => {
    const refuse = (s: string) => {
      const v = validateAlgorithmInput(def(id), [], null, null, null, [s]);
      expect(v.ok, s).toBe(false);
      expect(() => run(id, s)).toThrow(RangeError);
      return v.ok ? '' : v.message;
    };
    expect(refuse('')).toMatch(/Enter a value/);
    expect(refuse('Abca')).toMatch(/contains "A"/);
    expect(refuse('ab ca')).toMatch(/contains a space/);
    expect(refuse('a'.repeat(25))).toMatch(/too long/);
    expect(validateAlgorithmInput(def(id), [], null, null, null, ['a'.repeat(24)]).ok).toBe(true);
  });
});
