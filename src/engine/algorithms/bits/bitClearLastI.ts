import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { BIT_WIDTH, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, positionField, PY_BITS_HEAD, statesFrom, toInt32, toUint32, valueField } from './bitTrace';

/**
 * Clear Last i Bits: AND with a mask of 1s above position i - 1 and 0s below. i goes from 0 (nothing is cleared) to 32
 * (everything is), and i = 32 gets its mask directly: shifting by the full width is undefined in C and C++, and Java
 * would shift by 32 % 32 = 0, which clears nothing.
 */
function generateClearLastSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitClearLastIDefinition, input);
  const [n, i] = input;
  const { steps, push, finish } = bitRecorder('n & (~0 << i)');
  const mask = i === BIT_WIDTH ? 0 : toInt32(-1 << i);
  const result = toInt32(n & mask);
  const low = i > 0 ? statesFrom(0, i - 1, 'selected') : {};
  const lowCleared = i > 0 ? statesFrom(0, i - 1, 'cleared') : {};
  const source = bitRow('n', 'n', 'input', n, low);
  const maskRow = bitRow('mask', i === BIT_WIDTH ? 'empty mask (i = 32)' : '~0 << i', 'mask', mask, lowCleared);
  const rows = [source, maskRow, bitRow('result', 'n & (~0 << i)', 'output', result, lowCleared)];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n, i },
      message: `clearLastBits(n, i), where n = ${n} and i = ${i}`,
      explanation: i === 0 ? 'i = 0: no position is selected, so the value will not change.' : i === BIT_WIDTH ? 'i = 32: all 32 positions are selected, so the result will be 0.' : `Clear the ${i} lowest position${i === 1 ? '' : 's'}: 0 to ${i - 1}. The bits are treated as unsigned, and every other bit stays.`,
      actionLabel: 'Start',
    },
    [source]
  );
  push(
    {
      type: 'assign',
      codeRef: 'mask',
      variables: { i, mask: toUint32(mask) },
      message: i === BIT_WIDTH ? 'mask = 0 (i == 32)' : `mask = ~0 << ${i} = ${toUint32(mask)} (as unsigned)`,
      explanation:
        i === BIT_WIDTH
          ? 'A shift by the full width is not allowed: it is undefined in C and C++, and Java would shift by 32 % 32 = 0. So i = 32 gets the empty mask directly.'
          : `~0 is 32 ones. Shifting it left by ${i} brings in ${i} zero${i === 1 ? '' : 's'} on the right: 0 in the positions to clear, 1 in all the others.`,
      actionLabel: 'Mask',
    },
    [source, maskRow]
  );
  push(
    {
      type: 'update',
      codeRef: 'apply',
      variables: { result },
      message: `result = n & mask = ${result}`,
      explanation: 'AND with 0 clears a bit and AND with 1 keeps it.',
      actionLabel: 'n & mask',
    },
    rows
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, i, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: 'One shift and one AND: O(1) time and O(1) space.',
      actionLabel: 'Done',
    },
    rows,
    `Clear the last ${i} bit${i === 1 ? '' : 's'} of ${n}: ${result}`
  );
  return steps;
}

export const bitClearLastIDefinition: AlgorithmDefinition = {
  id: 'bit-clear-last-i',
  name: 'Clear Last i Bits',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'n & (~0 << i): clears the i lowest bit positions.',
  description: `To clear the i lowest positions, AND n with ~0 << i: 32 ones with i zeros shifted in on the right. i can be anything from 0 to 32. i = 0 changes nothing, and i = 32 clears every bit, so it gets an empty mask directly, because no language here can safely shift by the full width. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Rounding down to a multiple of 2^i'),
  defaultInput: [31, 3],
  inputSpec: {
    numbers: [valueField('n'), positionField('i', 'How many low bits to clear: a whole number from 0 to 32', BIT_WIDTH)],
    numberExamples: [[31, 3], [31, 0], [31, 32], [-1, 4], [-1, 31], [-1, 32], [0, 8], [1024, 10], [1024, 11], [2147483647, 16], [-2147483648, 31]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t clearLastBits(int32_t n, int i) {
    // i: 0 to 32. Shifting by 32 is undefined, so i == 32 gets its mask directly
    uint32_t mask = (i == 32) ? 0u : (UINT32_MAX << i);
    int32_t result = (int32_t)((uint32_t)n & mask);
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t clearLastBits(int32_t n, int i) {
    // i: 0 to 32. Shifting by 32 is undefined, so i == 32 gets its mask directly
    uint32_t mask = (i == 32) ? 0u : (UINT32_MAX << i);
    int32_t result = (int32_t)((uint32_t)n & mask);
    return result;
}`,
    java: `${javaBitsHead('ClearLastBits')}    static int clearLastBits(int n, int i) {
        // i: 0 to 32. Java would shift by 32 % 32 = 0, so i == 32 gets its mask directly
        int mask = (i == 32) ? 0 : (~0 << i);
        int result = n & mask;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def clear_last_bits(n, i):
    # i: 0 to 32. The mask is cut to 32 bits; i == 32 leaves it empty
    mask = 0 if i == 32 else (MASK32 << i) & MASK32
    result = to_int32(n & mask)
    return result`,
  },

  lineMap: {
    c: { start: 4, mask: 6, apply: 7, done: 8 },
    cpp: { start: 5, mask: 7, apply: 8, done: 9 },
    java: { start: 3, mask: 5, apply: 6, done: 7 },
    python: { start: 8, mask: 10, apply: 11, done: 12 },
  },

  generateSteps: generateClearLastSteps,
};
