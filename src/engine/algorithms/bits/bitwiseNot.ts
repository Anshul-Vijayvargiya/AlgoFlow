import type { AlgorithmDefinition, ExecutionStep } from '../../../types/algorithm';
import { BIT_WIDTH, bitAt, bitComplexity, bitRecorder, bitRow, checkBitInput, COMPLEXITY_NOTE, C_BITS_HEAD, CPP_BITS_HEAD, javaBitsHead, onesSet, PY_BITS_HEAD, toInt32, toUint32, valueField } from './bitTrace';

/** Binary One's Complement: every one of the 32 bits is inverted. In two's complement, ~a equals -a - 1. */
function generateNotSteps(input: number[]): ExecutionStep[] {
  checkBitInput(bitwiseNotDefinition, input);
  const [a] = input;
  const { steps, push, finish } = bitRecorder('~a');
  const source = (position?: number) => bitRow('a', 'a', 'input', a, position === undefined ? undefined : { [position]: 'selected' });

  push(
    {
      type: 'init',
      codeRef: 'start',
      variables: { a },
      message: `~a, where a = ${a}`,
      explanation: `~ inverts all 32 bits of a, including the leading zeros and the sign bit. The width matters: inverting a value with a different number of bits would give a different result.`,
      actionLabel: 'Start',
    },
    [source(), bitRow('result', '~a', 'output', 0, undefined, 0)]
  );

  let partial = 0;
  for (let p = 0; p < BIT_WIDTH; p++) {
    const x = bitAt(a, p);
    const r = x ? 0 : 1;
    if (r) partial |= 1 << p;
    push(
      {
        type: 'update',
        codeRef: 'eval-bit',
        variables: { position: p, 'a bit': x, 'result bit': r },
        message: `bit ${p}: ~${x} = ${r}`,
        explanation: `The bit at position ${p} is ${x}, so the result has ${r} there.`,
        actionLabel: `Bit ${p}`,
      },
      [source(p), bitRow('result', '~a', 'output', partial, { [p]: 'flipped' }, p + 1)],
      { position: p }
    );
  }

  const result = toInt32(partial);
  finish(
    {
      codeRef: 'done',
      variables: { a, result, 'result (unsigned)': toUint32(result) },
      message: `return ${result}`,
      explanation: `All 32 bits are inverted. In two's complement ~a is always -a - 1, here ${result}. The processor does this in one operation: O(1) time and O(1) space.`,
      actionLabel: 'Done',
    },
    [source(), bitRow('result', '~a', 'output', result, onesSet(result))],
    `~${a} = ${result}`
  );
  return steps;
}

export const bitwiseNotDefinition: AlgorithmDefinition = {
  id: 'bitwise-not',
  name: "Binary One's Complement",
  category: 'BIT_MANIPULATION',
  visual: 'bits',
  subtitle: '~a: every one of the 32 bits is inverted.',
  description: `The one's complement inverts every bit of a value: each 0 becomes 1 and each 1 becomes 0. It is defined here on exactly 32 bits, read as signed two's complement, where ~a always equals -a - 1. ${COMPLEXITY_NOTE}`,
  complexity: bitComplexity('Inverting every bit, and building masks such as ~(1 << i)'),
  defaultInput: [12],
  inputSpec: {
    numbers: [valueField('a')],
    numberExamples: [[12], [0], [-1], [1], [255], [-13], [2147483647], [-2147483648]],
  },

  code: {
    c: `${C_BITS_HEAD}int32_t bitwiseNot(int32_t a) {
    int32_t result = ~a;
    return result;
}`,
    cpp: `${CPP_BITS_HEAD}int32_t bitwiseNot(int32_t a) {
    int32_t result = ~a;
    return result;
}`,
    java: `${javaBitsHead('BitwiseNot')}    static int bitwiseNot(int a) {
        int result = ~a;
        return result;
    }
}`,
    python: `${PY_BITS_HEAD}def bitwise_not(a):
    result = to_int32(~a)
    return result`,
  },

  // Every bit is inverted by the one ~ on the result line.
  lineMap: {
    c: { start: 4, 'eval-bit': 5, done: 6 },
    cpp: { start: 5, 'eval-bit': 6, done: 7 },
    java: { start: 3, 'eval-bit': 4, done: 5 },
    python: { start: 8, 'eval-bit': 9, done: 10 },
  },

  generateSteps: generateNotSteps,
};
