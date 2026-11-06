import type { AlgorithmComplexity, AlgorithmDefinition, BitRow, BitState, BitView, ExecutionStep, NumberField } from '../../../types/algorithm';
import { validateAlgorithmInput } from '../../inputParsing';

/**
 * The integer model of every bit manipulation algorithm: 32-bit two's complement. A value is 32 bits; read as signed it
 * goes from -2^31 to 2^31 - 1, read as unsigned from 0 to 2^32 - 1. Position 0 is the rightmost bit.
 *
 * The listings keep to it in all four languages: C and C++ hold values in int32_t and shift and mask as uint32_t, Java's
 * int is exactly this model, and Python masks with MASK32 and reads the result back through to_int32, so its unbounded
 * integers never leak into a result.
 *
 * JavaScript's own bitwise operators work on exactly these 32 bits, so the traces use them directly.
 */
export const BIT_WIDTH = 32;
export const INT32_MIN = -2147483648;
export const INT32_MAX = 2147483647;
export const LAST_BIT = BIT_WIDTH - 1;

export const INTERPRETATION = "signed 32-bit two's complement";

export const toInt32 = (x: number): number => x | 0;
export const toUint32 = (x: number): number => x >>> 0;
/** the bit at a position (0 is the rightmost) */
export const bitAt = (v: number, position: number): 0 | 1 => ((v >>> position) & 1) as 0 | 1;
/** the 32 bits as text, position 31 first */
export const binaryText = (v: number): string => toUint32(v).toString(2).padStart(BIT_WIDTH, '0');

export const valueField = (label: string): NumberField => ({
  label,
  hint: `A whole number from ${INT32_MIN} to ${INT32_MAX} (a signed 32-bit integer)`,
  min: INT32_MIN,
  max: INT32_MAX,
});

export const positionField = (label: string, hint: string, max = LAST_BIT): NumberField => ({ label, hint, min: 0, max });

/** every algorithm of the category: one machine operation on a fixed width, however many steps the picture takes */
export const bitComplexity = (bestFor: string): AlgorithmComplexity => ({ best: 'O(1)', average: 'O(1)', worst: 'O(1)', space: 'O(1)', bestFor });

export const COMPLEXITY_NOTE =
  "It takes O(1) time and O(1) auxiliary space: the integer has a fixed width of 32 bits, and the processor handles them in one operation. The visualization shows several steps only to explain that operation; they are not extra work.";

/** the same refusal in every generator: the app validates the fields first, so this only guards direct calls */
export function checkBitInput(def: Pick<AlgorithmDefinition, 'name' | 'inputSpec' | 'visual'>, input: number[]): void {
  const r = validateAlgorithmInput(def, input, null);
  if (!r.ok) throw new RangeError(r.message);
}

export const bitRow = (id: string, label: string, role: BitRow['role'], value: number, states?: Readonly<Record<number, BitState>>, pendingFrom?: number): BitRow => ({
  id,
  label,
  role,
  value: toInt32(value),
  ...(states ? { states } : {}),
  ...(pendingFrom !== undefined && pendingFrom < BIT_WIDTH ? { pendingFrom } : {}),
});

/** the same state at every position in a..b, inclusive */
export const statesFrom = (a: number, b: number, state: BitState): Record<number, BitState> => {
  const out: Record<number, BitState> = {};
  for (let p = a; p <= b; p++) out[p] = state;
  return out;
};

/** every 1 bit of a value marked as set: how a finished result is drawn */
export const onesSet = (v: number): Record<number, BitState> => {
  const out: Record<number, BitState> = {};
  for (let p = 0; p < BIT_WIDTH; p++) if (bitAt(v, p)) out[p] = 'set';
  return out;
};

export function bitRecorder(operation: string) {
  const steps: ExecutionStep[] = [];
  const push = (s: Omit<ExecutionStep, 'id' | 'state' | 'bits'>, rows: readonly BitRow[], extra: Partial<Pick<BitView, 'position' | 'discarded' | 'result'>> = {}) => {
    steps.push({ id: steps.length, state: [], ...s, bits: { width: BIT_WIDTH, operation, interpretation: INTERPRETATION, rows, ...extra } });
  };
  /** the last step: the result text is also the outcome */
  const finish = (s: Omit<ExecutionStep, 'id' | 'state' | 'bits' | 'type' | 'outcomeText'>, rows: readonly BitRow[], text: string, extra: Partial<Pick<BitView, 'discarded'>> = {}) => {
    push({ ...s, type: 'complete', outcomeText: text }, rows, { ...extra, result: { text } });
  };
  return { steps, push, finish };
}

// ─── the listings' shared openings (each ends with a newline; the function comes next) ──────────────────────────
// With these, the function's first line is line 4 in C, 5 in C++, 3 in Java (inside its class) and 8 in Python.

export const C_BITS_HEAD = `#include <stdint.h>

// int32_t: exactly 32 bits, two's complement
`;

export const CPP_BITS_HEAD = `#include <cstdint>
using namespace std;

// int32_t: exactly 32 bits, two's complement
`;

export const javaBitsHead = (className: string) => `public class ${className} {
    // int: always exactly 32 bits, two's complement
`;

export const PY_BITS_HEAD = `MASK32 = 0xFFFFFFFF

def to_int32(x):
    # keep 32 bits and read them as two's complement
    x &= MASK32
    return x - 0x100000000 if x >= 0x80000000 else x

`;

// ─── AND, OR, XOR: the same picture, one bit at a time ───────────────────────────────────────────────────────────

interface BinaryOp {
  readonly symbol: '&' | '|' | '^';
  readonly apply: (a: 0 | 1, b: 0 | 1) => 0 | 1;
  /** why this pair of bits gives this bit, in words */
  readonly why: (a: 0 | 1, b: 0 | 1, r: 0 | 1) => string;
}

export function binaryOpSteps(def: Pick<AlgorithmDefinition, 'name' | 'inputSpec' | 'visual'>, op: BinaryOp, input: number[]): ExecutionStep[] {
  checkBitInput(def, input);
  const [a, b] = input;
  const label = `a ${op.symbol} b`;
  const { steps, push, finish } = bitRecorder(label);
  const inputs = (states?: Readonly<Record<number, BitState>>) => [bitRow('a', 'a', 'input', a, states), bitRow('b', 'b', 'input', b, states)];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { a, b },
      message: `${label}, where a = ${a} and b = ${b}`,
      explanation: `Each input is 32 bits in two's complement. ${op.symbol} works on each position separately: bit i of the result depends only on bit i of a and bit i of b.`,
      actionLabel: 'Start',
    },
    [...inputs(), bitRow('result', label, 'output', 0, undefined, 0)]
  );

  let partial = 0;
  for (let p = 0; p < BIT_WIDTH; p++) {
    const x = bitAt(a, p);
    const y = bitAt(b, p);
    const r = op.apply(x, y);
    if (r) partial |= 1 << p;
    push(
      {
        type: 'compare',
        codeRef: 'eval-bit',
        variables: { position: p, 'a bit': x, 'b bit': y, 'result bit': r },
        message: `bit ${p}: ${x} ${op.symbol} ${y} = ${r}`,
        explanation: op.why(x, y, r),
        actionLabel: `Bit ${p}`,
      },
      [...inputs({ [p]: 'selected' }), bitRow('result', label, 'output', partial, { [p]: r ? 'set' : 'cleared' }, p + 1)],
      { position: p }
    );
  }

  const result = toInt32(partial);
  finish(
    {
      codeRef: 'done',
      variables: { a, b, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: `All 32 positions are done: ${a} ${op.symbol} ${b} = ${result}. The processor does this in one operation: O(1) time and O(1) space. The ${BIT_WIDTH} steps above only show what it does to each bit.`,
      actionLabel: 'Done',
    },
    [...inputs(), bitRow('result', label, 'output', result, onesSet(result))],
    `${a} ${op.symbol} ${b} = ${result}`
  );
  return steps;
}
