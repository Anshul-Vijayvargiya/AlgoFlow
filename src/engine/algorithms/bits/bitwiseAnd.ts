import type { AlgorithmDefinition } from '../../../types/algorithm';
import { binaryOpSteps, bitComplexity, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, PY_BITS_HEAD, valueField } from './bitTrace';

/** Binary AND: a result bit is 1 only where both input bits are 1. */
export const bitwiseAndDefinition: AlgorithmDefinition = {
  id: 'bitwise-and',
  name: 'Binary AND',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: 'a & b: a result bit is 1 only where both input bits are 1.',
  description: `The bitwise AND compares two 32-bit values position by position: a result bit is 1 only where both input bits are 1. It is how a mask keeps some bits and clears the rest. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Keeping only the bits a mask selects'),
  defaultInput: [12, 10],
  inputSpec: {
    numbers: [valueField('a'), valueField('b')],
    numberExamples: [[12, 10], [0, 0], [255, 15], [-1, 255], [-8, 12], [1024, 1024], [2147483647, -1], [-2147483648, -1]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t bitwiseAnd(int32_t a, int32_t b) {
    int32_t result = a & b;
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t bitwiseAnd(int32_t a, int32_t b) {
    int32_t result = a & b;
    return result;
}`,
    java: `${javaBitsHead('BitwiseAnd')}    static int bitwiseAnd(int a, int b) {
        int result = a & b;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def bitwise_and(a, b):
    result = to_int32(a & b)
    return result`,
  },

  // Every bit is worked out by the one & on the result line.
  lineMap: {
    c: { start: 4, 'eval-bit': 5, done: 6 },
    cpp: { start: 5, 'eval-bit': 6, done: 7 },
    java: { start: 3, 'eval-bit': 4, done: 5 },
    python: { start: 8, 'eval-bit': 9, done: 10 },
  },

  generateSteps: input =>
    binaryOpSteps(
      bitwiseAndDefinition,
      {
        symbol: '&',
        apply: (a, b) => (a & b) as 0 | 1,
        why: (a, b, r) => (r ? 'Both bits are 1, so the result bit is 1.' : `The result bit is 1 only if both bits are 1; here ${a === 0 && b === 0 ? 'neither is' : 'one of them is 0'}, so it is 0.`),
      },
      input
    ),
};
