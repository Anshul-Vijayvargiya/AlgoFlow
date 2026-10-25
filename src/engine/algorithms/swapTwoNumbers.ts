import type { AlgorithmDefinition, ExecutionStep, NumberCell } from '../../types/algorithm';

export const SWAP_MIN = -999;
export const SWAP_MAX = 999;

/**
 * Swapping with a temporary variable: temp keeps a's value while a is overwritten with b, then b takes it from temp.
 * Three assignments whatever the values: O(1) time, and one extra variable: O(1) space.
 */
export const swapTwoNumbersDefinition: AlgorithmDefinition = {
  id: 'swap-two-numbers',
  name: 'Swap of Two Numbers',
  category: 'FUNDAMENTALS',
  visual: 'numbers',
  subtitle: 'Exchanges a and b through a temporary variable.',
  description:
    'To exchange two values, one of them must be saved first: writing a = b straight away would lose a. temp = a saves it, a = b copies b, and b = temp puts the saved value into b. It always takes three assignments and one extra variable.',
  complexity: { best: 'O(1)', average: 'O(1)', worst: 'O(1)', space: 'O(1)', bestFor: 'Exchanging two values in place, the basis of every swap in sorting' },
  defaultInput: [5, 9],
  inputSpec: {
    numbers: [
      { label: 'a', hint: `A whole number from ${SWAP_MIN} to ${SWAP_MAX}`, min: SWAP_MIN, max: SWAP_MAX, random: [1, 99] },
      { label: 'b', hint: `A whole number from ${SWAP_MIN} to ${SWAP_MAX}`, min: SWAP_MIN, max: SWAP_MAX, random: [1, 99] },
    ],
  },

  code: {
    c: `void swapNumbers(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}`,
    cpp: `void swapNumbers(int& a, int& b) {
    int temp = a;
    a = b;
    b = temp;
}`,
    java: `public class SwapNumbers {
    public static int[] swap(int a, int b) {
        int temp = a;
        a = b;
        b = temp;
        return new int[] { a, b };
    }
}`,
    python: `def swap(a, b):
    temp = a
    a = b
    b = temp
    return a, b`,
  },

  lineMap: {
    // C and C++ change the caller's variables and return nothing: the last step highlights the function itself
    c: { 'fn-entry': 1, 'assign-temp': 2, 'assign-a': 3, 'assign-b': 4, 'fn-exit': 1 },
    cpp: { 'fn-entry': 1, 'assign-temp': 2, 'assign-a': 3, 'assign-b': 4, 'fn-exit': 1 },
    java: { 'fn-entry': 2, 'assign-temp': 3, 'assign-a': 4, 'assign-b': 5, 'fn-exit': 6 },
    python: { 'fn-entry': 1, 'assign-temp': 2, 'assign-a': 3, 'assign-b': 4, 'fn-exit': 5 },
  },

  generateSteps: (input: number[]) => {
    // the app validates the fields first; a direct caller with another input gets an explicit refusal
    if (input.length !== 2 || !input.every(v => Number.isInteger(v) && v >= SWAP_MIN && v <= SWAP_MAX)) {
      throw new RangeError(`Swap of Two Numbers: pass exactly two whole numbers a and b from ${SWAP_MIN} to ${SWAP_MAX}.`);
    }
    const [a0, b0] = input;
    let a = a0;
    let b = b0;
    let temp: number | null = null;
    const steps: ExecutionStep[] = [];
    const cells = (changed?: 'a' | 'b' | 'temp', read?: 'a' | 'b' | 'temp'): NumberCell[] =>
      (['a', 'b', 'temp'] as const).map(name => ({
        name,
        value: name === 'a' ? a : name === 'b' ? b : temp,
        ...(name === changed ? { role: 'changed' as const } : name === read ? { role: 'current' as const } : {}),
      }));
    const push = (step: Omit<ExecutionStep, 'id' | 'state'>) => steps.push({ id: steps.length, state: [a, b], ...step });

    push({
      type: 'init',
      codeRef: 'fn-entry',
      variables: { a, b },
      numbers: { cells: cells() },
      message: `Swap a = ${a} and b = ${b}`,
      explanation: 'Writing a = b first would overwrite a, so its value is saved in temp before anything changes.',
      actionLabel: 'Start',
    });

    temp = a;
    push({
      type: 'assign',
      codeRef: 'assign-temp',
      variables: { a, b, temp },
      numbers: { cells: cells('temp', 'a') },
      message: `temp = a  →  temp = ${temp}`,
      explanation: `temp now holds a copy of a (${temp}); a itself is unchanged.`,
      actionLabel: 'temp = a',
    });

    a = b;
    push({
      type: 'assign',
      codeRef: 'assign-a',
      variables: { a, b, temp },
      numbers: { cells: cells('a', 'b') },
      message: `a = b  →  a = ${a}`,
      explanation: `a takes b's value (${a}). Its old value is safe in temp.`,
      actionLabel: 'a = b',
    });

    b = temp;
    push({
      type: 'assign',
      codeRef: 'assign-b',
      variables: { a, b, temp },
      numbers: { cells: cells('b', 'temp') },
      message: `b = temp  →  b = ${b}`,
      explanation: `b takes the saved value (${b}). The two values have been exchanged.`,
      actionLabel: 'b = temp',
    });

    push({
      type: 'complete',
      codeRef: 'fn-exit',
      variables: { a, b },
      numbers: { cells: cells(), result: { kind: 'swapped', text: `Swapped: a = ${a}, b = ${b} (they were a = ${a0}, b = ${b0}).` } },
      message: `Done — a = ${a}, b = ${b}`,
      explanation: 'Three assignments and one temporary variable, whatever the values: O(1) time and O(1) extra space.',
      actionLabel: 'Swapped',
    });
    return steps;
  },
};
