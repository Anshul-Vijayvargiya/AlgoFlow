import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { BIT_WIDTH, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, positionField, PY_BITS_HEAD, statesFrom, toInt32, toUint32, valueField } from './bitTrace';

/**
 * Clear Range of Bits: clear positions l through r, inclusive, with 0 <= l <= r <= 31. The range's width can be the
 * full 32 bits (l = 0, r = 31), and 1 << 32 is not allowed, so that case gets its ones directly.
 */
function generateClearRangeSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitClearRangeDefinition, input);
  const [n, l, r] = input;
  const { steps, push, finish } = bitRecorder('n & ~(ones << l)');
  const width = r - l + 1;
  const ones = width === BIT_WIDTH ? -1 : toInt32(2 ** width - 1);
  const mask = ~(ones << l);
  const result = toInt32(n & mask);
  const source = bitRow('n', 'n', 'input', n, statesFrom(l, r, 'selected'));
  const onesRow = bitRow('ones', width === BIT_WIDTH ? 'ones: all 32 bits' : 'ones = (1 << width) - 1', 'intermediate', ones, statesFrom(0, width - 1, 'selected'));
  const maskRow = bitRow('mask', '~(ones << l)', 'mask', mask, statesFrom(l, r, 'cleared'));
  const rows = [source, maskRow, bitRow('result', 'n & mask', 'output', result, statesFrom(l, r, 'cleared'))];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n, l, r },
      message: `clearRange(n, l, r), where n = ${n}, l = ${l} and r = ${r}`,
      explanation: `Clear positions ${l} through ${r}, both included, and leave every other bit as it is. l is the lower position and r the upper one.`,
      actionLabel: 'Start',
    },
    [source]
  );
  push(
    {
      type: 'assign',
      codeRef: 'width',
      variables: { width },
      message: `width = r - l + 1 = ${r} - ${l} + 1 = ${width}`,
      explanation: `The range covers ${width} position${width === 1 ? '' : 's'}.`,
      actionLabel: 'Width',
    },
    [source]
  );
  push(
    {
      type: 'assign',
      codeRef: 'ones',
      variables: { width, ones: toUint32(ones) },
      message: width === BIT_WIDTH ? 'ones = all 32 bits (width == 32)' : `ones = (1 << ${width}) - 1 = ${toUint32(ones)}`,
      explanation:
        width === BIT_WIDTH
          ? 'The range is the whole value. 1 << 32 is not allowed, so all 32 ones are written directly.'
          : `Subtracting 1 from a single 1 at position ${width} leaves ${width} one${width === 1 ? '' : 's'} at the bottom. The listings stay in 32 bits even at width 31, so this cannot overflow.`,
      actionLabel: 'Ones',
    },
    [source, onesRow]
  );
  push(
    {
      type: 'assign',
      codeRef: 'mask',
      variables: { l, mask: toUint32(mask) },
      message: `mask = ~(ones << ${l}) = ${toUint32(mask)} (as unsigned)`,
      explanation: `Shifting the ones left by ${l} lines them up with the range, and inverting gives the mask: 0 in positions ${l} to ${r}, 1 everywhere else.`,
      actionLabel: 'Mask',
    },
    [source, onesRow, maskRow]
  );
  push(
    {
      type: 'update',
      codeRef: 'apply',
      variables: { result },
      message: `result = n & mask = ${result}`,
      explanation: 'AND with 0 clears the bits in the range, and AND with 1 keeps all the others.',
      actionLabel: 'n & mask',
    },
    rows
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, l, r, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: 'A few shifts and one AND: O(1) time and O(1) space.',
      actionLabel: 'Done',
    },
    rows,
    `Clear bits ${l} to ${r} of ${n}: ${result}`
  );
  return steps;
}

export const bitClearRangeDefinition: AlgorithmDefinition = {
  id: 'bit-clear-range',
  name: 'Clear Range of Bits',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'Clears positions l through r with a mask that cannot overflow.',
  description: `To clear positions l through r, both included, build width = r - l + 1 ones, shift them up to position l and invert: the mask has 0 in the range and 1 everywhere else. l and r must satisfy 0 <= l <= r <= 31. When the range is all 32 bits, 1 << 32 is not allowed, so those ones are written directly. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Clearing a field inside a packed value'),
  defaultInput: [255, 2, 5],
  inputSpec: {
    numbers: [valueField('n'), positionField('l', 'The lower bit position: a whole number from 0 to 31, not above r'), positionField('r', 'The upper bit position: a whole number from 0 to 31, not below l')],
    numberRange: { low: 1, high: 2 },
    numberExamples: [[255, 2, 5], [-1, 0, 31], [-1, 0, 30], [-1, 1, 31], [-1, 31, 31], [255, 0, 0], [0, 4, 8], [1024, 10, 10], [2147483647, 16, 31], [-2147483648, 31, 31]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t clearRange(int32_t n, int l, int r) {
    int width = r - l + 1;  // 0 <= l <= r <= 31
    // 1 << 32 is undefined, so a full-width range gets its ones directly
    uint32_t ones = (width == 32) ? UINT32_MAX : ((UINT32_C(1) << width) - 1);
    uint32_t mask = ~(ones << l);
    int32_t result = (int32_t)((uint32_t)n & mask);
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t clearRange(int32_t n, int l, int r) {
    int width = r - l + 1;  // 0 <= l <= r <= 31
    // 1 << 32 is undefined, so a full-width range gets its ones directly
    uint32_t ones = (width == 32) ? UINT32_MAX : ((UINT32_C(1) << width) - 1);
    uint32_t mask = ~(ones << l);
    int32_t result = (int32_t)((uint32_t)n & mask);
    return result;
}`,
    java: `${javaBitsHead('ClearRange')}    static int clearRange(int n, int l, int r) {
        int width = r - l + 1;  // 0 <= l <= r <= 31
        // Java would shift by 32 % 32 = 0, so a full-width range gets its ones directly
        int ones = (width == 32) ? ~0 : ((1 << width) - 1);
        int mask = ~(ones << l);
        int result = n & mask;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def clear_range(n, l, r):
    width = r - l + 1  # 0 <= l <= r <= 31
    # the mask is cut to 32 bits: Python's ~ has no width
    ones = MASK32 if width == 32 else (1 << width) - 1
    mask = ~(ones << l) & MASK32
    result = to_int32(n & mask)
    return result`,
  },

  lineMap: {
    c: { start: 4, width: 5, ones: 7, mask: 8, apply: 9, done: 10 },
    cpp: { start: 5, width: 6, ones: 8, mask: 9, apply: 10, done: 11 },
    java: { start: 3, width: 4, ones: 6, mask: 7, apply: 8, done: 9 },
    python: { start: 8, width: 9, ones: 11, mask: 12, apply: 13, done: 14 },
  },

  generateSteps: generateClearRangeSteps,
};
