import { describe, it, expect } from 'vitest';
import { getAllAlgorithms, resolveCodeRef, getAlgorithmDefinition } from '../AlgorithmRegistry';
import { LANGUAGES, EDGE_INPUTS, randomArrays, codeLines, def as defById } from './testUtils';
import { LINE_ANCHORS, KNOWN_LINE_MAP_DEFECTS, KNOWN_RETURN_LINE_DEFECTS } from './lineAnchors';

const ALL = getAllAlgorithms();

/** A representative set of inputs (and search targets) used to collect every emitted step. */
function traces(d: (typeof ALL)[number]) {
  const inputs = [d.defaultInput, ...Object.values(EDGE_INPUTS), ...randomArrays(40)];
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

  it('every step of every trace carries a codeRef', () => {
    for (const d of ALL) {
      for (const steps of traces(d)) {
        for (const s of steps) expect(s.codeRef, `${d.id} step ${s.id} (${s.type})`).toBeTruthy();
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
