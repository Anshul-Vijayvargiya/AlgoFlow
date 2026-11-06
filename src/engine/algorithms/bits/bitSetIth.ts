import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, positionField, PY_BITS_HEAD, toInt32, toUint32, valueField } from './bitTrace';

/** Set i-th Bit: OR with a mask that has a single 1, at position i. */
function generateSetIthSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitSetIthDefinition, input);
  const [n, i] = input;
  const { steps, push, finish } = bitRecorder('n | (1 << i)');
  const mask = toInt32(1 << i);
  const result = toInt32(n | mask);
  const old = bitAt(n, i);
  const source = bitRow('n', 'n', 'input', n, { [i]: 'selected' });
  const maskRow = bitRow('mask', '1 << i', 'mask', mask, { [i]: 'selected' });
  const rows = [source, maskRow, bitRow('result', 'n | (1 << i)', 'output', result, { [i]: 'set' })];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n, i, 'bit now': old },
      message: `setBit(n, i), where n = ${n} and i = ${i}`,
      explanation: `Make the bit at position ${i} a 1 and leave every other bit as it is. It is ${old} now.`,
      actionLabel: 'Start',
    },
    [source],
    { position: i }
  );
  push(
    {
      type: 'assign',
      codeRef: 'mask',
      variables: { mask: toUint32(mask) },
      message: `mask = 1 << ${i} = ${toUint32(mask)} (as unsigned)`,
      explanation: `The mask has a single 1, at position ${i}. The listings build it from an unsigned 1 or within a fixed width, so i = 31 is safe too.`,
      actionLabel: '1 << i',
    },
    [source, maskRow],
    { position: i }
  );
  push(
    {
      type: 'update',
      codeRef: 'apply',
      variables: { result },
      message: `result = n | mask = ${result}`,
      explanation: `OR with 0 keeps a bit and OR with 1 makes it 1, so only position ${i} can change.${old ? ' It was already 1, so nothing changes.' : ' It goes from 0 to 1.'}`,
      actionLabel: 'n | mask',
    },
    rows,
    { position: i }
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, i, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: 'One shift and one OR: O(1) time and O(1) space.',
      actionLabel: 'Done',
    },
    rows,
    `Set bit ${i} of ${n}: ${result}`
  );
  return steps;
}

export const bitSetIthDefinition: AlgorithmDefinition = {
  id: 'bit-set-ith',
  name: 'Set i-th Bit',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'n | (1 << i): makes the bit at position i a 1.',
  description: `To make the bit at position i a 1, OR n with a mask that has a single 1 at that position. OR with 0 leaves a bit alone, so no other bit changes. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Turning on one flag'),
  defaultInput: [8, 1],
  inputSpec: {
    numbers: [valueField('n'), positionField('i', 'The bit position: a whole number from 0 to 31, counted from the right')],
    numberExamples: [[8, 1], [0, 0], [0, 31], [8, 3], [-1, 5], [-8, 0], [2147483647, 31], [-2147483648, 31]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t setBit(int32_t n, int i) {
    // i: 0 to 31. The mask is unsigned, so i = 31 is defined
    uint32_t mask = UINT32_C(1) << i;
    int32_t result = (int32_t)((uint32_t)n | mask);
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t setBit(int32_t n, int i) {
    // i: 0 to 31. The mask is unsigned, so i = 31 is defined
    uint32_t mask = UINT32_C(1) << i;
    int32_t result = (int32_t)((uint32_t)n | mask);
    return result;
}`,
    java: `${javaBitsHead('SetBit')}    static int setBit(int n, int i) {
        // i: 0 to 31
        int mask = 1 << i;
        int result = n | mask;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def set_bit(n, i):
    # i: 0 to 31
    mask = 1 << i
    result = to_int32((n & MASK32) | mask)
    return result`,
  },

  lineMap: {
    c: { start: 4, mask: 6, apply: 7, done: 8 },
    cpp: { start: 5, mask: 7, apply: 8, done: 9 },
    java: { start: 3, mask: 5, apply: 6, done: 7 },
    python: { start: 8, mask: 10, apply: 11, done: 12 },
  },

  generateSteps: generateSetIthSteps,
};
