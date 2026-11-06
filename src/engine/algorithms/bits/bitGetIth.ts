import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, positionField, toInt32, valueField } from './bitTrace';

/** Get i-th Bit: move the bit down to position 0, then keep only it. */
function generateGetIthSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitGetIthDefinition, input);
  const [n, i] = input;
  const { steps, push, finish } = bitRecorder('(n >> i) & 1');
  const bit = bitAt(n, i);
  const shifted = toInt32(n >>> i);
  const source = bitRow('n', 'n', 'input', n, { [i]: 'selected' });
  const moved = bitRow('shifted', 'n >> i', 'intermediate', shifted, { 0: 'selected' });
  const rows = [source, moved, bitRow('mask', '1', 'mask', 1, { 0: 'selected' }), bitRow('result', '(n >> i) & 1', 'output', bit, { 0: bit ? 'set' : 'cleared' })];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n, i },
      message: `getBit(n, i), where n = ${n} and i = ${i}`,
      explanation: `The bit wanted is at position ${i}, counting from 0 at the right. Move it down to position 0, then clear everything else.`,
      actionLabel: 'Start',
    },
    [source],
    { position: i }
  );
  push(
    {
      type: 'update',
      codeRef: 'shift',
      variables: { i, shifted: shifted >>> 0 },
      message: `shifted = n >> ${i} = ${shifted >>> 0} (as unsigned)`,
      explanation: `Shifting right by ${i} brings bit ${i} to position 0. The listings shift as unsigned so zeros fill in; either fill would work, because only position 0 is kept.`,
      actionLabel: `n >> ${i}`,
    },
    [source, moved],
    { position: 0 }
  );
  push(
    {
      type: 'assign',
      codeRef: 'mask',
      variables: { bit },
      message: `bit = shifted & 1 = ${bit}`,
      explanation: `The mask 1 keeps position 0 and clears all the others, so the result is exactly the bit: ${bit}.`,
      actionLabel: '& 1',
    },
    rows,
    { position: 0 }
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, i, bit },
      message: `return ${bit}`,
      explanation: `Bit ${i} of ${n} is ${bit}. One shift and one AND: O(1) time and O(1) space.`,
      actionLabel: `Bit = ${bit}`,
    },
    rows,
    `Bit ${i} of ${n} is ${bit}`
  );
  return steps;
}

export const bitGetIthDefinition: AlgorithmDefinition = {
  id: 'bit-get-ith',
  name: 'Get i-th Bit',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: '(n >> i) & 1: reads the bit at position i.',
  description: `To read the bit at position i, counted from 0 at the right, shift n right by i so that the bit reaches position 0, then AND with 1 to clear everything else. The listings shift as unsigned, so a negative n gives the same answer in all four languages. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Reading one flag or digit of a binary value'),
  defaultInput: [12, 2],
  inputSpec: {
    numbers: [valueField('n'), positionField('i', 'The bit position: a whole number from 0 to 31, counted from the right')],
    numberExamples: [[12, 2], [12, 0], [0, 7], [-1, 31], [-1, 0], [1024, 10], [2147483647, 31], [-2147483648, 31], [-2147483648, 0]],
  },

  code: {
    c: `${C_BITS_HEAD}int getBit(int32_t n, int i) {
    // i: 0 to 31. Shifted as unsigned, so zeros fill in
    uint32_t shifted = (uint32_t)n >> i;
    int bit = shifted & 1u;
    return bit;
}`,
    cpp: `${CPP_BITS_HEAD}int getBit(int32_t n, int i) {
    // i: 0 to 31. Shifted as unsigned, so zeros fill in
    uint32_t shifted = (uint32_t)n >> i;
    int bit = shifted & 1u;
    return bit;
}`,
    java: `${javaBitsHead('GetBit')}    static int getBit(int n, int i) {
        // i: 0 to 31. >>> shifts as unsigned, so zeros fill in
        int shifted = n >>> i;
        int bit = shifted & 1;
        return bit;
    }
}`,
    python: `MASK32 = 0xFFFFFFFF

def get_bit(n, i):
    # i: 0 to 31. Masked to 32 bits first, so zeros fill in
    shifted = (n & MASK32) >> i
    bit = shifted & 1
    return bit`,
  },

  lineMap: {
    c: { start: 4, shift: 6, mask: 7, done: 8 },
    cpp: { start: 5, shift: 7, mask: 8, done: 9 },
    java: { start: 3, shift: 5, mask: 6, done: 7 },
    python: { start: 3, shift: 5, mask: 6, done: 7 },
  },

  generateSteps: generateGetIthSteps,
};
