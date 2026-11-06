import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms, resolveCodeRef, visualKindOf } from '../AlgorithmRegistry';
import { validateAlgorithmInput, validateNumberDraft } from '../inputParsing';
import { buildExecution } from '../buildExecution';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../data/algorithmMetadata';
import { IMPLEMENTED_TOPICS } from '../../data/algorithmCatalog';
import { binaryText, INT32_MAX, INT32_MIN } from '../algorithms/bits/bitTrace';
import type { AlgorithmId, BitRow, ExecutionStep, ProgrammingLanguage } from '../../types/algorithm';

const IDS = [
  'bitwise-and',
  'bitwise-or',
  'bitwise-xor',
  'bitwise-not',
  'bitwise-left-shift',
  'bitwise-right-shift',
  'bit-check-even',
  'bit-get-ith',
  'bit-set-ith',
  'bit-clear-ith',
  'bit-update-ith',
  'bit-clear-last-i',
  'bit-clear-range',
] as const satisfies readonly AlgorithmId[];
type Id = (typeof IDS)[number];

const def = (id: Id) => getAlgorithmDefinition(id)!;
const run = (id: Id, ...args: number[]) => def(id).generateSteps(args);
const last = (steps: ExecutionStep[]) => steps.at(-1)!;
const row = (s: ExecutionStep, id: string): BitRow => s.bits!.rows.find(r => r.id === id)!;
const result = (id: Id, ...args: number[]) => row(last(run(id, ...args)), 'result').value;

// ─── the reference: 64-bit BigInt arithmetic cut to 32 bits, sharing nothing with the engine's bitwise code ─────────
const i32 = (x: bigint) => Number(BigInt.asIntN(32, x));
const big = (x: number) => BigInt.asUintN(32, BigInt(x));
const ONES = 0xffffffffn;
const REFERENCE: Record<Id, (...a: number[]) => number> = {
  'bitwise-and': (a, b) => i32(big(a) & big(b)),
  'bitwise-or': (a, b) => i32(big(a) | big(b)),
  'bitwise-xor': (a, b) => i32(big(a) ^ big(b)),
  'bitwise-not': a => i32(ONES - big(a)),
  'bitwise-left-shift': (a, s) => i32(big(a) * 2n ** BigInt(s)),
  'bitwise-right-shift': (a, s) => Math.floor(a / 2 ** s), // arithmetic: a ÷ 2^i, rounded down
  'bit-check-even': a => Number(BigInt.asUintN(1, BigInt(a))),
  'bit-get-ith': (n, i) => Number((big(n) / 2n ** BigInt(i)) % 2n),
  'bit-set-ith': (n, i) => {
    const p = 2n ** BigInt(i);
    return i32((big(n) / p) % 2n === 1n ? big(n) : big(n) + p);
  },
  'bit-clear-ith': (n, i) => {
    const p = 2n ** BigInt(i);
    return i32((big(n) / p) % 2n === 1n ? big(n) - p : big(n));
  },
  'bit-update-ith': (n, i, bit) => {
    const p = 2n ** BigInt(i);
    const without = (big(n) / p) % 2n === 1n ? big(n) - p : big(n);
    return i32(without + BigInt(bit) * p);
  },
  'bit-clear-last-i': (n, i) => i32((big(n) / 2n ** BigInt(i)) * 2n ** BigInt(i)),
  'bit-clear-range': (n, l, r) => {
    const low = big(n) % 2n ** BigInt(l);
    const high = (big(n) / 2n ** BigInt(r + 1)) * 2n ** BigInt(r + 1);
    return i32(high + low);
  },
};

function* random(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    yield s / 2 ** 31;
  }
}
const LIMITS = [0, 1, -1, 2, -2, 12, 255, 1024, 1073741824, INT32_MAX, INT32_MIN, INT32_MIN + 1];

/** what to run an algorithm on: the default, its own examples and seeded random values with the boundaries well represented */
function vectors(id: Id, count = 150): number[][] {
  const d = def(id);
  const rnd = random(20261106 + id.length);
  const next = () => rnd.next().value as number;
  const fields = d.inputSpec!.numbers!;
  const out: number[][] = [d.defaultInput, ...(d.inputSpec!.numberExamples ?? []).map(e => [...e])];
  for (let k = 0; k < count; k++) {
    const v = fields.map(f => {
      if (f.min < 0) return next() < 0.3 ? LIMITS[Math.floor(next() * LIMITS.length)] : Math.floor(next() * 2 ** 32) - 2 ** 31;
      return next() < 0.3 ? (next() < 0.5 ? 0 : f.max) : Math.floor(next() * (f.max + 1));
    });
    if (id === 'bit-clear-range' && v[1] > v[2]) [v[1], v[2]] = [v[2], v[1]];
    out.push(v);
  }
  return out;
}

describe('Bit manipulation — the category', () => {
  it('sits between BACKTRACKING and FUNDAMENTALS, with the 13 algorithms in the required order and groups', () => {
    const order = ALGORITHM_CATEGORIES.map(c => c.id);
    expect(order.indexOf('BIT_MANIPULATION')).toBe(order.indexOf('BACKTRACKING') + 1);
    expect(order.indexOf('FUNDAMENTALS')).toBe(order.indexOf('BIT_MANIPULATION') + 1);
    expect(ALGORITHM_CATEGORIES.find(c => c.id === 'BIT_MANIPULATION')!.label).toBe('BIT MANIPULATION');
    const nav = ALGORITHM_NAV.filter(a => a.category === 'BIT_MANIPULATION');
    expect(nav.map(a => a.id)).toEqual([...IDS]);
    expect(nav.map(a => a.name)).toEqual([
      'Binary AND',
      'Binary OR',
      'Binary XOR',
      "Binary One's Complement",
      'Binary Left Shift',
      'Binary Right Shift',
      'Check if Even',
      'Get i-th Bit',
      'Set i-th Bit',
      'Clear i-th Bit',
      'Update i-th Bit',
      'Clear Last i Bits',
      'Clear Range of Bits',
    ]);
    expect(nav.map(a => a.group)).toEqual([
      ...Array(6).fill('Basic Bitwise Operators'),
      ...Array(5).fill('Basic Bit Manipulation'),
      ...Array(2).fill('Advanced Bit Manipulation'),
    ]);
    expect(nav.every(a => a.implemented)).toBe(true);
    // no other category has groups
    expect(ALGORITHM_NAV.filter(a => a.category !== 'BIT_MANIPULATION').every(a => a.group === undefined)).toBe(true);
    expect(IMPLEMENTED_TOPICS.find(t => t.topic === 'Bit Manipulation')!.algorithmIds).toEqual([...IDS]);
  });

  it.each(IDS)('%s: an independent definition drawn as bits, O(1) with the visualization steps explained', id => {
    const d = def(id);
    expect(getAllAlgorithms().filter(x => x.id === id)).toHaveLength(1);
    expect(d).toMatchObject({ id, category: 'BIT_MANIPULATION', visual: 'bits' });
    expect(visualKindOf(d)).toBe('bits');
    expect(d.complexity).toMatchObject({ best: 'O(1)', average: 'O(1)', worst: 'O(1)', space: 'O(1)' });
    expect(d.description).toContain('O(1) time and O(1) auxiliary space');
    expect(d.description).toContain('they are not extra work');
    expect(ALGORITHM_NAV.find(a => a.id === id)!.name).toBe(d.name);
    expect(ALGORITHM_NAV.find(a => a.id === id)!.subtitle).toBe(d.subtitle);
  });
});

describe('Bit manipulation — the answers', () => {
  it('AND, OR and XOR truth tables, at every position', () => {
    const table: [Id, number[]][] = [
      ['bitwise-and', [0, 0, 0, 1]],
      ['bitwise-or', [0, 1, 1, 1]],
      ['bitwise-xor', [0, 1, 1, 0]],
    ];
    for (const [id, expected] of table) {
      for (const p of [0, 1, 15, 30, 31]) {
        const pairs = [[0, 0], [0, 1], [1, 0], [1, 1]];
        pairs.forEach(([x, y], k) => {
          const r = result(id, (x << p) | 0, (y << p) | 0);
          expect((r >>> p) & 1, `${id} ${x},${y} at ${p}`).toBe(expected[k]);
          // nothing else is set
          expect(r >>> 0, `${id} ${x},${y} at ${p}`).toBe((expected[k] << p) >>> 0);
        });
      }
    }
    expect(result('bitwise-and', 12, 10)).toBe(8);
    expect(result('bitwise-or', 12, 10)).toBe(14);
    expect(result('bitwise-xor', 12, 10)).toBe(6);
    expect(result('bitwise-xor', 255, 255)).toBe(0);
  });

  it('negative values and the int32 limits in AND, OR, XOR', () => {
    expect(result('bitwise-and', -1, 255)).toBe(255);
    expect(result('bitwise-and', -8, 12)).toBe(8);
    expect(result('bitwise-or', -8, 3)).toBe(-5);
    expect(result('bitwise-xor', -1, 255)).toBe(-256);
    expect(result('bitwise-and', INT32_MIN, -1)).toBe(INT32_MIN);
    expect(result('bitwise-or', INT32_MAX, INT32_MIN)).toBe(-1);
  });

  it("one's complement: ~a is -a - 1, at the limits too", () => {
    expect(result('bitwise-not', 12)).toBe(-13);
    expect(result('bitwise-not', 0)).toBe(-1);
    expect(result('bitwise-not', -1)).toBe(0);
    expect(result('bitwise-not', INT32_MAX)).toBe(INT32_MIN);
    expect(result('bitwise-not', INT32_MIN)).toBe(INT32_MAX);
  });

  it('left shift: zeros fill in, and bits past position 31 are discarded', () => {
    expect(result('bitwise-left-shift', 5, 2)).toBe(20);
    expect(result('bitwise-left-shift', 5, 0)).toBe(5);
    expect(result('bitwise-left-shift', 1, 31)).toBe(INT32_MIN);
    expect(result('bitwise-left-shift', 3, 31)).toBe(INT32_MIN);
    expect(result('bitwise-left-shift', -1, 4)).toBe(-16);
    expect(result('bitwise-left-shift', INT32_MAX, 1)).toBe(-2);
    expect(result('bitwise-left-shift', INT32_MIN, 1)).toBe(0);
    // the discarded bits, first lost first
    expect(last(run('bitwise-left-shift', INT32_MIN + 1, 2)).bits!.discarded).toEqual([1, 0]);
    expect(last(run('bitwise-left-shift', 5, 0)).bits!.discarded).toEqual([]);
    // the explanation does not claim a product that did not happen, nor deny one that did
    expect(last(run('bitwise-left-shift', -3, 1)).explanation).toContain('the result equals a × 2^i');
    expect(last(run('bitwise-left-shift', INT32_MAX, 1)).explanation).toContain('the value wrapped around: the result is -2, not 4294967294');
  });

  it('right shift is arithmetic: the sign fills in; the logical result is given next to it', () => {
    expect(result('bitwise-right-shift', 20, 2)).toBe(5);
    expect(result('bitwise-right-shift', -16, 2)).toBe(-4);
    expect(result('bitwise-right-shift', -7, 1)).toBe(-4); // rounds down
    expect(result('bitwise-right-shift', -1, 31)).toBe(-1);
    expect(result('bitwise-right-shift', INT32_MIN, 31)).toBe(-1);
    expect(result('bitwise-right-shift', INT32_MAX, 31)).toBe(0);
    const end = last(run('bitwise-right-shift', -16, 2));
    expect(row(end, 'logical').value >>> 0).toBe(1073741820);
    expect(end.variables!['logical (unsigned)']).toBe(1073741820);
    expect(end.outcomeText).toBe('-16 >> 2 = -4 (arithmetic; the logical shift gives 1073741820)');
    expect(last(run('bitwise-right-shift', 20, 2)).outcomeText).toBe('20 >> 2 = 5');
    expect(end.bits!.discarded).toEqual([0, 0]);
    expect(last(run('bitwise-right-shift', 7, 2)).bits!.discarded).toEqual([1, 1]);
  });

  it('even and odd, negatives included', () => {
    for (const [n, text] of [
      [6, 'EVEN: bit 0 of 6 is 0'],
      [7, 'ODD: bit 0 of 7 is 1'],
      [0, 'EVEN: bit 0 of 0 is 0'],
      [-4, 'EVEN: bit 0 of -4 is 0'],
      [-1, 'ODD: bit 0 of -1 is 1'],
      [INT32_MIN, `EVEN: bit 0 of ${INT32_MIN} is 0`],
      [INT32_MAX, `ODD: bit 0 of ${INT32_MAX} is 1`],
    ] as const) {
      expect(last(run('bit-check-even', n)).outcomeText).toBe(text);
    }
  });

  it('get, set, clear and update a bit, at positions 0 and 31 and on negatives', () => {
    expect(result('bit-get-ith', 12, 2)).toBe(1);
    expect(result('bit-get-ith', 12, 0)).toBe(0);
    expect(result('bit-get-ith', -1, 31)).toBe(1);
    expect(result('bit-get-ith', INT32_MIN, 31)).toBe(1);
    expect(result('bit-get-ith', INT32_MAX, 31)).toBe(0);
    expect(result('bit-set-ith', 8, 1)).toBe(10);
    expect(result('bit-set-ith', 8, 3)).toBe(8);
    expect(result('bit-set-ith', 0, 31)).toBe(INT32_MIN);
    expect(result('bit-set-ith', INT32_MAX, 31)).toBe(-1);
    expect(result('bit-clear-ith', 13, 2)).toBe(9);
    expect(result('bit-clear-ith', 13, 1)).toBe(13);
    expect(result('bit-clear-ith', -1, 31)).toBe(INT32_MAX);
    expect(result('bit-clear-ith', -1, 0)).toBe(-2);
    expect(result('bit-update-ith', 13, 1, 1)).toBe(15);
    expect(result('bit-update-ith', 13, 2, 0)).toBe(9);
    expect(result('bit-update-ith', 13, 2, 1)).toBe(13);
    expect(result('bit-update-ith', 0, 31, 1)).toBe(INT32_MIN);
    expect(result('bit-update-ith', -1, 31, 0)).toBe(INT32_MAX);
    expect(last(run('bit-update-ith', 13, 2, 0)).outcomeText).toBe('Bit 2 of 13: old 1, new 0, result 9');
  });

  it('clear last i bits: i = 0 changes nothing, i = 32 clears everything', () => {
    expect(result('bit-clear-last-i', 31, 3)).toBe(24);
    expect(result('bit-clear-last-i', 31, 0)).toBe(31);
    expect(result('bit-clear-last-i', -1, 0)).toBe(-1);
    expect(result('bit-clear-last-i', 31, 32)).toBe(0);
    expect(result('bit-clear-last-i', -1, 32)).toBe(0);
    expect(result('bit-clear-last-i', -1, 31)).toBe(INT32_MIN);
    expect(result('bit-clear-last-i', -1, 4)).toBe(-16);
    expect(row(last(run('bit-clear-last-i', -1, 32)), 'mask').value).toBe(0);
    expect(row(last(run('bit-clear-last-i', -1, 0)), 'mask').value).toBe(-1);
  });

  it('clear a range: only l through r, including the whole width and single positions', () => {
    expect(result('bit-clear-range', 255, 2, 5)).toBe(195);
    expect(result('bit-clear-range', -1, 0, 31)).toBe(0);
    expect(result('bit-clear-range', -1, 0, 30)).toBe(INT32_MIN);
    expect(result('bit-clear-range', -1, 1, 31)).toBe(1);
    expect(result('bit-clear-range', -1, 31, 31)).toBe(INT32_MAX);
    expect(result('bit-clear-range', 255, 0, 0)).toBe(254);
    expect(result('bit-clear-range', 0, 4, 8)).toBe(0);
    expect(row(last(run('bit-clear-range', 5, 0, 31)), 'mask').value).toBe(0);
  });

  it.each(IDS)('%s agrees with the BigInt reference, on its examples, zero, negatives, the limits and random values', id => {
    for (const args of vectors(id)) {
      const end = last(run(id, ...args));
      if (id === 'bit-check-even') {
        expect(end.outcomeText!.startsWith(REFERENCE[id](...args) === 0 ? 'EVEN' : 'ODD'), String(args)).toBe(true);
      } else {
        expect(row(end, 'result').value, `${id}(${args})`).toBe(REFERENCE[id](...args));
      }
    }
  });
});

describe('Bit manipulation — the steps', () => {
  it.each(IDS)('%s: the trace keeps its invariants', id => {
    const d = def(id);
    const emitted = new Set<string>();
    for (const args of vectors(id, 40)) {
      const before = [...args];
      const steps = d.generateSteps(args);
      expect(args, 'the input is not changed').toEqual(before);
      expect(steps.map(s => s.id)).toEqual(steps.map((_, k) => k));
      expect(steps[0]).toMatchObject({ type: 'init', codeRef: 'start' });
      expect(last(steps)).toMatchObject({ type: 'complete', codeRef: 'done' });
      expect(last(steps).bits!.result!.text).toBe(last(steps).outcomeText);
      expect(steps.slice(0, -1).every(s => s.bits!.result === undefined)).toBe(true);
      expect(JSON.stringify(d.generateSteps([...args])), 'deterministic').toBe(JSON.stringify(steps));
      for (const s of steps) {
        const b = s.bits!;
        expect(s.state).toEqual([]);
        expect(b.width).toBe(32);
        expect(b.interpretation).toBe("signed 32-bit two's complement");
        expect(b.operation.length).toBeGreaterThan(0);
        expect(b.rows.length).toBeGreaterThan(0);
        if (b.position !== undefined) expect(b.position >= 0 && b.position <= 31).toBe(true);
        expect(new Set(b.rows.map(r => r.id)).size).toBe(b.rows.length);
        for (const r of b.rows) {
          expect(Number.isInteger(r.value) && r.value >= INT32_MIN && r.value <= INT32_MAX, `${r.id} is an int32`).toBe(true);
          for (const p of Object.keys(r.states ?? {})) expect(Number(p) >= 0 && Number(p) <= 31, `${r.id} position ${p}`).toBe(true);
          if (r.pendingFrom !== undefined) {
            expect(r.role).toBe('output');
            // what is not worked out yet is not drawn as a value
            expect(r.value >>> r.pendingFrom === 0 || r.pendingFrom === 0).toBe(true);
          }
        }
        if (s.codeRef) emitted.add(s.codeRef);
        for (const lang of ['c', 'cpp', 'java', 'python'] as ProgrammingLanguage[]) expect(resolveCodeRef(d, lang, s.codeRef), `${s.codeRef} ${lang}`).not.toBeNull();
      }
      // the input rows hold the input, on every step
      const fields = d.inputSpec!.numbers!;
      const inputValue = args[fields.findIndex(f => f.min < 0)];
      for (const s of steps) expect(s.bits!.rows[0]).toMatchObject({ role: 'input', value: inputValue });
    }
    // every line in the map is reached
    expect([...emitted].sort()).toEqual(Object.keys(d.lineMap.cpp).sort());
  });

  it.each(['bitwise-and', 'bitwise-or', 'bitwise-xor'] as const)('%s evaluates all 32 positions from 0 up, each from its own input bits', id => {
    const [a, b] = [-8, 12];
    const steps = run(id, a, b);
    expect(steps).toHaveLength(34);
    const op = { 'bitwise-and': (x: number, y: number) => x & y, 'bitwise-or': (x: number, y: number) => x | y, 'bitwise-xor': (x: number, y: number) => x ^ y }[id];
    steps.slice(1, -1).forEach((s, p) => {
      const x = (a >>> p) & 1;
      const y = (b >>> p) & 1;
      expect(s.bits!.position).toBe(p);
      expect(s.variables).toMatchObject({ position: p, 'a bit': x, 'b bit': y, 'result bit': op(x, y) });
      expect(row(s, 'a').states).toEqual({ [p]: 'selected' });
      expect(row(s, 'result').states).toEqual({ [p]: op(x, y) ? 'set' : 'cleared' });
      if (p < 31) expect(row(s, 'result').pendingFrom).toBe(p + 1);
      else expect(row(s, 'result').pendingFrom).toBeUndefined();
    });
    // XOR says that differing bits become 1
    if (id === 'bitwise-xor') expect(steps.find(s => s.variables?.['result bit'] === 1)!.explanation).toBe('The bits differ, so the result bit is 1.');
  });

  it('NOT flips each of the 32 bits, one step each', () => {
    const steps = run('bitwise-not', 12);
    expect(steps).toHaveLength(34);
    steps.slice(1, -1).forEach((s, p) => expect(row(s, 'result').states).toEqual({ [p]: 'flipped' }));
  });

  it('shifts move one position per step; a shift by 0 still shows one step', () => {
    expect(run('bitwise-left-shift', 5, 3).filter(s => s.codeRef === 'shift')).toHaveLength(3);
    expect(run('bitwise-left-shift', 5, 0).filter(s => s.codeRef === 'shift')).toHaveLength(1);
    expect(run('bitwise-left-shift', 5, 3).filter(s => s.codeRef === 'shift').map(s => row(s, 'result').value)).toEqual([10, 20, 40]);
    expect(run('bitwise-right-shift', -16, 2).filter(s => s.codeRef === 'shift').map(s => row(s, 'result').value)).toEqual([-8, -4]);
    const fill = run('bitwise-right-shift', -16, 2).find(s => s.codeRef === 'shift')!;
    expect(row(fill, 'result').states![31]).toBe('set');
    expect(row(fill, 'result').states![0]).toBe('shifted');
    expect(row(run('bitwise-right-shift', 16, 2).find(s => s.codeRef === 'shift')!, 'result').states![31]).toBe('cleared');
    expect(row(run('bitwise-left-shift', 5, 2).find(s => s.codeRef === 'shift')!, 'result').states![0]).toBe('cleared');
  });

  it('the selected bits are the ones the operation works on', () => {
    const first = (id: Id, ...args: number[]) => run(id, ...args)[0].bits!.rows[0].states;
    expect(first('bit-get-ith', 12, 5)).toEqual({ 5: 'selected' });
    expect(first('bit-set-ith', 12, 31)).toEqual({ 31: 'selected' });
    expect(first('bit-clear-ith', 12, 0)).toEqual({ 0: 'selected' });
    expect(first('bit-update-ith', 12, 7, 1)).toEqual({ 7: 'selected' });
    expect(first('bit-clear-last-i', 12, 2)).toEqual({ 0: 'selected', 1: 'selected' });
    expect(first('bit-clear-last-i', 12, 0)).toEqual({});
    expect(first('bit-clear-range', 12, 2, 3)).toEqual({ 2: 'selected', 3: 'selected' });
    expect(first('bit-check-even', 12)).toEqual({ 0: 'selected' });
    expect(row(last(run('bit-set-ith', 8, 1)), 'result').states).toEqual({ 1: 'set' });
    expect(row(last(run('bit-clear-ith', 13, 2)), 'result').states).toEqual({ 2: 'cleared' });
    expect(row(last(run('bit-update-ith', 13, 2, 1)), 'result').states).toEqual({ 2: 'set' });
    expect(row(last(run('bit-update-ith', 13, 2, 0)), 'result').states).toEqual({ 2: 'cleared' });
  });

  it('the bits are written position 31 first', () => {
    expect(binaryText(5)).toBe('00000000000000000000000000000101');
    expect(binaryText(-1)).toBe('1'.repeat(32));
    expect(binaryText(INT32_MIN)).toBe(`1${'0'.repeat(31)}`);
  });
});

describe('Bit manipulation — input validation', () => {
  it.each(IDS)('%s: refuses a missing value, a decimal, and values outside the signed 32-bit range', id => {
    const d = def(id);
    const good = [...d.defaultInput];
    expect(validateAlgorithmInput(d, good, null).ok).toBe(true);
    expect(buildExecution(id, good, getAlgorithmDefinition).status).toBe('ok');
    expect(validateAlgorithmInput(d, good.slice(0, -1), null).ok).toBe(false);
    expect(validateAlgorithmInput(d, [...good, 1], null).ok).toBe(false);
    const big = [...good];
    big[0] = INT32_MAX + 1;
    expect(validateAlgorithmInput(d, big, null).ok).toBe(false);
    const small = [...good];
    small[0] = INT32_MIN - 1;
    expect(validateAlgorithmInput(d, small, null).ok).toBe(false);
    const decimal = [...good];
    decimal[0] = 1.5;
    expect(validateAlgorithmInput(d, decimal, null).ok).toBe(false);
    expect(() => d.generateSteps(big)).toThrow(RangeError);
    // the limits themselves are accepted
    const low = [...good];
    low[0] = INT32_MIN;
    expect(validateAlgorithmInput(d, low, null).ok).toBe(true);
  });

  it('a shift amount or bit position outside 0..31 is refused, so no listing can hit an undefined shift', () => {
    for (const id of ['bitwise-left-shift', 'bitwise-right-shift', 'bit-get-ith', 'bit-set-ith', 'bit-clear-ith'] as const) {
      expect(validateAlgorithmInput(def(id), [5, 31], null).ok, id).toBe(true);
      expect(validateAlgorithmInput(def(id), [5, 0], null).ok, id).toBe(true);
      expect(validateAlgorithmInput(def(id), [5, 32], null).ok, id).toBe(false);
      expect(validateAlgorithmInput(def(id), [5, -1], null).ok, id).toBe(false);
      expect(() => def(id).generateSteps([5, 32]), id).toThrow(RangeError);
    }
    expect(validateAlgorithmInput(def('bit-update-ith'), [5, 32, 1], null).ok).toBe(false);
  });

  it('clear last i allows i = 32 but not 33', () => {
    expect(validateAlgorithmInput(def('bit-clear-last-i'), [5, 32], null).ok).toBe(true);
    expect(validateAlgorithmInput(def('bit-clear-last-i'), [5, 33], null).ok).toBe(false);
    expect(validateAlgorithmInput(def('bit-clear-last-i'), [5, -1], null).ok).toBe(false);
  });

  it('the new bit must be 0 or 1', () => {
    expect(validateAlgorithmInput(def('bit-update-ith'), [5, 1, 0], null).ok).toBe(true);
    expect(validateAlgorithmInput(def('bit-update-ith'), [5, 1, 1], null).ok).toBe(true);
    expect(validateAlgorithmInput(def('bit-update-ith'), [5, 1, 2], null).ok).toBe(false);
    expect(validateAlgorithmInput(def('bit-update-ith'), [5, 1, -1], null).ok).toBe(false);
  });

  it('clear range: l above r is refused, and reported on the r field while typing', () => {
    const d = def('bit-clear-range');
    expect(validateAlgorithmInput(d, [255, 5, 2], null)).toMatchObject({ ok: false, message: '"l" (5) must not be greater than "r" (2).' });
    expect(() => d.generateSteps([255, 5, 2])).toThrow(RangeError);
    expect(validateNumberDraft(d, ['255', '5', '2'])).toEqual({ ok: false, field: 2, message: '"l" (5) must not be greater than "r" (2).' });
    expect(validateNumberDraft(d, ['255', '2', '2'])).toEqual({ ok: true, values: [255, 2, 2] });
    expect(validateNumberDraft(d, ['255', '0', '32'])).toMatchObject({ ok: false, field: 2 });
    expect(validateNumberDraft(d, ['255', '-1', '3'])).toMatchObject({ ok: false, field: 1 });
    // an algorithm without a range is unaffected
    expect(validateNumberDraft(def('bit-set-ith'), ['5', '31'])).toEqual({ ok: true, values: [5, 31] });
  });

  it('typed input is reported per field: text, decimals, too large a value', () => {
    const d = def('bitwise-and');
    expect(validateNumberDraft(d, ['abc', '1'])).toMatchObject({ ok: false, field: 0 });
    expect(validateNumberDraft(d, ['1.5', '1'])).toMatchObject({ ok: false, field: 0 });
    expect(validateNumberDraft(d, ['1', ''])).toMatchObject({ ok: false, field: 1 });
    expect(validateNumberDraft(d, ['2147483648', '1'])).toMatchObject({ ok: false, field: 0 });
    expect(validateNumberDraft(d, ['-2147483648', '2147483647'])).toEqual({ ok: true, values: [-2147483648, 2147483647] });
  });

  it.each(IDS)('%s: every example is valid; together they include zero, a negative value, all ones and the boundaries', id => {
    const d = def(id);
    const examples = d.inputSpec!.numberExamples!;
    for (const e of examples) expect(validateAlgorithmInput(d, [...e], null).ok, String(e)).toBe(true);
    expect(examples.length).toBeGreaterThanOrEqual(8);
    expect(examples.some(e => e[0] < 0)).toBe(true);
    expect(examples.some(e => e[0] === -1 || e[1] === -1)).toBe(true);
    expect(examples.some(e => e[0] === INT32_MIN || e[1] === INT32_MIN || e[0] === INT32_MAX)).toBe(true);
    expect(examples.some(e => e.some(v => v === 0))).toBe(true);
  });
});

describe('Bit manipulation — the listings keep to the integer model', () => {
  it.each(IDS)('%s: all four languages use the 32-bit model', id => {
    const { c, cpp, java, python } = def(id).code;
    expect(c).toContain('int32_t');
    expect(c).toContain('#include <stdint.h>');
    expect(cpp).toContain('int32_t');
    expect(cpp).toContain('#include <cstdint>');
    expect(java).toMatch(/static (int|boolean) \w+\(int /);
    expect(java).not.toMatch(/\bint32_t\b/);
    expect(python).toMatch(/^(MASK32 = 0xFFFFFFFF|# n & 1 reads bit 0)/);
  });

  it('C and C++ shift and mask as unsigned wherever a signed shift could be undefined', () => {
    for (const lang of ['c', 'cpp'] as const) {
      expect(def('bitwise-left-shift').code[lang]).toContain('(int32_t)((uint32_t)a << i)');
      expect(def('bit-get-ith').code[lang]).toContain('(uint32_t)n >> i');
      expect(def('bit-set-ith').code[lang]).toContain('UINT32_C(1) << i');
      expect(def('bit-clear-ith').code[lang]).toContain('~(UINT32_C(1) << i)');
      expect(def('bit-update-ith').code[lang]).toContain('(uint32_t)bit << i');
      expect(def('bit-clear-last-i').code[lang]).toContain('(i == 32) ? 0u : (UINT32_MAX << i)');
      expect(def('bit-clear-range').code[lang]).toContain('(width == 32) ? UINT32_MAX : ((UINT32_C(1) << width) - 1)');
      // the logical comparison is unsigned; the arithmetic one is said to be what it is
      expect(def('bitwise-right-shift').code[lang]).toContain('(uint32_t)a >> i');
      expect(def('bitwise-right-shift').code[lang]).toContain('Arithmetic: copies of the sign bit fill in');
    }
  });

  it('Java guards a shift by 32, which it would otherwise treat as a shift by 0, and has >> and >>>', () => {
    expect(def('bit-clear-last-i').code.java).toContain('(i == 32) ? 0 : (~0 << i)');
    expect(def('bit-clear-range').code.java).toContain('(width == 32) ? ~0 : ((1 << width) - 1)');
    expect(def('bitwise-right-shift').code.java).toContain('a >> i');
    expect(def('bitwise-right-shift').code.java).toContain('(a & 0xFFFFFFFFL) >>> i');
    expect(def('bit-get-ith').code.java).toContain('n >>> i');
  });

  it('Python cuts every value that could grow past 32 bits, and reads results back through to_int32', () => {
    for (const id of IDS.filter(x => x !== 'bit-check-even' && x !== 'bit-get-ith')) {
      expect(def(id).code.python, id).toContain('def to_int32(x):');
      expect(def(id).code.python, id).toContain('result = to_int32(');
    }
    expect(def('bit-clear-ith').code.python).toContain('mask = ~(1 << i) & MASK32');
    expect(def('bit-clear-range').code.python).toContain('mask = ~(ones << l) & MASK32');
    expect(def('bit-clear-last-i').code.python).toContain('(MASK32 << i) & MASK32');
    expect(def('bit-get-ith').code.python).toContain('(n & MASK32) >> i');
    expect(def('bitwise-right-shift').code.python).toContain('(a & MASK32) >> i');
  });
});
