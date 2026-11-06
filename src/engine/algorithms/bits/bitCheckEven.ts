import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, CPP_BITS_HEAD, javaBitsHead, valueField } from './bitTrace';

/** Check if Even: every bit above position 0 stands for an even amount, so bit 0 alone decides. */
function generateCheckEvenSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitCheckEvenDefinition, input);
  const [n] = input;
  const { steps, push, finish } = bitRecorder('(n & 1) == 0');
  const lsb = bitAt(n, 0);
  const even = lsb === 0;
  const source = bitRow('n', 'n', 'input', n, { 0: 'selected' });
  const rows = [source, bitRow('mask', '1', 'mask', 1, { 0: 'selected' }), bitRow('result', 'n & 1', 'output', lsb, { 0: lsb ? 'set' : 'cleared' })];

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { n },
      message: `isEven(n), where n = ${n}`,
      explanation: 'Every bit above position 0 stands for an even amount (2, 4, 8, …), so only the least significant bit, position 0, can make a number odd. In two\'s complement this holds for negative numbers too.',
      actionLabel: 'Start',
    },
    [source],
    { position: 0 }
  );
  push(
    {
      type: 'assign',
      codeRef: 'lsb',
      variables: { 'n & 1': lsb },
      message: `lsb = n & 1 = ${lsb}`,
      explanation: `The mask 1 has a single 1, at position 0, so AND keeps bit 0 of n and clears every other bit. Bit 0 of ${n} is ${lsb}.`,
      actionLabel: 'n & 1',
    },
    rows,
    { position: 0 }
  );
  push(
    {
      type: 'condition',
      codeRef: 'compare',
      variables: { lsb },
      result: even ? 'true' : 'false',
      message: `lsb == 0?  ${lsb} == 0 → ${even}`,
      explanation: even ? 'The lowest bit is 0, so n is a sum of even amounts.' : 'The lowest bit is 1, so n is an even amount plus 1.',
      actionLabel: even ? 'Bit 0 is 0' : 'Bit 0 is 1',
    },
    rows,
    { position: 0 }
  );
  finish(
    {
      codeRef: 'done',
      variables: { n, lsb, even: String(even) },
      message: `return ${even}`,
      explanation: `${n} is ${even ? 'even' : 'odd'}. One AND and one comparison: O(1) time and O(1) space.`,
      actionLabel: even ? 'EVEN' : 'ODD',
    },
    rows,
    `${even ? 'EVEN' : 'ODD'}: bit 0 of ${n} is ${lsb}`
  );
  return steps;
}

export const bitCheckEvenDefinition: AlgorithmDefinition = {
  id: 'bit-check-even',
  name: 'Check if Even',
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: '(n & 1) == 0: the lowest bit decides whether n is even.',
  description: `A number is even exactly when its least significant bit is 0, because every other bit stands for an even amount. n & 1 keeps only that bit, and in two's complement this works for negative numbers too. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Testing parity without division'),
  defaultInput: [6],
  inputSpec: {
    numbers: [valueField('n')],
    numberExamples: [[6], [7], [0], [1], [-1], [-4], [1024], [2147483647], [-2147483648]],
  },

  code: {
    c: `#include <stdbool.h>
#include <stdint.h>

// int32_t: exactly 32 bits, two's complement
bool isEven(int32_t n) {
    int32_t lsb = n & 1;
    return lsb == 0;
}`,
    cpp: `${CPP_BITS_HEAD}bool isEven(int32_t n) {
    int32_t lsb = n & 1;
    return lsb == 0;
}`,
    java: `${javaBitsHead('CheckEven')}    static boolean isEven(int n) {
        int lsb = n & 1;
        return lsb == 0;
    }
}`,
    python: `# n & 1 reads bit 0 of a negative n as two's complement too, so no mask is needed here
def is_even(n):
    lsb = n & 1
    return lsb == 0`,
  },

  // The comparison and the answer are the same return statement.
  lineMap: {
    c: { start: 5, lsb: 6, compare: 7, done: 7 },
    cpp: { start: 5, lsb: 6, compare: 7, done: 7 },
    java: { start: 3, lsb: 4, compare: 5, done: 5 },
    python: { start: 2, lsb: 3, compare: 4, done: 4 },
  },

  generateSteps: generateCheckEvenSteps,
};
