import type { AlgorithmDefinition } from '../../../types/algorithm';
import { binaryOpSteps, bitComplexity, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, PY_BITS_HEAD, valueField } from './bitTrace';

/** Binary XOR: a result bit is 1 where the input bits differ. */
export const bitwiseXorDefinition: AlgorithmDefinition = {
  id: 'bitwise-xor',
  name: 'Binary XOR',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'a ^ b: a result bit is 1 where the input bits differ.',
  description: `The bitwise XOR (exclusive or) compares two 32-bit values position by position: a result bit is 1 where the two input bits differ and 0 where they match. So a value XORed with itself is 0, and XORing with a mask flips the bits it selects. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Finding the bits that differ, and flipping the bits a mask selects'),
  defaultInput: [12, 10],
  inputSpec: {
    numbers: [valueField('a'), valueField('b')],
    numberExamples: [[12, 10], [0, 0], [255, 255], [-1, 255], [-8, 12], [1024, 1], [2147483647, -1], [-2147483648, -1]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t bitwiseXor(int32_t a, int32_t b) {
    int32_t result = a ^ b;
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t bitwiseXor(int32_t a, int32_t b) {
    int32_t result = a ^ b;
    return result;
}`,
    java: `${javaBitsHead('BitwiseXor')}    static int bitwiseXor(int a, int b) {
        int result = a ^ b;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def bitwise_xor(a, b):
    result = to_int32(a ^ b)
    return result`,
  },

  // Every bit is worked out by the one ^ on the result line.
  lineMap: {
    c: { start: 4, 'eval-bit': 5, done: 6 },
    cpp: { start: 5, 'eval-bit': 6, done: 7 },
    java: { start: 3, 'eval-bit': 4, done: 5 },
    python: { start: 8, 'eval-bit': 9, done: 10 },
  },

  generateSteps: input =>
    binaryOpSteps(
      bitwiseXorDefinition,
      {
        symbol: '^',
        apply: (a, b) => (a ^ b) as 0 | 1,
        why: (a, _b, r) => (r ? 'The bits differ, so the result bit is 1.' : `The bits are the same (both ${a}), so the result bit is 0.`),
      },
      input
    ),
};
