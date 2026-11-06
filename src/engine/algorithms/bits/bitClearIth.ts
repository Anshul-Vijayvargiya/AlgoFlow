import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, positionField, PY_BITS_HEAD, toInt32, toUint32, valueField } from './bitTrace';

/** Clear i-th Bit: AND with a mask that has a single 0, at position i. */
function generateClearIthSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitClearIthDefinition, input);
  const [n, i] = input;
  const { steps, push, finish } = bitRecorder('n & ~(1 << i)');
  const one = toInt32(1 << i);
  const mask = ~one;
  const result = toInt32(n & mask);
  const old = bitAt(n, i);
  const source = bitRow('n', 'n', 'input', n, { [i]: 'selected' });
  const oneRow = bitRow('one', '1 << i', 'intermediate', one, { [i]: 'selected' });
  const maskRow = bitRow('mask', '~(1 << i)', 'mask', mask, { [i]: 'cleared' });
  const rows = [source, maskRow, bitRow('result', 'n & ~(1 << i)', 'output', result, { [i]: 'cleared' })];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n, i, 'bit now': old },
      message: `clearBit(n, i), where n = ${n} and i = ${i}`,
      explanation: `Make the bit at position ${i} a 0 and leave every other bit as it is. It is ${old} now.`,
      actionLabel: 'Start',
    },
    [source],
    { position: i }
  );
  push(
    {
      type: 'assign',
      codeRef: 'mask',
      variables: { '1 << i': toUint32(one) },
      message: `1 << ${i} = ${toUint32(one)} (as unsigned)`,
      explanation: `First a value with a single 1, at position ${i}.`,
      actionLabel: '1 << i',
    },
    [source, oneRow],
    { position: i }
  );
  push(
    {
      type: 'assign',
      codeRef: 'mask',
      variables: { mask: toUint32(mask) },
      message: `mask = ~(1 << ${i}) = ${toUint32(mask)} (as unsigned)`,
      explanation: `Inverting it gives the mask: 1 everywhere except a single 0 at position ${i}.`,
      actionLabel: '~(1 << i)',
    },
    [source, oneRow, maskRow],
    { position: i }
  );
  push(
    {
      type: 'update',
      codeRef: 'apply',
      variables: { result },
      message: `result = n & mask = ${result}`,
      explanation: `AND with 1 keeps a bit and AND with 0 makes it 0, so only position ${i} can change.${old ? ' It goes from 1 to 0.' : ' It was already 0, so nothing changes.'}`,
      actionLabel: 'n & mask',
    },
    rows,
    { position: i }
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, i, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: 'One shift, one NOT and one AND: O(1) time and O(1) space.',
      actionLabel: 'Done',
    },
    rows,
    `Clear bit ${i} of ${n}: ${result}`
  );
  return steps;
}

export const bitClearIthDefinition: AlgorithmDefinition = {
  id: 'bit-clear-ith',
  name: 'Clear i-th Bit',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'n & ~(1 << i): makes the bit at position i a 0.',
  description: `To make the bit at position i a 0, AND n with a mask that is 1 everywhere except at that position: the inverse of 1 << i. AND with 1 leaves a bit alone, so no other bit changes. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Turning off one flag'),
  defaultInput: [13, 2],
  inputSpec: {
    numbers: [valueField('n'), positionField('i', 'The bit position: a whole number from 0 to 31, counted from the right')],
    numberExamples: [[13, 2], [13, 1], [0, 0], [-1, 0], [-1, 31], [1024, 10], [2147483647, 30], [-2147483648, 31]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t clearBit(int32_t n, int i) {
    // i: 0 to 31. The mask is unsigned, so i = 31 is defined
    uint32_t mask = ~(UINT32_C(1) << i);
    int32_t result = (int32_t)((uint32_t)n & mask);
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t clearBit(int32_t n, int i) {
    // i: 0 to 31. The mask is unsigned, so i = 31 is defined
    uint32_t mask = ~(UINT32_C(1) << i);
    int32_t result = (int32_t)((uint32_t)n & mask);
    return result;
}`,
    java: `${javaBitsHead('ClearBit')}    static int clearBit(int n, int i) {
        // i: 0 to 31
        int mask = ~(1 << i);
        int result = n & mask;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def clear_bit(n, i):
    # i: 0 to 31. Python's ~ has no width, so the mask is cut to 32 bits
    mask = ~(1 << i) & MASK32
    result = to_int32(n & mask)
    return result`,
  },

  // The mask's two steps (the 1, then its inverse) are one statement.
  lineMap: {
    c: { start: 4, mask: 6, apply: 7, done: 8 },
    cpp: { start: 5, mask: 7, apply: 8, done: 9 },
    java: { start: 3, mask: 5, apply: 6, done: 7 },
    python: { start: 8, mask: 10, apply: 11, done: 12 },
  },

  generateSteps: generateClearIthSteps,
};
