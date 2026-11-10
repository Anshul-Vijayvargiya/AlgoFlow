import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { IMPLEMENTED_TOPICS } from '../../data/algorithmCatalog';
import type { ExecutionStep, ProgrammingLanguage, StairsView } from '../../types/algorithm';

const ID = 'dp-climbing-stairs';
const def = getAlgorithmDefinition(ID)!;
const run = (n: number) => def.generateSteps([n]);
const view = (s: ExecutionStep): StairsView => s.stairs!;
const answer = (n: number) => view(run(n).at(-1)!).result!.value;
const LANGUAGES: ProgrammingLanguage[] = ['c', 'cpp', 'java', 'python'];

/** the reference, sharing nothing with the DP: count every sequence of 1s and 2s that adds up to n */
function countSequences(n: number): number {
  let count = 0;
  const walk = (left: number) => {
    if (left === 0) count++;
    if (left >= 1) walk(left - 1);
    if (left >= 2) walk(left - 2);
  };
  walk(n);
  return count;
}

describe('Climbing Stairs: where it is listed and how it is drawn', () => {
  it("a DP algorithm right after Pascal's Triangle II, before Fibonacci; not Coming Soon", () => {
    const dp = ALGORITHM_NAV.filter(a => a.category === 'DP').map(a => a.id);
    expect(dp.indexOf(ID)).toBe(dp.indexOf('dp-pascals-triangle-ii') + 1);
    expect(dp.indexOf('fibonacci')).toBe(dp.indexOf(ID) + 1);
    expect(ALGORITHM_NAV.find(a => a.id === ID)).toMatchObject({ name: 'Climbing Stairs', category: 'DP', implemented: true });
    expect(IMPLEMENTED_TOPICS.find(t => t.topic === 'Dynamic Programming')!.algorithmIds).toContain(ID);
    expect(getAllAlgorithms().filter(d => d.id === ID)).toHaveLength(1);
  });

  it('drawn as a staircase, taking n: 1 to 10, default 5; O(n) time and O(1) space', () => {
    expect(def).toMatchObject({ id: ID, category: 'DP', visual: 'stairs', defaultInput: [5] });
    expect(visualKindOf(def)).toBe('stairs');
    expect(def.inputSpec!.numbers).toEqual([{ label: 'n', hint: 'The number of steps: 1 to 10', min: 1, max: 10, random: [3, 8] }]);
    expect(def.complexity).toMatchObject({ best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' });
    expect(buildExecution(ID, [5]).status).toBe('ok');
  });
});

describe('Climbing Stairs: the answer', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [5, 8],
    [10, 89],
  ])('n = %i → %i', (n, ways) => {
    expect(answer(n)).toBe(ways);
    expect(run(n).at(-1)!.outcomeText).toBe(`Climbing a ${n}-step staircase has ${ways} distinct way${ways === 1 ? '' : 's'}.`);
  });

  it('every allowed n agrees with counting the sequences of 1s and 2s directly', () => {
    for (let n = 1; n <= 10; n++) expect(answer(n), `n = ${n}`).toBe(countSequences(n));
  });

  it('base cases: n = 1 and n = 2 return n without touching the loop or the variables', () => {
    for (const n of [1, 2]) {
      const steps = run(n);
      expect(steps.map(s => s.codeRef)).toEqual(['fn-entry', 'base-check', 'base-return']);
      expect(steps[1].result).toBe('true');
      expect(steps.every(s => view(s).prev1 === null && view(s).prev2 === null)).toBe(true);
      // the history shows only what the code established: ways(n) = n
      expect(view(steps.at(-1)!).history).toEqual([{ step: n, ways: n }]);
    }
  });
});

describe('Climbing Stairs: the recurrence and the two rolling variables', () => {
  it('each pass computes current = prev1 + prev2 from ways(i − 1) and ways(i − 2), then shifts both', () => {
    const steps = run(10);
    for (const [k, s] of steps.entries()) {
      const v = view(s);
      if (s.codeRef === 'compute-current') {
        const i = v.i!;
        expect(v.addition).toEqual({ prev1: countSequences(i - 1), prev2: countSequences(i - 2), current: countSequences(i) });
        expect(v.current).toBe(v.prev1! + v.prev2!);
        expect([v.prev1Of, v.prev2Of]).toEqual([i - 1, i - 2]);
      }
      if (s.codeRef === 'shift-prev2') {
        expect(v.prev2).toBe(view(steps[k - 1]).prev1);
        expect(v.prev2Of).toBe(v.i! - 1);
      }
      if (s.codeRef === 'shift-prev1') {
        expect(v.prev1).toBe(view(steps[k - 2]).current);
        expect(v.prev1Of).toBe(v.i);
      }
    }
  });

  it('O(1) auxiliary space: only prev2, prev1 and current, in every listing; no array', () => {
    for (const lang of LANGUAGES) {
      const code = def.code[lang];
      expect(code, lang).not.toMatch(/\[|vector|List|new int|malloc|dp\b/);
      expect(code.match(/prev2 = /g), lang).toHaveLength(2);
      expect(code.match(/prev1 = /g), lang).toHaveLength(2);
    }
  });

  it('the history is display only and grows one value per pass: ways(1), ways(2), then ways(3) … ways(n)', () => {
    const steps = run(6);
    expect(view(steps.find(s => s.codeRef === 'set-prev1')!).history).toEqual([
      { step: 1, ways: 1 },
      { step: 2, ways: 2 },
    ]);
    expect(view(steps.at(-1)!).history).toEqual([1, 2, 3, 4, 5, 6].map(k => ({ step: k, ways: countSequences(k) })));
    expect(def.description).toContain('O(1) space');
  });
});

describe('Climbing Stairs: the steps', () => {
  it('n = 4: the exact order of statements', () => {
    const pass = ['loop-condition', 'compute-current', 'shift-prev2', 'shift-prev1', 'loop-condition'];
    expect(run(4).map(s => s.codeRef)).toEqual(['fn-entry', 'base-check', 'set-prev2', 'set-prev1', ...pass, ...pass, 'loop-condition', 'loop-return']);
  });

  it('snapshots are immutable: a later step never changes an earlier one', () => {
    const steps = run(8);
    const before = JSON.stringify(steps.map(s => s.stairs));
    for (const s of steps) {
      expect(Object.isFrozen(view(s).history)).toBe(true);
      view(s).history.forEach(h => expect(Object.isFrozen(h)).toBe(true));
    }
    expect(JSON.stringify(steps.map(s => s.stairs))).toBe(before);
    expect(view(steps.find(s => s.codeRef === 'set-prev2')!).history).toHaveLength(1);
  });

  it('ids are contiguous, init first and complete last; the result is on the last step only; state is empty', () => {
    for (let n = 1; n <= 10; n++) {
      const steps = run(n);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
      expect(steps[0].type).toBe('init');
      expect(steps.at(-1)!.type).toBe('complete');
      expect(steps.filter(s => view(s).result)).toEqual([steps.at(-1)]);
      expect(steps.every(s => s.state.length === 0)).toBe(true);
    }
    // n = 10: entry, base check, prev2, prev1; 8 passes of 5 steps; the last loop check and the return
    expect(run(10)).toHaveLength(4 + 8 * 5 + 2);
  });

  it('every codeRef is reached, and every step highlights a line in every language', () => {
    const reached = new Set<string>();
    for (let n = 1; n <= 10; n++) {
      for (const s of run(n)) {
        reached.add(s.codeRef!);
        for (const lang of LANGUAGES) expect(resolveCodeRef(def, lang, s.codeRef), `${lang} ${s.codeRef}`).not.toBeNull();
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(def.lineMap.cpp).sort());
  });

  it('no message or explanation shows undefined or NaN', () => {
    for (let n = 1; n <= 10; n++) {
      for (const s of run(n)) expect(`${s.message} ${s.explanation ?? ''} ${s.actionLabel ?? ''} ${s.outcomeText ?? ''}`, `${n} step ${s.id}`).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('Climbing Stairs: the input', () => {
  it('1, 5 and 10 are accepted', () => {
    for (const n of ['1', '5', '10']) expect(validateNumberDraft(def, [n])).toEqual({ ok: true, values: [Number(n)] });
  });

  it.each([
    ['0', '"n" (0) is out of range — use values from 1 to 10.'],
    ['-2', '"n" (-2) is out of range — use values from 1 to 10.'],
    ['11', '"n" (11) is out of range — use values from 1 to 10.'],
    ['2.5', '"n" ("2.5") is a decimal — only whole numbers are supported.'],
    ['', 'Enter a value for "n".'],
    ['abc', '"n" ("abc") is not a whole number.'],
  ])('%j is refused: %s', (text, message) => {
    expect(validateNumberDraft(def, [text])).toEqual({ ok: false, field: 0, message });
  });

  it('the engine refuses what the form refuses', () => {
    for (const bad of [[0], [-1], [11], [2.5], [], [3, 4]]) {
      expect(validateAlgorithmInput(def, bad, null).ok, JSON.stringify(bad)).toBe(false);
      expect(() => def.generateSteps(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
});

describe('Climbing Stairs: the four listings', () => {
  const line = (lang: ProgrammingLanguage, ref: string) => def.code[lang].split('\n')[def.lineMap[lang][ref] - 1].trim();

  it('the same statements in the same order in every language', () => {
    const EXPECTED: Record<string, Record<ProgrammingLanguage, string>> = {
      'base-check': { c: 'if (n <= 2) return n;', cpp: 'if (n <= 2) return n;', java: 'if (n <= 2) return n;', python: 'if n <= 2:' },
      'base-return': { c: 'if (n <= 2) return n;', cpp: 'if (n <= 2) return n;', java: 'if (n <= 2) return n;', python: 'return n' },
      'set-prev2': { c: 'int prev2 = 1;', cpp: 'int prev2 = 1;', java: 'int prev2 = 1;', python: 'prev2 = 1' },
      'set-prev1': { c: 'int prev1 = 2;', cpp: 'int prev1 = 2;', java: 'int prev1 = 2;', python: 'prev1 = 2' },
      'loop-condition': { c: 'for (int i = 3; i <= n; i++) {', cpp: 'for (int i = 3; i <= n; i++) {', java: 'for (int i = 3; i <= n; i++) {', python: 'for i in range(3, n + 1):' },
      'compute-current': { c: 'int current = prev1 + prev2;', cpp: 'int current = prev1 + prev2;', java: 'int current = prev1 + prev2;', python: 'current = prev1 + prev2' },
      'shift-prev2': { c: 'prev2 = prev1;', cpp: 'prev2 = prev1;', java: 'prev2 = prev1;', python: 'prev2 = prev1' },
      'shift-prev1': { c: 'prev1 = current;', cpp: 'prev1 = current;', java: 'prev1 = current;', python: 'prev1 = current' },
      'loop-return': { c: 'return prev1;', cpp: 'return prev1;', java: 'return prev1;', python: 'return prev1' },
    };
    for (const [ref, byLang] of Object.entries(EXPECTED)) for (const lang of LANGUAGES) expect(line(lang, ref), `${lang} ${ref}`).toBe(byLang[lang]);
    for (const lang of LANGUAGES) {
      const order = ['fn-entry', 'base-check', 'set-prev2', 'set-prev1', 'loop-condition', 'compute-current', 'shift-prev2', 'shift-prev1', 'loop-return'].map(ref => def.lineMap[lang][ref]);
      expect(order, lang).toEqual([...order].sort((a, b) => a - b));
    }
  });
});
