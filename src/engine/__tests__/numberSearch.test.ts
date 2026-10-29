import { describe, it, expect } from 'vitest';
import { validPerfectSquareDefinition as perfect } from '../algorithms/validPerfectSquare';
import { sqrtXDefinition as sqrt } from '../algorithms/sqrtX';
import { arrangingCoinsDefinition as coins } from '../algorithms/arrangingCoins';
import { INT_MAX, exactValue } from '../algorithms/numberSearch';
import { buildExecution } from '../buildExecution';
import { resolveCodeRef } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { LANGUAGES, codeLines } from './testUtils';
import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';

// Valid Perfect Square, Sqrt(x) and Arranging Coins: binary searches over 0 … input, checked against oracles written
// differently (bigint, and stepping k upward for small inputs), with exact products up to INT_MAX.
const last = (steps: ExecutionStep[]) => steps[steps.length - 1];
const mids = (steps: ExecutionStep[]) => steps.filter(s => s.codeRef === 'calc-mid').map(s => s.variables!.mid as number);
const probes = (steps: ExecutionStep[]) => last(steps).numbers!.search!.probes;

/** the largest k with f(k) ≤ v, by stepping k upward (small v only) */
const largestUpTo = (v: number, f: (k: number) => number) => {
  let k = 0;
  while (f(k + 1) <= v) k++;
  return k;
};
/** floor(√v) by bigint Newton iteration, independent of the generator's search */
const isqrt = (v: bigint) => {
  if (v < 2n) return v;
  let x = v;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + v / x) / 2n;
  }
  return x;
};

const BIG = [2147395599, 2147395600, 2147395601, 2147450880, 2147483646, INT_MAX];

describe('exact products beyond 2^53', () => {
  it('a bigint becomes a number while exact, else its decimal digits', () => {
    expect(exactValue(0n)).toBe(0);
    expect(exactValue(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(exactValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe('9007199254740992');
    expect(exactValue(1073741823n * 1073741823n)).toBe('1152921502459363329');
  });

  it('the first probe for INT_MAX squares 1073741823 exactly (a 61-bit value, no rounding)', () => {
    for (const d of [sqrt, perfect]) {
      const first = probes(d.generateSteps([INT_MAX]))[0];
      expect(first).toEqual({ mid: 1073741823, value: '1152921502459363329', relation: '>' });
    }
    expect(probes(coins.generateSteps([INT_MAX]))[0]).toEqual({ mid: 1073741823, value: '576460751766552576', relation: '>' });
  });

  it('every probe value is the exact product of its mid, as a number only when safe', () => {
    for (const v of BIG) {
      for (const [d, f] of [[sqrt, (m: bigint) => m * m], [perfect, (m: bigint) => m * m], [coins, (m: bigint) => (m * (m + 1n)) / 2n]] as const) {
        for (const p of probes(d.generateSteps([v]))) {
          const exact = f(BigInt(p.mid));
          expect(String(p.value), `${d.id} ${v} mid ${p.mid}`).toBe(exact.toString());
          expect(typeof p.value).toBe(exact <= BigInt(Number.MAX_SAFE_INTEGER) ? 'number' : 'string');
          expect(p.relation).toBe(exact < BigInt(v) ? '<' : exact > BigInt(v) ? '>' : '=');
        }
      }
    }
  });
});

describe('Sqrt(x)', () => {
  const run = (x: number) => sqrt.generateSteps([x]);
  const answer = (x: number) => last(run(x)).variables!.ans as number;

  it.each([[0, 0], [1, 1], [2, 1], [3, 1], [4, 2], [8, 2], [15, 3], [16, 4], [99, 9], [100, 10], [2147395599, 46339], [2147395600, 46340], [INT_MAX, 46340]])(
    'Sqrt(%i) = %i',
    (x, expected) => {
      const end = last(run(x));
      expect(end).toMatchObject({ type: 'complete', codeRef: 'return', variables: { x, ans: expected } });
      expect(end.numbers?.result?.kind).toBe('answer');
    }
  );

  it('agrees with an independent search for every x from 0 to 3,000, and with bigint √ at the top of the range', () => {
    for (let x = 0; x <= 3000; x++) expect(answer(x), `x = ${x}`).toBe(largestUpTo(x, k => k * k));
    for (const x of BIG) expect(answer(x), `x = ${x}`).toBe(Number(isqrt(BigInt(x))));
  });

  it('8: probes 4 (too large), 1 (fits), 2 (fits), then 3 (too large), and returns 2', () => {
    const steps = run(8);
    expect(probes(steps).map(p => `${p.mid}${p.relation}`)).toEqual(['4>', '1<', '2<', '3>']);
    expect(steps.filter(s => s.codeRef === 'update-ans').map(s => s.variables!.ans)).toEqual([1, 2]);
    expect(last(steps).numbers?.result?.text).toBe('Sqrt(8) = 2: 2² = 4 ≤ 8 < 3² = 9.');
    const exit = steps.filter(s => s.codeRef === 'loop-condition').at(-1)!;
    expect(exit).toMatchObject({ result: 'false', variables: { lo: 3, hi: 2 } });
  });

  it('0: one probe (mid 0 fits), then the range is empty', () => {
    expect(run(0).map(s => s.codeRef)).toEqual(['fn-entry', 'init', 'loop-condition', 'calc-mid', 'compare', 'update-ans', 'move-lo', 'loop-condition', 'return']);
    expect(last(run(0)).numbers?.result?.text).toBe('Sqrt(0) = 0: 0² = 0 ≤ 0 < 1² = 1.');
  });
});

describe('Valid Perfect Square', () => {
  const run = (n: number) => perfect.generateSteps([n]);
  const isPerfect = (n: number) => last(run(n)).codeRef === 'return-true';

  it.each([[0, true], [1, true], [2, false], [4, true], [14, false], [16, true], [25, true], [26, false], [808201, true], [2147395600, true], [2147395601, false], [INT_MAX, false]])(
    '%i → %s',
    (n, expected) => {
      const end = last(run(n));
      expect(end.type).toBe('complete');
      expect(end.codeRef).toBe(expected ? 'return-true' : 'return-false');
      expect(end.numbers?.result?.kind).toBe(expected ? 'yes' : 'no');
    }
  );

  it('agrees with an independent check for every num from 0 to 3,000, and with bigint √ at the top of the range', () => {
    for (let n = 0; n <= 3000; n++) {
      const k = largestUpTo(n, j => j * j);
      expect(isPerfect(n), `n = ${n}`).toBe(k * k === n);
    }
    for (const n of BIG) expect(isPerfect(n), `n = ${n}`).toBe(isqrt(BigInt(n)) ** 2n === BigInt(n));
  });

  it('16: probes 8 (larger), 3 (smaller), 5 (larger), then 4 (equal) and returns true', () => {
    const steps = run(16);
    expect(probes(steps).map(p => `${p.mid}${p.relation}`)).toEqual(['8>', '3<', '5>', '4=']);
    expect(last(steps)).toMatchObject({ codeRef: 'return-true', variables: { num: 16, root: 4 } });
    expect(last(steps).numbers?.result?.text).toBe('16 is a perfect square: 4 × 4 = 16.');
    // after the equality check, nothing else is compared
    expect(steps.slice(-3).map(s => s.codeRef)).toEqual(['calc-square', 'check-equal', 'return-true']);
  });

  it('14: the range closes between 3² and 4², and the result says so', () => {
    const steps = run(14);
    expect(last(steps).codeRef).toBe('return-false');
    expect(last(steps).numbers?.result?.text).toBe('14 is not a perfect square: 3² = 9 < 14 < 4² = 16.');
    expect(last(steps).numbers?.search).toMatchObject({ lo: 4, hi: 3 });
  });

  it('the largest values: 46340² is a perfect square; 2^31 - 1 is not (46340² < it < 46341²)', () => {
    expect(last(run(2147395600)).variables).toMatchObject({ root: 46340 });
    expect(last(run(INT_MAX)).numbers?.result?.text).toBe('2147483647 is not a perfect square: 46340² = 2147395600 < 2147483647 < 46341² = 2147488281.');
  });
});

describe('Arranging Coins', () => {
  const run = (n: number) => coins.generateSteps([n]);
  const answer = (n: number) => last(run(n)).variables!.ans as number;
  const tri = (k: number) => (k * (k + 1)) / 2;

  it.each([[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [8, 3], [10, 4], [1000, 44], [2147450880, 65535], [INT_MAX, 65535]])(
    '%i coins → %i rows',
    (n, expected) => {
      expect(last(run(n))).toMatchObject({ type: 'complete', codeRef: 'return', variables: { n, ans: expected } });
    }
  );

  it('agrees with an independent count for every n from 0 to 3,000, and with bigint at the top of the range', () => {
    for (let n = 0; n <= 3000; n++) expect(answer(n), `n = ${n}`).toBe(largestUpTo(n, tri));
    for (const n of BIG) {
      const k = BigInt(answer(n));
      expect((k * (k + 1n)) / 2n <= BigInt(n) && ((k + 1n) * (k + 2n)) / 2n > BigInt(n), `n = ${n}`).toBe(true);
    }
  });

  it('8: rows 1 + 2 + 3 = 6 fit, 4 rows would need 10; 2 coins left over', () => {
    const steps = run(8);
    expect(probes(steps).map(p => `${p.mid}:${p.value}${p.relation}`)).toEqual(['4:10>', '1:1<', '2:3<', '3:6<']);
    expect(last(steps).numbers?.result?.text).toBe('8 coins make 3 complete rows: 3 rows use 6; 4 would need 10.');
    expect(last(steps).explanation).toContain('2 coins left over');
  });

  it('a calc-coins step shows the formula with its numbers', () => {
    const step = run(8).find(s => s.codeRef === 'calc-coins')!;
    expect(step.message).toBe('coins = mid × (mid + 1) / 2 = 4 × 5 / 2 = 10');
    expect(step.numbers?.cells.find(c => c.name === 'coins')).toEqual({ name: 'coins', value: 10, role: 'changed' });
  });
});

describe.each([
  ['valid-perfect-square', perfect],
  ['sqrt-x', sqrt],
  ['arranging-coins', coins],
] as const)('%s — the search', (_id, d: AlgorithmDefinition) => {
  const inputs = [0, 1, 2, 7, 16, 100, 999, ...BIG];

  it('O(log n): at most ⌊log2(n + 1)⌋ + 1 probes, each on the middle of the remaining range', () => {
    for (const v of inputs) {
      const steps = d.generateSteps([v]);
      expect(mids(steps).length, `v = ${v}`).toBeLessThanOrEqual(Math.floor(Math.log2(v + 1)) + 1);
      for (const s of steps.filter(x => x.codeRef === 'calc-mid')) {
        const { lo, hi, mid } = s.variables as { lo: number; hi: number; mid: number };
        expect(mid).toBe(lo + Math.floor((hi - lo) / 2));
      }
    }
  });

  it('the range only shrinks, mid stays inside it, and the bar never shows a probe outside 0 … n', () => {
    for (const v of inputs) {
      let width = Infinity;
      for (const s of d.generateSteps([v])) {
        const view = s.numbers?.search;
        if (!view) continue;
        expect(view).toMatchObject({ from: 0, to: v, target: v });
        const w = view.hi - view.lo;
        expect(w, `v = ${v} step ${s.id}`).toBeLessThanOrEqual(width);
        width = w;
        // mid is inside the range, except right after a move, when the discarded mid sits just outside it
        if (view.mid !== undefined) {
          const expected = s.codeRef === 'move-lo' ? view.lo - 1 : s.codeRef === 'move-hi' ? view.hi + 1 : null;
          if (expected !== null) expect(view.mid, `v = ${v} step ${s.id}`).toBe(expected);
          else expect(view.mid >= view.lo && view.mid <= view.hi, `v = ${v} step ${s.id}`).toBe(true);
        }
        for (const p of view.probes) expect(p.mid >= 0 && p.mid <= v).toBe(true);
      }
    }
  });

  it('the first step shows only the input; every step keeps the state [input] and is numbered from 0', () => {
    const steps = d.generateSteps([25]);
    expect(steps[0].numbers?.search).toBeUndefined();
    expect(steps[0].numbers?.cells.filter(c => c.value !== null).map(c => c.value)).toEqual([25]);
    steps.forEach((s, i) => {
      expect(s.state).toEqual([25]);
      expect(s.id).toBe(i);
    });
  });

  it('every step is JSON-safe (exact strings, never bigint or a rounded number)', () => {
    const steps = d.generateSteps([INT_MAX]);
    expect(() => JSON.stringify(steps)).not.toThrow();
    expect(JSON.parse(JSON.stringify(steps))).toEqual(steps);
  });

  it('every step highlights a line of its own statement, in every language', () => {
    const refs = new Set([0, 1, 8, 14, 16].flatMap(v => d.generateSteps([v]).map(s => s.codeRef!)));
    expect([...refs].sort()).toEqual(Object.keys(d.lineMap.c).sort());
    for (const lang of LANGUAGES) {
      const lines = codeLines(d, lang);
      for (const ref of refs) {
        const line = resolveCodeRef(d, lang, ref);
        expect(line, `${lang} ${ref}`).not.toBeNull();
        expect(lines[line! - 1].trim(), `${lang} ${ref}`).not.toBe('');
      }
    }
  });

  it('no listing uses a square-root function, and each computes the product in 64 bits', () => {
    for (const lang of LANGUAGES) expect(d.code[lang], lang).not.toMatch(/\b(sqrtf?|sqrtl|isqrt)\s*\(|Math\.sqrt|\bmath\.|\*\*\s*0?\.5|\bpow\s*\(/);
    expect(d.code.c).toMatch(/long long mid/);
    expect(d.code.cpp).toMatch(/long long mid/);
    expect(d.code.java).toMatch(/long mid/);
  });

  it(`input: one whole number from 0 to ${INT_MAX}; anything else is explained, and refused by the generator`, () => {
    for (const v of [0, 1, INT_MAX]) expect(validateAlgorithmInput(d, [v], null).ok, String(v)).toBe(true);
    for (const v of [-1, INT_MAX + 1, 2.5]) expect(validateAlgorithmInput(d, [v], null).ok, String(v)).toBe(false);
    expect(validateAlgorithmInput(d, [], null)).toMatchObject({ ok: false, message: `${d.name} takes ${d.inputSpec!.numbers![0].label} (1 value).` });
    expect(validateAlgorithmInput(d, [4, 9], null).ok).toBe(false);
    const label = d.inputSpec!.numbers![0].label;
    expect(validateNumberDraft(d, [' 2147483647 '])).toEqual({ ok: true, values: [INT_MAX] });
    expect(validateNumberDraft(d, ['2147483648'])).toMatchObject({ ok: false, message: expect.stringContaining(`"${label}" (2147483648) is out of range`) });
    expect(validateNumberDraft(d, ['-1'])).toMatchObject({ ok: false });
    expect(validateNumberDraft(d, ['4.5'])).toMatchObject({ ok: false, message: expect.stringContaining('is a decimal') });
    for (const input of [[], [1, 2], [-1], [INT_MAX + 1], [3.5]]) expect(() => d.generateSteps(input), JSON.stringify(input)).toThrow(RangeError);
    expect(buildExecution(d.id, [-1]).status).toBe('generator-error');
    expect(buildExecution(d.id, d.defaultInput).status).toBe('ok');
  });

  it('metadata: FUNDAMENTALS, the numbers visual, O(log n) time and O(1) space', () => {
    expect(d).toMatchObject({ category: 'FUNDAMENTALS', visual: 'numbers' });
    expect(d.complexity.worst).toMatch(/^O\(log \w+\)$/);
    expect(d.complexity.space).toBe('O(1)');
    const [lo, hi] = d.inputSpec!.numbers![0].random!;
    expect(lo >= 0 && hi <= INT_MAX && lo < hi).toBe(true);
  });
});
