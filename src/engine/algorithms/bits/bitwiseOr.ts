import type { AlgorithmDefinition } from '../../../types/algorithm';
import { binaryOpSteps, bitComplexity, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, PY_BITS_HEAD, valueField } from './bitTrace';

/** Binary OR: a result bit is 1 where either input bit is 1. */
export const bitwiseOrDefinition: AlgorithmDefinition = {
  id: 'bitwise-or',
  name: 'Binary OR',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'a | b: a result bit is 1 where either input bit is 1.',
  description: `The bitwise OR compares two 32-bit values position by position: a result bit is 1 where at least one input bit is 1. It is how a mask turns bits on without touching the others. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Turning on the bits a mask selects'),
  defaultInput: [12, 10],
  inputSpec: {
    numbers: [valueField('a'), valueField('b')],
    numberExamples: [[12, 10], [0, 0], [240, 15], [-1, 255], [-8, 3], [1024, 1], [2147483647, -2147483648], [0, -1]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t bitwiseOr(int32_t a, int32_t b) {
    int32_t result = a | b;
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t bitwiseOr(int32_t a, int32_t b) {
    int32_t result = a | b;
    return result;
}`,
    java: `${javaBitsHead('BitwiseOr')}    static int bitwiseOr(int a, int b) {
        int result = a | b;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def bitwise_or(a, b):
    result = to_int32(a | b)
    return result`,
  },

  // Every bit is worked out by the one | on the result line.
  lineMap: {
    c: { start: 4, 'eval-bit': 5, done: 6 },
    cpp: { start: 5, 'eval-bit': 6, done: 7 },
    java: { start: 3, 'eval-bit': 4, done: 5 },
    python: { start: 8, 'eval-bit': 9, done: 10 },
  },

  generateSteps: input =>
    binaryOpSteps(
      bitwiseOrDefinition,
      {
        symbol: '|',
        apply: (a, b) => (a | b) as 0 | 1,
        why: (a, b, r) => (r ? `${a === 1 && b === 1 ? 'Both bits are 1' : 'One of the bits is 1'}, so the result bit is 1.` : 'Both bits are 0, so the result bit is 0.'),
      },
      input
    ),
};
