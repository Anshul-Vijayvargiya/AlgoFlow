import type { AlgorithmDefinition, BitState, ExecutionStep } from '../../../types/algorithm';
import { BIT_WIDTH, bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, LAST_BIT, onesSet, positionField, PY_BITS_HEAD, statesFrom, toInt32, toUint32, valueField } from './bitTrace';

/**
 * Binary Left Shift: every bit moves i positions to the left, zeros fill in on the right, and bits pushed past position
 * 31 are discarded. Shown one position at a time. The trace shifts once per step; the code shifts by i at once.
 */
function generateLeftShiftSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitwiseLeftShiftDefinition, input);
  const [a, i] = input;
  const label = 'a << i';
  const { steps, push, finish } = bitRecorder(label);
  /** a's bits that this shift will have pushed out */
  const leaving = (k: number): Record<number, BitState> => (k > 0 ? statesFrom(BIT_WIDTH - k, LAST_BIT, 'selected') : {});
  const source = (k: number) => bitRow('a', 'a', 'input', a, leaving(k));

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { a, i },
      message: `a << i, where a = ${a} and i = ${i}`,
      explanation: `Every bit moves ${i} position${i === 1 ? '' : 's'} left. Zeros fill in on the right, and bits pushed past position 31 are discarded: the width stays 32. i must be from 0 to 31, because shifting by the full width or more is undefined in C and C++.`,
      actionLabel: 'Start',
    },
    [source(0), bitRow('result', label, 'output', a)]
  );

  const discarded: (0 | 1)[] = [];
  if (i === 0) {
    push(
      {
        type: 'update',
        codeRef: 'shift',
        variables: { i, result: a },
        message: 'a << 0 = a',
        explanation: 'Shifting by 0 moves nothing: the result is a itself.',
        actionLabel: 'No shift',
      },
      [source(0), bitRow('result', 'a << 0', 'output', a)]
    );
  }
  for (let k = 1; k <= i; k++) {
    const lost = bitAt(a, BIT_WIDTH - k);
    discarded.push(lost);
    const value = toInt32(a << k);
    const states: Record<number, BitState> = { ...statesFrom(k, LAST_BIT, 'shifted'), ...statesFrom(0, k - 1, 'cleared') };
    push(
      {
        type: 'update',
        codeRef: 'shift',
        variables: { shift: k, 'bit lost': lost, value },
        message: `a << ${k} = ${value}`,
        explanation: `Everything moves one more position left. The bit that was at position 31 (${lost}) is discarded, and a 0 fills in at position 0.`,
        actionLabel: `Shift ${k}`,
      },
      [source(k), bitRow('result', `a << ${k}`, 'output', value, states)],
      { discarded: [...discarded] }
    );
  }

  const result = toInt32(a << i);
  const product = a * 2 ** i;
  finish(
    {
      codeRef: 'done',
      variables: { a, i, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: `${
        product === result
          ? 'The true product fits in 32 bits, so the result equals a × 2^i.'
          : `a × 2^i does not fit in 32 bits, so the value wrapped around: the result is ${result}, not ${product}.`
      } C and C++ shift as unsigned, because shifting a negative or overflowing int is undefined there. Java and Python (through to_int32) give the same 32 bits. O(1) time and O(1) space.`,
      actionLabel: 'Done',
    },
    [source(i), bitRow('result', label, 'output', result, onesSet(result))],
    `${a} << ${i} = ${result}`,
    { discarded: [...discarded] }
  );
  return steps;
}

export const bitwiseLeftShiftDefinition: AlgorithmDefinition = {
  id: 'bitwise-left-shift',
  name: 'Binary Left Shift',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'a << i: bits move left, zeros fill in, the top bits are discarded.',
  description: `A left shift moves every bit i positions to the left. Zeros fill in on the right, and bits pushed past position 31 are discarded. While a × 2^i fits in 32 bits, the result equals it; otherwise it wraps around within 32 bits, in the same way in all four listings. C and C++ shift as uint32_t, so no shift is undefined. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Multiplying by a power of two, and building masks such as 1 << i'),
  defaultInput: [5, 2],
  inputSpec: {
    numbers: [valueField('a'), positionField('i', 'The shift amount: a whole number from 0 to 31')],
    numberExamples: [[5, 2], [1, 31], [0, 5], [-1, 4], [-3, 1], [1073741824, 1], [2147483647, 1], [-2147483648, 1], [12, 0]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t leftShift(int32_t a, int i) {
    // i: 0 to 31. Shifting as unsigned is always defined; bits leaving the top are discarded
    int32_t result = (int32_t)((uint32_t)a << i);
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t leftShift(int32_t a, int i) {
    // i: 0 to 31. Shifting as unsigned is always defined; bits leaving the top are discarded
    int32_t result = (int32_t)((uint32_t)a << i);
    return result;
}`,
    java: `${javaBitsHead('LeftShift')}    static int leftShift(int a, int i) {
        // i: 0 to 31. Bits leaving the top are discarded
        int result = a << i;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def left_shift(a, i):
    # i: 0 to 31. to_int32 discards the bits leaving the top
    result = to_int32(a << i)
    return result`,
  },

  // The code shifts by i in one statement; the trace shows it one position at a time on that line.
  lineMap: {
    c: { start: 4, shift: 6, done: 7 },
    cpp: { start: 5, shift: 7, done: 8 },
    java: { start: 3, shift: 5, done: 6 },
    python: { start: 8, shift: 10, done: 11 },
  },

  generateSteps: generateLeftShiftSteps,
};
