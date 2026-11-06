import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, positionField, PY_BITS_HEAD, toInt32, toUint32, valueField } from './bitTrace';

/** Update i-th Bit: clear the position first, then OR the new bit into it. */
function generateUpdateIthSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitUpdateIthDefinition, input);
  const [n, i, bit] = input;
  const { steps, push, finish } = bitRecorder('(n & ~(1 << i)) | (bit << i)');
  const old = bitAt(n, i);
  const cleared = toInt32(n & ~(1 << i));
  const placed = toInt32(bit << i);
  const result = toInt32(cleared | placed);
  const newState = bit ? 'set' : 'cleared';
  const source = bitRow('n', 'n', 'input', n, { [i]: 'selected' });
  const clearedRow = bitRow('cleared', 'n & ~(1 << i)', 'intermediate', cleared, { [i]: 'cleared' });
  const placedRow = bitRow('placed', 'bit << i', 'mask', placed, { [i]: newState });
  const rows = [source, clearedRow, placedRow, bitRow('result', '(n & ~(1 << i)) | (bit << i)', 'output', result, { [i]: newState })];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n, i, bit, 'old bit': old },
      message: `updateBit(n, i, bit), where n = ${n}, i = ${i} and bit = ${bit}`,
      explanation: `Write ${bit} at position ${i}, where the old bit is ${old}. OR alone could not write a 0, and AND alone could not write a 1, so the position is cleared first and the new bit is ORed in after.`,
      actionLabel: 'Start',
    },
    [source],
    { position: i }
  );
  push(
    {
      type: 'update',
      codeRef: 'clear',
      variables: { cleared },
      message: `cleared = n & ~(1 << ${i}) = ${cleared}`,
      explanation: `Position ${i} is now 0, whatever it was. All the other bits are unchanged.`,
      actionLabel: 'Clear bit',
    },
    [source, clearedRow],
    { position: i }
  );
  push(
    {
      type: 'assign',
      codeRef: 'place',
      variables: { placed: toUint32(placed) },
      message: `placed = ${bit} << ${i} = ${toUint32(placed)} (as unsigned)`,
      explanation: `The new bit moved to position ${i}: ${bit ? 'a single 1 there' : 'all zeros, since the new bit is 0'}.`,
      actionLabel: 'bit << i',
    },
    [source, clearedRow, placedRow],
    { position: i }
  );
  push(
    {
      type: 'update',
      codeRef: 'combine',
      variables: { result },
      message: `result = cleared | placed = ${result}`,
      explanation: `OR puts the new bit into the cleared position. The bit at position ${i} goes from ${old} to ${bit}${old === bit ? ', so the value does not change' : ''}.`,
      actionLabel: 'cleared | placed',
    },
    rows,
    { position: i }
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, i, 'old bit': old, 'new bit': bit, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: 'Two shifts, one NOT, one AND and one OR: O(1) time and O(1) space.',
      actionLabel: 'Done',
    },
    rows,
    `Bit ${i} of ${n}: old ${old}, new ${bit}, result ${result}`
  );
  return steps;
}

export const bitUpdateIthDefinition: AlgorithmDefinition = {
  id: 'bit-update-ith',
  name: 'Update i-th Bit',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: '(n & ~(1 << i)) | (bit << i): writes a chosen bit at position i.',
  description: `To write a chosen bit at position i, first clear that position with n & ~(1 << i), then OR in bit << i. Clearing first is what makes both a 0 and a 1 possible, and no other bit changes. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Writing one flag to a value known only at run time'),
  defaultInput: [13, 1, 1],
  inputSpec: {
    numbers: [valueField('n'), positionField('i', 'The bit position: a whole number from 0 to 31, counted from the right'), positionField('bit', 'The new bit: 0 or 1', 1)],
    numberExamples: [[13, 1, 1], [13, 2, 0], [13, 2, 1], [0, 0, 1], [0, 31, 1], [-1, 31, 0], [-1, 0, 0], [2147483647, 31, 1], [-2147483648, 31, 0]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t updateBit(int32_t n, int i, int bit) {
    // i: 0 to 31, bit: 0 or 1
    uint32_t cleared = (uint32_t)n & ~(UINT32_C(1) << i);
    uint32_t placed = (uint32_t)bit << i;
    int32_t result = (int32_t)(cleared | placed);
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t updateBit(int32_t n, int i, int bit) {
    // i: 0 to 31, bit: 0 or 1
    uint32_t cleared = (uint32_t)n & ~(UINT32_C(1) << i);
    uint32_t placed = (uint32_t)bit << i;
    int32_t result = (int32_t)(cleared | placed);
    return result;
}`,
    java: `${javaBitsHead('UpdateBit')}    static int updateBit(int n, int i, int bit) {
        // i: 0 to 31, bit: 0 or 1
        int cleared = n & ~(1 << i);
        int placed = bit << i;
        int result = cleared | placed;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def update_bit(n, i, bit):
    # i: 0 to 31, bit: 0 or 1
    cleared = n & ~(1 << i) & MASK32
    placed = bit << i
    result = to_int32(cleared | placed)
    return result`,
  },

  lineMap: {
    c: { start: 4, clear: 6, place: 7, combine: 8, done: 9 },
    cpp: { start: 5, clear: 7, place: 8, combine: 9, done: 10 },
    java: { start: 3, clear: 5, place: 6, combine: 7, done: 8 },
    python: { start: 8, clear: 10, place: 11, combine: 12, done: 13 },
  },

  generateSteps: generateUpdateIthSteps,
};
