import { describe, it, expect } from 'vitest';
import * as Registry from '../AlgorithmRegistry';
import { getAllAlgorithms, resolveCodeRef, getAlgorithmDefinition } from '../AlgorithmRegistry';
import { LANGUAGES, EDGE_INPUTS, randomArrays, codeLines, def as defById, inputsWithNumbers, TEXT_INPUTS } from './testUtils';
import { LINE_ANCHORS, KNOWN_LINE_MAP_DEFECTS, KNOWN_RETURN_LINE_DEFECTS } from './lineAnchors';

const ALL = getAllAlgorithms();

/** A representative set of inputs (and search targets) used to collect every emitted step. */
function traces(d: (typeof ALL)[number]) {
  // a text algorithm: every representative input (its strings), not arrays
  if (TEXT_INPUTS[d.id]) return TEXT_INPUTS[d.id].map(texts => d.generateSteps([], { texts }));
  const inputs = inputsWithNumbers(d, [d.defaultInput, ...Object.values(EDGE_INPUTS), ...randomArrays(40)]);
  return inputs.flatMap(inp => {
    const out = [d.generateSteps([...inp])];
    if (['linear-search', 'binary-search', 'two-pointer'].includes(d.id)) {
      const targets = [...inp, -1, 999, inp.length ? inp[0] + inp[inp.length - 1] : 0];
      for (const t of targets) out.push(d.generateSteps([...inp], { target: t }));
    }
    return out;
  });
}

describe('registry line maps — structure (real definitions)', () => {
  it('registers every algorithm with all four code listings and line maps', () => {
    expect(ALL.length).toBeGreaterThan(0);
    for (const d of ALL) {
      for (const lang of LANGUAGES) {
        expect(d.code[lang]?.trim().length, `${d.id}/${lang} code`).toBeGreaterThan(0);
        expect(Object.keys(d.lineMap[lang] ?? {}).length, `${d.id}/${lang} lineMap`).toBeGreaterThan(0);
      }
    }
  });

  it('every lineMap line is an integer inside its own code listing', () => {
    for (const d of ALL) {
      for (const lang of LANGUAGES) {
        const n = codeLines(d, lang).length;
        for (const [ref, line] of Object.entries(d.lineMap[lang])) {
          expect(Number.isInteger(line), `${d.id}/${lang}/${ref}`).toBe(true);
          expect(line, `${d.id}/${lang}/${ref} is below 1`).toBeGreaterThanOrEqual(1);
          expect(line, `${d.id}/${lang}/${ref} exceeds ${n} lines`).toBeLessThanOrEqual(n);
        }
      }
    }
  });

  it('all four languages define exactly the same set of codeRefs', () => {
    for (const d of ALL) {
      const base = Object.keys(d.lineMap.cpp).sort();
      for (const lang of LANGUAGES) {
        expect(Object.keys(d.lineMap[lang]).sort(), `${d.id}/${lang}`).toEqual(base);
      }
    }
  });

  it('every codeRef emitted by any trace resolves to a line in every language', () => {
    for (const d of ALL) {
      const emitted = new Set<string>();
      for (const steps of traces(d)) for (const s of steps) if (s.codeRef) emitted.add(s.codeRef);
      expect(emitted.size, `${d.id} emitted no codeRefs`).toBeGreaterThan(0);
      for (const ref of emitted) {
        for (const lang of LANGUAGES) {
          expect(resolveCodeRef(d, lang, ref), `${d.id}/${lang}: unmapped codeRef "${ref}"`).not.toBeNull();
        }
      }
    }
  });

  // Audit L3-E: a "sorted" step only explains why a bar is now final; no statement runs, so it names no line.
  it('every step of every trace carries a codeRef, except explanation-only "sorted" steps, which carry none', () => {
    for (const d of ALL) {
      for (const steps of traces(d)) {
        for (const s of steps) {
          if (s.type === 'sorted') expect(s.codeRef, `${d.id} step ${s.id} (${s.type})`).toBeUndefined();
          else expect(s.codeRef, `${d.id} step ${s.id} (${s.type})`).toBeTruthy();
        }
      }
    }
  });

  it('each algorithm has an anchor for every codeRef, and no anchor for a missing one', () => {
    for (const d of ALL) {
      const anchors = LINE_ANCHORS[d.id];
      expect(anchors, `${d.id} has no anchors`).toBeDefined();
      expect(Object.keys(anchors).sort(), d.id).toEqual(Object.keys(d.lineMap.cpp).sort());
    }
  });
});

describe('registry line maps — semantics (mapped line text vs intended operation)', () => {
  function mismatches(): Map<string, string> {
    const bad = new Map<string, string>();
    for (const d of ALL) {
      for (const lang of LANGUAGES) {
        const lines = codeLines(d, lang);
        for (const [ref, anchor] of Object.entries(LINE_ANCHORS[d.id])) {
          const line = d.lineMap[lang][ref];
          const text = lines[line - 1] ?? '';
          const key = `${d.id}|${lang}|${ref}`;
          if (text.trim() === '') bad.set(key, `line ${line} is blank`);
          else if (/^[{}\];)\s]+$/.test(text)) bad.set(key, `line ${line} is only a brace: "${text.trim()}"`);
          else if (!anchor.test(text)) bad.set(key, `line ${line} "${text.trim()}" does not match ${anchor}`);
        }
      }
    }
    return bad;
  }

  function returnLineViolations(): Set<string> {
    const bad = new Set<string>();
    for (const d of ALL) {
      const terminal = new Set<string>();
      for (const steps of traces(d)) {
        for (const s of steps) {
          if ((s.type === 'found' || s.type === 'not-found') && s.codeRef) terminal.add(s.codeRef);
        }
      }
      for (const ref of terminal) {
        for (const lang of LANGUAGES) {
          const text = codeLines(d, lang)[d.lineMap[lang][ref] - 1] ?? '';
          if (!/\breturn\b/.test(text)) bad.add(`${d.id}|${lang}|${ref}`);
        }
      }
    }
    return bad;
  }

  it('no mapping points at a blank, brace-only or unrelated line (except documented defects)', () => {
    const unexpected = [...mismatches()].filter(([k]) => !(k in KNOWN_LINE_MAP_DEFECTS));
    expect(unexpected.map(([k, why]) => `${k}: ${why}`)).toEqual([]);
  });

  it('documented line-map defects are still real (remove an entry once it is fixed)', () => {
    const bad = mismatches();
    expect(Object.keys(KNOWN_LINE_MAP_DEFECTS).filter(k => !bad.has(k))).toEqual([]);
  });

  it('found / not-found steps highlight a line that returns (except documented defects)', () => {
    const bad = returnLineViolations();
    expect([...bad].filter(k => !(k in KNOWN_RETURN_LINE_DEFECTS))).toEqual([]);
    expect(Object.keys(KNOWN_RETURN_LINE_DEFECTS).filter(k => !bad.has(k))).toEqual([]);
  });

  it('Bubble Sort has no documented defects: every ref matches its anchor in all four languages', () => {
    const keys = [...mismatches().keys(), ...returnLineViolations()].filter(k => k.startsWith('bubble-sort|'));
    expect(keys).toEqual([]);
  });
});

describe('resolveCodeRef — unknown references are never silently mapped to line 1', () => {
  const bubble = defById('bubble-sort');

  it('returns the mapped line for a known codeRef', () => {
    expect(resolveCodeRef(bubble, 'cpp', 'do-swap')).toBe(bubble.lineMap.cpp['do-swap']);
    expect(resolveCodeRef(bubble, 'python', 'inner-loop')).toBe(bubble.lineMap.python['inner-loop']);
  });

  it('returns null for an unknown codeRef in every language', () => {
    for (const lang of LANGUAGES) expect(resolveCodeRef(bubble, lang, 'does-not-exist')).toBeNull();
  });

  it('returns null for a missing codeRef', () => {
    expect(resolveCodeRef(bubble, 'cpp', undefined)).toBeNull();
    expect(resolveCodeRef(bubble, 'cpp', '')).toBeNull();
  });

  it('a codeRef from one algorithm does not resolve in another algorithm that lacks it', () => {
    const linear = defById('linear-search');
    expect(resolveCodeRef(linear, 'cpp', 'do-swap')).toBeNull();
    expect(getAlgorithmDefinition('bubble-sort')).toBe(bubble);
  });
});

describe('Sprint 2 corrected mappings — the resolved line holds the intended statement', () => {
  const cases: [string, 'c' | 'cpp' | 'java' | 'python', string, string][] = [
    ['quick-sort', 'java', 'pick-pivot', 'int pivot = arr[high];'],
    ['quick-sort', 'java', 'compare-pivot', 'if (arr[j] <= pivot) {'],
    ['quick-sort', 'java', 'swap-smaller', 'int temp = arr[i];'],
    ['quick-sort', 'java', 'place-pivot', 'int temp = arr[i + 1];'],
    ['merge-sort', 'cpp', 'fn-entry', 'void mergeSort(vector<int>& arr, int l, int r) {'],
    ['merge-sort', 'cpp', 'split-range', 'int mid = l + (r - l) / 2;'],
    ['binary-search', 'python', 'return-index', 'return mid'],
    ['two-pointer', 'c', 'return-pair', 'return true;'],
  ];
  for (const [algo, lang, ref, expected] of cases) {
    it(`${algo} / ${lang} / ${ref} → "${expected}"`, () => {
      const d = defById(algo);
      const line = resolveCodeRef(d, lang, ref);
      expect(line).not.toBeNull();
      expect(codeLines(d, lang)[line! - 1].trim()).toBe(expected);
    });
  }

  it('Binary Search "found" steps use return-index in every language and land on a return', () => {
    const d = defById('binary-search');
    const found = d.generateSteps([1, 3, 5, 7], { target: 5 }).find(s => s.type === 'found')!;
    expect(found.codeRef).toBe('return-index');
    for (const lang of LANGUAGES) {
      expect(codeLines(d, lang)[resolveCodeRef(d, lang, found.codeRef)! - 1]).toMatch(/return mid/);
    }
  });

  it('no known line-map defects remain tracked', () => {
    expect(Object.keys(KNOWN_LINE_MAP_DEFECTS)).toEqual([]);
    expect(Object.keys(KNOWN_RETURN_LINE_DEFECTS)).toEqual([]);
  });
});

// Audit L3-A: the statement that sets the array length (C++/Java/Python) and Python's `return arr` execute but were
// never highlighted. The existing first (init) and last (complete) steps represent them; no step is added.
describe('array-length initialization and Python return are highlighted (audit L3-A)', () => {
  const SORTS = ['bubble-sort', 'selection-sort', 'insertion-sort'] as const;
  const lineOf = (id: (typeof SORTS)[number], lang: (typeof LANGUAGES)[number], step: { codeRef?: string }) =>
    codeLines(defById(id), lang)[resolveCodeRef(defById(id), lang, step.codeRef)! - 1].trim();

  // [first step's line, last step's line] per language
  const EXPECTED: Record<(typeof SORTS)[number], Record<(typeof LANGUAGES)[number], [string, string]>> = {
    'bubble-sort': {
      c: ['void bubbleSort(int arr[], int n) {', 'void bubbleSort(int arr[], int n) {'],
      cpp: ['int n = arr.size();', 'void bubbleSort(vector<int>& arr) {'],
      java: ['int n = arr.length;', 'public static void bubbleSort(int[] arr) {'],
      python: ['n = len(arr)', 'return arr'],
    },
    'selection-sort': {
      c: ['void selectionSort(int arr[], int n) {', 'void selectionSort(int arr[], int n) {'],
      cpp: ['int n = arr.size();', 'void selectionSort(vector<int>& arr) {'],
      java: ['int n = arr.length;', 'public static void selectionSort(int[] arr) {'],
      python: ['n = len(arr)', 'return arr'],
    },
    'insertion-sort': {
      c: ['void insertionSort(int arr[], int n) {', 'void insertionSort(int arr[], int n) {'],
      cpp: ['int n = arr.size();', 'void insertionSort(vector<int>& arr) {'],
      java: ['int n = arr.length;', 'public static void insertionSort(int[] arr) {'],
      // the Python listing never names n (it loops over range(1, len(arr))), so entry stays on the signature
      python: ['def insertion_sort(arr):', 'return arr'],
    },
  };

  for (const id of SORTS) {
    for (const lang of LANGUAGES) {
      it(`${id} / ${lang}: the first step highlights "${EXPECTED[id][lang][0]}", the last "${EXPECTED[id][lang][1]}"`, () => {
        for (const input of [defById(id).defaultInput, [], [7], [3, 3, 1, 2]]) {
          const steps = defById(id).generateSteps([...input]);
          expect(steps[0].type).toBe('init');
          expect(steps[steps.length - 1].type).toBe('complete');
          expect([lineOf(id, lang, steps[0]), lineOf(id, lang, steps[steps.length - 1])], JSON.stringify(input)).toEqual(EXPECTED[id][lang]);
        }
      });
    }
  }

  it('every array-length line and every Python `return arr` line of these listings is highlighted', () => {
    for (const id of SORTS) {
      for (const lang of LANGUAGES) {
        const highlighted = new Set<number>();
        for (const input of [defById(id).defaultInput, [], [2, 1]]) {
          for (const s of defById(id).generateSteps([...input])) highlighted.add(resolveCodeRef(defById(id), lang, s.codeRef)!);
        }
        codeLines(defById(id), lang).forEach((text, i) => {
          if (/^\s*(int )?n = (arr\.size\(\)|arr\.length|len\(arr\));?\s*$|^\s*return arr\s*$/.test(text)) {
            expect(highlighted.has(i + 1), `${id} ${lang} line ${i + 1} "${text.trim()}"`).toBe(true);
          }
        });
      }
    }
  });

  it('no step is added: step counts are unchanged (recorded before the change)', () => {
    const counts = (id: (typeof SORTS)[number]) => [defById(id).defaultInput, [3, 3, 1, 2], [], [7]].map(a => defById(id).generateSteps([...a]).length);
    expect(counts('bubble-sort')).toEqual([65, 43, 3, 3]);
    // Selection: 51, 33, 2, 2 at L3-A, plus max(n - 1, 0) + 1 outer-loop steps (each i++ and the exit check) since
    // the Selection Sort outer-loop fix (see selectionSort.test.ts)
    expect(counts('selection-sort')).toEqual([51 + 5, 33 + 4, 2 + 1, 2 + 1]);
    expect(counts('insertion-sort')).toEqual([41, 30, 3, 3]);
  });
});

// Audit L3-B: C and Java swap through a temporary in three statements; one swap step (already showing the finished
// swap) now highlights all three lines. C++ (`swap(...)`) and Python (tuple assignment) stay single-line.
describe('multi-line swaps highlight every statement of the swap (audit L3-B)', () => {
  // resolved through the module namespace so this suite fails with an assertion (not an import error) before the fix
  const range = (id: string, lang: (typeof LANGUAGES)[number], ref: string | undefined) => {
    const fn = (Registry as Record<string, unknown>).resolveCodeRange as
      | ((d: ReturnType<typeof defById>, l: string, r: string | undefined) => { start: number; end: number } | null)
      | undefined;
    expect(fn, 'resolveCodeRange is exported by the registry').toBeTypeOf('function');
    return fn!(defById(id as never), lang, ref);
  };
  const rangeText = (id: string, lang: (typeof LANGUAGES)[number], ref: string) => {
    const r = range(id, lang, ref)!;
    return codeLines(defById(id as never), lang).slice(r.start - 1, r.end).map(t => t.trim());
  };

  const SWAPS: [string, string, Record<'c' | 'java', string[]>, Record<'cpp' | 'python', string>][] = [
    ['bubble-sort', 'do-swap',
      { c: ['int temp = arr[j];', 'arr[j] = arr[j + 1];', 'arr[j + 1] = temp;'], java: ['int temp = arr[j];', 'arr[j] = arr[j + 1];', 'arr[j + 1] = temp;'] },
      { cpp: 'swap(arr[j], arr[j + 1]);', python: 'arr[j], arr[j + 1] = arr[j + 1], arr[j]' }],
    ['selection-sort', 'do-swap',
      { c: ['int temp = arr[i];', 'arr[i] = arr[minIdx];', 'arr[minIdx] = temp;'], java: ['int temp = arr[i];', 'arr[i] = arr[minIdx];', 'arr[minIdx] = temp;'] },
      { cpp: 'swap(arr[i], arr[minIdx]);', python: 'arr[i], arr[min_idx] = arr[min_idx], arr[i]' }],
    ['quick-sort', 'swap-smaller',
      { c: ['int temp = arr[i];', 'arr[i] = arr[j];', 'arr[j] = temp;'], java: ['int temp = arr[i];', 'arr[i] = arr[j];', 'arr[j] = temp;'] },
      { cpp: 'swap(arr[i], arr[j]);', python: 'arr[i], arr[j] = arr[j], arr[i]' }],
    ['quick-sort', 'place-pivot',
      { c: ['int temp = arr[i + 1];', 'arr[i + 1] = arr[high];', 'arr[high] = temp;'], java: ['int temp = arr[i + 1];', 'arr[i + 1] = arr[high];', 'arr[high] = temp;'] },
      { cpp: 'swap(arr[i + 1], arr[high]);', python: 'arr[i + 1], arr[high] = arr[high], arr[i + 1]' }],
    ['heap-sort', 'do-swap',
      { c: ['int temp = arr[i];', 'arr[i] = arr[largest];', 'arr[largest] = temp;'], java: ['int temp = arr[i];', 'arr[i] = arr[largest];', 'arr[largest] = temp;'] },
      { cpp: 'swap(arr[i], arr[largest]);', python: 'arr[i], arr[largest] = arr[largest], arr[i]' }],
    ['heap-sort', 'extract-swap',
      { c: ['int temp = arr[0];', 'arr[0] = arr[i];', 'arr[i] = temp;'], java: ['int temp = arr[0];', 'arr[0] = arr[i];', 'arr[i] = temp;'] },
      { cpp: 'swap(arr[0], arr[i]);', python: 'arr[0], arr[i] = arr[i], arr[0]' }],
  ];

  for (const [id, ref, multi, single] of SWAPS) {
    it(`${id} / ${ref}: C and Java highlight all three statements; C++ and Python one line`, () => {
      for (const lang of ['c', 'java'] as const) expect(rangeText(id, lang, ref), lang).toEqual(multi[lang]);
      for (const lang of ['cpp', 'python'] as const) expect(rangeText(id, lang, ref), lang).toEqual([single[lang]]);
      // the first line of the range is still what resolveCodeRef returns (existing callers are unchanged)
      for (const lang of LANGUAGES) expect(range(id, lang, ref)!.start, lang).toBe(resolveCodeRef(defById(id as never), lang, ref));
    });
  }

  it('every statement of a C/Java swap in these listings is highlighted by some step', () => {
    for (const id of ['bubble-sort', 'selection-sort', 'quick-sort', 'heap-sort']) {
      for (const lang of ['c', 'java'] as const) {
        const covered = new Set<number>();
        for (const input of [defById(id as never).defaultInput, [3, 1, 2], [2, 1]]) {
          for (const s of defById(id as never).generateSteps([...input])) {
            const r = range(id, lang, s.codeRef);
            if (r) for (let n = r.start; n <= r.end; n++) covered.add(n);
          }
        }
        codeLines(defById(id as never), lang).forEach((text, i) => {
          if (/^\s*(int temp = arr\[|arr\[[^\]]+\] = (arr\[[^\]]+\]|temp);\s*$)/.test(text)) {
            expect(covered.has(i + 1), `${id} ${lang} line ${i + 1} "${text.trim()}"`).toBe(true);
          }
        });
      }
    }
  });

  it('ranges are well formed for every algorithm: inside the listing, no blank or brace-only line; unknown refs are null', () => {
    for (const d of ALL) {
      for (const lang of LANGUAGES) {
        const lines = codeLines(d, lang);
        for (const ref of Object.keys(d.lineMap[lang])) {
          const r = range(d.id, lang, ref)!;
          // the range contains the mapped line (lineLeads may start it earlier, lineSpans may end it later)
          expect(r.start, `${d.id}/${lang}/${ref}`).toBeGreaterThanOrEqual(1);
          expect(r.start, `${d.id}/${lang}/${ref}`).toBeLessThanOrEqual(d.lineMap[lang][ref]);
          expect(r.end, `${d.id}/${lang}/${ref}`).toBeGreaterThanOrEqual(d.lineMap[lang][ref]);
          expect(r.end, `${d.id}/${lang}/${ref}`).toBeLessThanOrEqual(lines.length);
          for (const t of lines.slice(r.start - 1, r.end)) expect(t, `${d.id}/${lang}/${ref}`).not.toMatch(/^[\s{}();\]]*$/);
        }
        expect(range(d.id, lang, 'bogus-ref')).toBeNull();
        expect(range(d.id, lang, undefined)).toBeNull();
      }
    }
  });
});

// Audit L3-E: Bubble and Selection Sort's outer `for` line was also highlighted by the "locked (sorted)" explanation
// step, although nothing runs there at that moment. Only the loop's own condition and i++ belong to that line.
describe('the outer for line is highlighted only by the loop itself (audit L3-E)', () => {
  const SORTS = ['bubble-sort', 'selection-sort'] as const;
  const INPUTS = [[8, 3, 5, 1, 6], [3, 1, 2], [3, 3, 1, 2], [2, 1], [], [7]];

  for (const id of SORTS) {
    it(`${id}: in every language, only loop-condition and increment steps highlight the outer for line`, () => {
      const d = defById(id);
      for (const lang of LANGUAGES) {
        const outer = d.lineMap[lang]['outer-loop'];
        expect(codeLines(d, lang)[outer - 1].trim(), lang).toMatch(/^for (\(int i = 0; i < n - 1; i\+\+\) \{|i in range\(n - 1\):)$/);
        for (const input of INPUTS) {
          for (const s of d.generateSteps([...input])) {
            const r = (Registry as Record<string, unknown>).resolveCodeRange as (x: typeof d, l: string, c?: string) => { start: number; end: number } | null;
            const range = r(d, lang, s.codeRef);
            if (range && range.start <= outer && outer <= range.end) {
              expect(['loop-condition', 'increment'], `${lang} ${JSON.stringify(input)} step ${s.id} ${s.type} "${s.message}"`).toContain(s.type);
            }
          }
        }
      }
    });

    it(`${id}: the "locked (sorted)" steps highlight no line in any language, with the same message as before`, () => {
      const d = defById(id);
      const steps = d.generateSteps([3, 1, 2]);
      const locked = steps.filter(s => s.type === 'sorted');
      expect(locked.map(s => s.message)).toEqual(['Element 3 locked at index 2 (sorted)', 'Element 2 locked at index 1 (sorted)'].map(m =>
        id === 'bubble-sort' ? m : m.replace('Element 3 locked at index 2', 'Element 1 locked at index 0').replace('Element 2 locked at index 1', 'Element 2 locked at index 1')));
      for (const s of locked) for (const lang of LANGUAGES) expect(resolveCodeRef(d, lang, s.codeRef), `${lang} step ${s.id}`).toBeNull();
    });
  }

  it('step counts are unchanged (recorded before the change)', () => {
    const counts = (id: (typeof SORTS)[number]) => INPUTS.slice(0, 5).map(a => defById(id).generateSteps([...a]).length);
    expect(counts('bubble-sort')).toEqual([65, 25, 43, 12, 3]);
    // Selection: 47, 22, 33, 11, 2 at L3-E, plus max(n - 1, 0) + 1 outer-loop steps since the outer-loop fix
    expect(counts('selection-sort')).toEqual([47 + 5, 22 + 3, 33 + 4, 11 + 2, 2 + 1]);
  });
});
