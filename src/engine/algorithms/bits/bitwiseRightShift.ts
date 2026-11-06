import type { AlgorithmDefinition, BitState, ExecutionStep } from '../../../types/algorithm';
import { BIT_WIDTH, bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, LAST_BIT, onesSet, positionField, PY_BITS_HEAD, statesFrom, toInt32, valueField } from './bitTrace';

/**
 * Binary Right Shift, arithmetic: every bit moves i positions to the right, copies of the sign bit fill in on the left
 * and the lowest bits are discarded, so the sign is kept. The logical shift (zeros fill in) is shown for comparison.
 */
function generateRightShiftSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitwiseRightShiftDefinition, input);
  const [a, i] = input;
  const label = 'a >> i';
  const { steps, push, finish } = bitRecorder(label);
  const sign = bitAt(a, LAST_BIT);
  const source = (k: number) => bitRow('a', 'a', 'input', a, k > 0 ? statesFrom(0, k - 1, 'selected') : { [LAST_BIT]: 'selected' });

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { a, i, 'sign bit': sign },
      message: `a >> i, where a = ${a} and i = ${i}`,
      explanation: `This is the arithmetic right shift. Every bit moves ${i} position${i === 1 ? '' : 's'} right, the lowest bits are discarded, and copies of the sign bit (position 31, here ${sign}) fill in on the left, so the sign is kept. i must be from 0 to 31.`,
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
        message: 'a >> 0 = a',
        explanation: 'Shifting by 0 moves nothing: the result is a itself.',
        actionLabel: 'No shift',
      },
      [source(0), bitRow('result', 'a >> 0', 'output', a)]
    );
  }
  for (let k = 1; k <= i; k++) {
    const lost = bitAt(a, k - 1);
    discarded.push(lost);
    const value = a >> k;
    const states: Record<number, BitState> = { ...statesFrom(0, BIT_WIDTH - k - 1, 'shifted'), ...statesFrom(BIT_WIDTH - k, LAST_BIT, sign ? 'set' : 'cleared') };
    push(
      {
        type: 'update',
        codeRef: 'shift',
        variables: { shift: k, 'bit lost': lost, 'sign fill': sign, value },
        message: `a >> ${k} = ${value}`,
        explanation: `Everything moves one more position right. The bit that was at position 0 (${lost}) is discarded, and a copy of the sign bit (${sign}) fills in at position 31.`,
        actionLabel: `Shift ${k}`,
      },
      [source(k), bitRow('result', `a >> ${k}`, 'output', value, states)],
      { discarded: [...discarded] }
    );
  }

  const result = a >> i;
  const logical = a >>> i;
  const same = toInt32(logical) === result;
  const logicalStates: Record<number, BitState> = i > 0 ? statesFrom(BIT_WIDTH - i, LAST_BIT, 'cleared') : {};
  const rows = (resultStates?: Readonly<Record<number, BitState>>) => [
    source(i),
    bitRow('result', label, 'output', result, resultStates),
    bitRow('logical', 'logical shift, for comparison', 'intermediate', toInt32(logical), logicalStates),
  ];
  push(
    {
      type: 'update',
      codeRef: 'compare-logical',
      variables: { arithmetic: result, 'logical (unsigned)': logical },
      message: `logical right shift: zeros fill in, ${logical} as unsigned`,
      explanation: same
        ? 'For a value with sign bit 0, or a shift by 0, the logical shift gives the same bits as the arithmetic one.'
        : `The logical shift fills in zeros instead of the sign bit, so it reads the bits as an unsigned number: ${logical}. The arithmetic shift keeps the sign: ${result}. Java writes the two as >> and >>>; C and C++ cast to uint32_t for logical, and Python masks to 32 bits first.`,
      actionLabel: 'Logical',
    },
    rows()
  );

  finish(
    {
      codeRef: 'done',
      variables: { a, i, result, 'logical (unsigned)': logical },
      message: `return ${result}`,
      explanation: `The arithmetic shift rounds toward negative infinity: a >> i is a ÷ 2^i, rounded down. C leaves >> on a negative value to the compiler, but gcc, clang and MSVC all shift arithmetically, and C++20 requires it. Java and Python do the same. O(1) time and O(1) space.`,
      actionLabel: 'Done',
    },
    rows(onesSet(result)),
    same ? `${a} >> ${i} = ${result}` : `${a} >> ${i} = ${result} (arithmetic; the logical shift gives ${logical})`,
    { discarded: [...discarded] }
  );
  return steps;
}

export const bitwiseRightShiftDefinition: AlgorithmDefinition = {
  id: 'bitwise-right-shift',
  name: 'Binary Right Shift',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'a >> i: bits move right and the sign bit fills in (arithmetic shift).',
  description: `A right shift moves every bit i positions to the right and discards the lowest bits. There are two kinds. The arithmetic shift, which a >> i means here and in all four listings, fills in with copies of the sign bit, so it keeps the sign and divides by 2^i, rounding down. The logical shift fills in with zeros, reading the bits as unsigned; each listing also has it for comparison. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Dividing by a power of two, rounding down, and moving a bit down to position 0'),
  defaultInput: [-16, 2],
  inputSpec: {
    numbers: [valueField('a'), positionField('i', 'The shift amount: a whole number from 0 to 31')],
    numberExamples: [[-16, 2], [20, 2], [0, 5], [-1, 31], [-7, 1], [2147483647, 31], [-2147483648, 31], [1024, 10], [12, 0]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t rightShift(int32_t a, int i) {
    // i: 0 to 31. Arithmetic: copies of the sign bit fill in (gcc, clang, MSVC; required by C++20)
    int32_t result = a >> i;
    return result;
}

// logical, for comparison: zeros fill in
uint32_t logicalRightShift(int32_t a, int i) {
    return (uint32_t)a >> i;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t rightShift(int32_t a, int i) {
    // i: 0 to 31. Arithmetic: copies of the sign bit fill in (gcc, clang, MSVC; required by C++20)
    int32_t result = a >> i;
    return result;
}

// logical, for comparison: zeros fill in
uint32_t logicalRightShift(int32_t a, int i) {
    return (uint32_t)a >> i;
}`,
    java: `${javaBitsHead('RightShift')}    static int rightShift(int a, int i) {
        // i: 0 to 31. Arithmetic: copies of the sign bit fill in
        int result = a >> i;
        return result;
    }

    // logical, for comparison: zeros fill in (a long holds the unsigned value)
    static long logicalRightShift(int a, int i) {
        return (a & 0xFFFFFFFFL) >>> i;
    }
}`,
    python: `${PY_BITS_HEAD}def right_shift(a, i):
    # i: 0 to 31. Arithmetic: copies of the sign bit fill in
    result = to_int32(a >> i)
    return result

# logical, for comparison: zeros fill in
def logical_right_shift(a, i):
    return (a & MASK32) >> i`,
  },

  // The code shifts by i in one statement; the trace shows it one position at a time on that line.
  lineMap: {
    c: { start: 4, shift: 6, 'compare-logical': 12, done: 7 },
    cpp: { start: 5, shift: 7, 'compare-logical': 13, done: 8 },
    java: { start: 3, shift: 5, 'compare-logical': 11, done: 6 },
    python: { start: 8, shift: 10, 'compare-logical': 15, done: 11 },
  },

  generateSteps: generateRightShiftSteps,
};
