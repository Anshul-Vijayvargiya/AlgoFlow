import { describe, it, expect } from 'vitest';
import type { ExecutionStep } from '../../types/algorithm';
import { LANGUAGES, randomArrays, codeLines, def, sortedCopy, expectCompareHighlightsAgree } from './testUtils';
import { LINE_ANCHORS } from './lineAnchors';
import { resolveCodeRange } from '../AlgorithmRegistry';

const merge = def('merge-sort');
const trace = (input: number[]) => merge.generateSteps([...input]);
const fmt = (a: number[]) => `[${a.join(', ')}]`;

const INPUTS: [string, number[]][] = [
  ['empty', []],
  ['single', [7]],
  ['two sorted', [1, 2]],
  ['two reversed', [2, 1]],
  ['sorted', [1, 2, 3, 4, 5]],
  ['reverse-sorted', [5, 4, 3, 2, 1]],
  ['duplicates', [2, 2, 1, 2]],
  ['all equal', [3, 3, 3]],
  ['regression case', [2, 3, 1, 0]],
  ['default input', [...merge.defaultInput]],
  ...randomArrays(60, 10, 5).map((a, i) => [`random #${i}`, a] as [string, number[]]),
];

/**
 * Walks the trace with an independent oracle of the displayed code (in-place merge sort
 * with temporary left/right buffers). Every executed statement must be the next step with
 * the right result, pointers, buffers, array contents and highlighted bars.
 */
function verifyAgainstOracle(input: number[]) {
  const steps = trace(input);
  const arr = [...input];
  let p = 0;
  const counts = { merges: 0, baseReturns: 0, compares: 0, splits: 0 };

  const take = (ref: string, type?: ExecutionStep['type']): ExecutionStep => {
    const s = steps[p++];
    expect(s, `trace ended early; expected ${ref}`).toBeDefined();
    expect(s.codeRef, `step ${s.id} (${s.message})`).toBe(ref);
    if (type) expect(s.type, `step ${s.id} ${ref}`).toBe(type);
    expect(s.state, `step ${s.id} ${ref} (${s.message}): array`).toEqual(arr);
    return s;
  };

  function doMerge(l: number, m: number, r: number) {
    counts.merges++;
    const call = take('call-merge', 'loop-start');
    expect(call.pointers).toEqual({ l, m, r });

    const left = arr.slice(l, m + 1);
    const right = arr.slice(m + 1, r + 1);
    const mkL = take('make-left', 'assign');
    expect(mkL.variables!.left).toBe(fmt(left));
    expect(mkL.indices).toEqual(Array.from({ length: m - l + 1 }, (_, t) => l + t));
    const mkR = take('make-right', 'assign');
    expect(mkR.variables!.left).toBe(fmt(left));
    expect(mkR.variables!.right).toBe(fmt(right));
    expect(mkR.indices).toEqual(Array.from({ length: r - m }, (_, t) => m + 1 + t));

    let i = 0;
    let j = 0;
    let k = l;
    // An index update (Python `i += 1` / `j += 1` / `k += 1`; the post-increments of `arr[k++] = L[i++]` elsewhere)
    // is its own step, after the variable has changed: variables, the k pointer and both buffer cursors agree.
    const advance = (ref: string) => {
      const s = take(ref, 'increment');
      expect(s.variables, `step ${s.id} ${ref}`).toMatchObject({ i, j, k });
      expect(s.pointers, `step ${s.id} ${ref}`).toEqual({ k });
      expect(s.buffers?.map(b => b.cursor), `step ${s.id} ${ref}`).toEqual([i, j]);
      expect(s.indices ?? [], `step ${s.id} ${ref}`).toEqual([]);
    };
    const init = take('init-merge', 'assign');
    expect(init.variables).toMatchObject({ i: 0, j: 0, k: l, left: fmt(left), right: fmt(right) });

    for (;;) {
      const go = i < left.length && j < right.length;
      const cond = take('merge-loop', 'loop-condition');
      expect(cond.result).toBe(go ? 'true' : 'false');
      expect(cond.variables).toMatchObject({ i, j, k });
      if (!go) break;

      const le = left[i] <= right[j];
      counts.compares++;
      const cmp = take('compare-halves', 'compare');
      expect(cmp.result).toBe(le ? 'true' : 'false');
      expect(cmp.comparedValues).toEqual({ val1: left[i], val2: right[j] });
      expect(cmp.message).toContain(`left[${i}]=${left[i]}`);
      expect(cmp.message).toContain(`right[${j}]=${right[j]}`);
      // The right element's bar is always intact; the left bar only until a right element was written.
      expect(cmp.indices).toEqual(j === 0 ? [l + i, m + 1 + j] : [m + 1 + j]);
      expectCompareHighlightsAgree(cmp, 'merge');

      if (le) {
        arr[k] = left[i];
        const c = take('copy-left', 'assign');
        expect(c.indices).toEqual([k]);
        expect(c.state[k]).toBe(left[i]);
        i++;
        advance('advance-i');
        k++;
        advance('advance-k-after-left');
      } else {
        arr[k] = right[j];
        const c = take('copy-right', 'assign');
        expect(c.indices).toEqual([k]);
        expect(c.state[k]).toBe(right[j]);
        j++;
        advance('advance-j');
        k++;
        advance('advance-k-after-right');
      }
    }

    for (;;) {
      const go = i < left.length;
      const cond = take('left-loop', 'loop-condition');
      expect(cond.result).toBe(go ? 'true' : 'false');
      expect(cond.variables).toMatchObject({ i, k });
      if (!go) break;
      arr[k] = left[i];
      const c = take('copy-remaining-left', 'assign');
      expect(c.indices).toEqual([k]);
      i++;
      advance('advance-i-rest');
      k++;
      advance('advance-k-left-rest');
    }
    for (;;) {
      const go = j < right.length;
      const cond = take('right-loop', 'loop-condition');
      expect(cond.result).toBe(go ? 'true' : 'false');
      expect(cond.variables).toMatchObject({ j, k });
      if (!go) break;
      arr[k] = right[j];
      const c = take('copy-remaining-right', 'assign');
      expect(c.indices).toEqual([k]);
      j++;
      advance('advance-j-rest');
      k++;
      advance('advance-k-right-rest');
    }
    expect(k, 'merge must fill exactly l..r').toBe(r + 1);
    expect(arr.slice(l, r + 1)).toEqual(sortedCopy(arr.slice(l, r + 1)));
  }

  function mergeSort(l: number, r: number) {
    const base = l >= r;
    const check = take('base-case', 'condition');
    expect(check.result).toBe(base ? 'true' : 'false');
    expect(check.pointers).toEqual({ l, r });
    if (base) {
      counts.baseReturns++;
      take('base-return', 'return');
      return;
    }
    counts.splits++;
    const mid = Math.floor(l + (r - l) / 2);
    const split = take('split-range', 'assign');
    expect(split.pointers).toEqual({ l, mid, r });
    expect(split.message).toContain(`[${l}..${mid}] and [${mid + 1}..${r}]`);

    const cl = take('call-left', 'loop-start');
    expect(cl.message).toContain(`${l}, ${mid}`);
    mergeSort(l, mid);
    const cr = take('call-right', 'loop-start');
    expect(cr.message).toContain(`${mid + 1}, ${r}`);
    mergeSort(mid + 1, r);
    doMerge(l, mid, r);
  }

  take('fn-entry', 'init');
  mergeSort(0, input.length - 1);
  const done = take('fn-entry', 'complete');
  expect(p, 'trace has extra steps after completion').toBe(steps.length);
  expect(done.state).toEqual(sortedCopy(input));
  return { steps, counts };
}

describe('Merge Sort trace — recursion, buffers and merge state', () => {
  for (const [name, input] of INPUTS) {
    it(`${name} ${JSON.stringify(input)}`, () => {
      verifyAgainstOracle(input);
    });
  }

  it('recursion shape: n leaves return, n-1 splits and n-1 merges (n >= 1)', () => {
    for (const [, input] of INPUTS.filter(([, a]) => a.length >= 1)) {
      const { counts } = verifyAgainstOracle(input);
      expect(counts.baseReturns).toBe(input.length);
      expect(counts.splits).toBe(input.length - 1);
      expect(counts.merges).toBe(input.length - 1);
    }
  });

  it('empty input has exactly one base case and no split or merge', () => {
    const { counts, steps } = verifyAgainstOracle([]);
    expect(counts).toMatchObject({ baseReturns: 1, splits: 0, merges: 0 });
    expect(steps.map(s => s.codeRef)).toEqual(['fn-entry', 'base-case', 'base-return', 'fn-entry']);
    expect(steps.flatMap(s => s.indices ?? [])).toEqual([]);
  });

  it('call stack is tracked and unwinds to empty at completion', () => {
    const steps = trace([4, 3, 2, 1]);
    expect(steps[0].variables!.stack).toBe('mergeSort(0,3)');
    const deepest = Math.max(...steps.map(s => String(s.variables!.stack).split(' › ').length));
    expect(deepest).toBe(3); // mergeSort(0,3) › mergeSort(0,1) › merge(0,0,1)
    for (const s of steps) {
      const inMerge = s.codeRef!.startsWith('advance-') || ['make-left', 'make-right', 'init-merge', 'merge-loop', 'compare-halves', 'copy-left', 'copy-right', 'left-loop', 'copy-remaining-left', 'right-loop', 'copy-remaining-right'].includes(s.codeRef!);
      expect(String(s.variables!.stack).includes('merge('), `${s.codeRef}`).toBe(inMerge);
    }
    expect(steps[steps.length - 1].variables!.stack).toBe('');
  });

  describe('regression: [2, 3, 1, 0] (audit P1-6, previously step 15)', () => {
    const steps = trace([2, 3, 1, 0]);
    const compares = steps.filter(s => s.type === 'compare');

    it('every compare step: highlighted bars hold compared values, message names the same values', () => {
      expect(compares.length).toBeGreaterThan(0);
      for (const s of compares) {
        expectCompareHighlightsAgree(s, '[2,3,1,0]');
        expect(s.message).toContain(`=${s.comparedValues!.val1} `);
        expect(s.message).toContain(`=${s.comparedValues!.val2} `);
        for (const idx of s.indices!) expect([s.comparedValues!.val1, s.comparedValues!.val2]).toContain(s.state[idx]);
      }
    });

    it('the case that used to mismatch (left value 2 vs right value 1, bars [0,3,0,1]) is now consistent', () => {
      const s = compares.find(c => c.comparedValues!.val1 === 2 && c.comparedValues!.val2 === 1)!;
      expect(s).toBeDefined();
      expect(s.state).toEqual([0, 3, 0, 1]);
      expect(s.message).toBe('left[0]=2 <= right[1]=1 → FALSE');
      // Bar 0 now holds 0 (overwritten), so it must NOT be highlighted as the "2". Only the right bar is.
      expect(s.indices).toEqual([3]);
      expect(s.state[3]).toBe(1);
      expect(s.explanation).toMatch(/only in the left buffer/);
      expect(s.variables).toMatchObject({ left: '[2, 3]', right: '[0, 1]', i: 0, j: 1, k: 1 });
    });
  });

  it('every step maps to a line whose text matches that operation in C, C++, Java and Python', () => {
    for (const [, input] of INPUTS.slice(0, 14)) {
      for (const s of trace(input)) {
        for (const lang of LANGUAGES) {
          const text = codeLines(merge, lang)[merge.lineMap[lang][s.codeRef!] - 1];
          expect(text, `${lang}/${s.codeRef}`).toMatch(LINE_ANCHORS['merge-sort'][s.codeRef!]);
        }
      }
    }
  });

  it('displayed listings are one algorithm: all four have merge, mergeSort, a base case and both buffers', () => {
    for (const lang of LANGUAGES) {
      const code = merge.code[lang];
      expect(code, lang).toMatch(/merge\b/);
      expect(code, lang).toMatch(/l >= r/);
      expect(code, lang).toMatch(/mid = l \+ \(r - l\) \/\/? 2/);
      expect(code, lang).toMatch(/(left|L)\b/);
      expect(code, lang).toMatch(/(right|R)\b/);
    }
    // Python is in-place (arr, l, r) like the others — not the functional slice-and-return variant.
    expect(merge.code.python).toMatch(/def merge_sort\(arr, l, r\)/);
    expect(merge.code.python).not.toMatch(/res\s*=|res\.append|return res/);
  });

  it('copy steps follow their loop condition line in every language (same text on two lines is disambiguated)', () => {
    for (const lang of LANGUAGES) {
      const m = merge.lineMap[lang];
      expect(m['copy-remaining-left'], lang).toBeGreaterThanOrEqual(m['left-loop']);
      expect(m['copy-remaining-right'], lang).toBeGreaterThanOrEqual(m['right-loop']);
      expect(m['left-loop'], lang).toBeGreaterThan(m['merge-loop']);
      expect(m['right-loop'], lang).toBeGreaterThan(m['left-loop']);
      expect(m['copy-right'], lang).toBeGreaterThanOrEqual(m['copy-left']);
    }
  });

  it('final array sorted for 200 random inputs', () => {
    for (const input of randomArrays(200, 10, 123)) {
      const steps = trace(input);
      expect(steps[steps.length - 1].state).toEqual(sortedCopy(input));
    }
  });
});

// Audit L1: Python writes the index updates on their own lines; C, C++ and Java fold them into `arr[k++] = L[i++]`.
describe('Merge Sort index updates are highlighted in every language (audit L1)', () => {
  const ADVANCE_REFS = [
    'advance-i',
    'advance-k-after-left',
    'advance-j',
    'advance-k-after-right',
    'advance-i-rest',
    'advance-k-left-rest',
    'advance-j-rest',
    'advance-k-right-rest',
  ];
  const lineText = (lang: (typeof LANGUAGES)[number], ref: string) => codeLines(merge, lang)[merge.lineMap[lang][ref] - 1].trim();

  it('Python: each index update highlights its own line', () => {
    const python = Object.fromEntries(ADVANCE_REFS.map(ref => [ref, `${merge.lineMap.python[ref]}: ${lineText('python', ref)}`]));
    expect(python).toEqual({
      'advance-i': '8: i += 1',
      'advance-k-after-left': '12: k += 1',
      'advance-j': '11: j += 1',
      'advance-k-after-right': '12: k += 1',
      'advance-i-rest': '15: i += 1',
      'advance-k-left-rest': '16: k += 1',
      'advance-j-rest': '19: j += 1',
      'advance-k-right-rest': '20: k += 1',
    });
  });

  it('Python: every `i += 1`, `j += 1` and `k += 1` line is highlighted when it executes', () => {
    const highlighted = new Set<number>();
    for (const [, input] of INPUTS) for (const s of trace(input)) highlighted.add(merge.lineMap.python[s.codeRef!]);
    codeLines(merge, 'python').forEach((text, i) => {
      if (/^\s*[ijk] \+= 1\s*$/.test(text)) expect(highlighted.has(i + 1), `python line ${i + 1} "${text.trim()}"`).toBe(true);
    });
  });

  it('Python: after a write, the highlight walks i/j += 1, then k += 1, then back to the loop condition', () => {
    const lines = trace([2, 1]).map(s => merge.lineMap.python[s.codeRef!]);
    // merge([2], [1]): compare (6) FALSE → arr[k] = right[j] (10) → j += 1 (11) → k += 1 (12) → while (5) FALSE
    // → while i < len(left) (13) TRUE → arr[k] = left[i] (14) → i += 1 (15) → k += 1 (16) → while (13) FALSE
    const from = lines.indexOf(6);
    expect(lines.slice(from, from + 10)).toEqual([6, 10, 11, 12, 5, 13, 14, 15, 16, 13]);
  });

  it('C, C++ and Java: index updates stay on the statement that performs them (the post-increments)', () => {
    for (const lang of ['c', 'cpp', 'java'] as const) {
      const m = merge.lineMap[lang];
      expect(m['advance-i'], lang).toBe(m['copy-left']);
      expect(m['advance-k-after-left'], lang).toBe(m['copy-left']);
      expect(m['advance-j'], lang).toBe(m['copy-right']);
      expect(m['advance-k-after-right'], lang).toBe(m['copy-right']);
      expect(m['advance-i-rest'], lang).toBe(m['copy-remaining-left']);
      expect(m['advance-k-left-rest'], lang).toBe(m['copy-remaining-left']);
      expect(m['advance-j-rest'], lang).toBe(m['copy-remaining-right']);
      expect(m['advance-k-right-rest'], lang).toBe(m['copy-remaining-right']);
      for (const ref of ADVANCE_REFS) expect(lineText(lang, ref), `${lang} ${ref}`).toMatch(/\b[ijk]\+\+/);
    }
  });

  it('apart from the new index-update steps, the trace is unchanged (step counts recorded before the change)', () => {
    const others = (input: number[]) => trace(input).filter(s => !ADVANCE_REFS.includes(s.codeRef!)).length;
    expect(others([9, 3, 7, 1, 5, 4, 8, 2])).toBe(160);
    expect(others([2, 3, 1, 0])).toBe(63);
    expect(others([5, 1, 4, 2, 3])).toBe(87);
    expect(others([])).toBe(4);
    // exactly two index updates per element written, and the final array is still sorted
    for (const [, input] of INPUTS) {
      const steps = trace(input);
      const writes = steps.filter(s => s.codeRef?.startsWith('copy-')).length;
      expect(steps.filter(s => ADVANCE_REFS.includes(s.codeRef!)).length, JSON.stringify(input)).toBe(2 * writes);
      expect(steps[steps.length - 1].state).toEqual(sortedCopy(input));
    }
  });
});

// Audit L3-C: the C listing sized and declared BOTH buffers on two shared lines that no step highlighted. Each buffer
// now has its own size / declare / copy statements, and its existing copy step highlights all three. No step is added.
describe('C Merge Sort buffer sizing and declarations are highlighted (audit L3-C)', () => {
  const rangeText = (lang: (typeof LANGUAGES)[number], ref: string) => {
    const r = resolveCodeRange(merge, lang, ref)!;
    return codeLines(merge, lang).slice(r.start - 1, r.end).map(t => t.trim());
  };

  it('C: make-left highlights n1, L and the copy into L; make-right the same for n2 and R', () => {
    expect(rangeText('c', 'make-left')).toEqual(['int n1 = m - l + 1;', 'int L[n1];', 'for (int i = 0; i < n1; i++) L[i] = arr[l + i];']);
    expect(rangeText('c', 'make-right')).toEqual(['int n2 = r - m;', 'int R[n2];', 'for (int j = 0; j < n2; j++) R[j] = arr[m + 1 + j];']);
  });

  it('C++, Java and Python buffer steps are unchanged: one statement each', () => {
    expect(rangeText('cpp', 'make-left')).toEqual(['vector<int> left(arr.begin() + l, arr.begin() + m + 1);']);
    expect(rangeText('cpp', 'make-right')).toEqual(['vector<int> right(arr.begin() + m + 1, arr.begin() + r + 1);']);
    expect(rangeText('java', 'make-left')).toEqual(['int[] left = Arrays.copyOfRange(arr, l, m + 1);']);
    expect(rangeText('java', 'make-right')).toEqual(['int[] right = Arrays.copyOfRange(arr, m + 1, r + 1);']);
    expect(rangeText('python', 'make-left')).toEqual(['left = arr[l:m + 1]']);
    expect(rangeText('python', 'make-right')).toEqual(['right = arr[m + 1:r + 1]']);
  });

  it('C: every statement of the listing except the merge() header is highlighted by some step', () => {
    const covered = new Set<number>();
    for (const [, input] of INPUTS) {
      for (const s of trace(input)) {
        const r = resolveCodeRange(merge, 'c', s.codeRef)!;
        for (let n = r.start; n <= r.end; n++) covered.add(n);
      }
    }
    const lines = codeLines(merge, 'c');
    lines.forEach((text, i) => {
      if (/^[\s{}]*$/.test(text) || /^\s*void merge\(/.test(text)) return;
      expect(covered.has(i + 1), `C line ${i + 1} "${text.trim()}"`).toBe(true);
    });
  });

  it('a buffer step never highlights the other buffer (no combined ranges)', () => {
    for (const lang of LANGUAGES) {
      expect(rangeText(lang, 'make-left').join('\n'), lang).not.toMatch(/\b(n2|R|right)\b/);
      expect(rangeText(lang, 'make-right').join('\n'), lang).not.toMatch(/\b(n1|L)\b|\bleft\b(?! *=)/);
    }
  });

  it('the trace is unchanged (step counts recorded before the change)', () => {
    expect([merge.defaultInput, [2, 3, 1, 0], [5, 1, 4, 2, 3], [], [7]].map(a => trace(a).length)).toEqual([208, 79, 111, 4, 4]);
  });
});
