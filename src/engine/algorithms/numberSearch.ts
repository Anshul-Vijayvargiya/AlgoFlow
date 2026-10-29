import type { NumberSearchProbe, NumberSearchView } from '../../types/algorithm';

/**
 * Shared by the binary searches over whole numbers (Sqrt(x), Valid Perfect Square, Arranging Coins).
 *
 * The inputs go up to INT_MAX, so lo, hi and mid stay well within a JS number, but the products the listings compute
 * in 64 bits (mid × mid, mid × (mid + 1) / 2) can reach ~4.6 × 10^18, beyond a JS number's exact range (2^53): they
 * are computed with bigint and kept as numbers when they fit, else as exact decimal strings.
 */
export const INT_MAX = 2_147_483_647;

/** a whole number from bigint: a number when exact, else its decimal digits */
export const exactValue = (v: bigint): number | string => (v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString());

/** how a computed value compares with the target */
export const relationOf = (value: bigint, target: number): NumberSearchProbe['relation'] =>
  value < BigInt(target) ? '<' : value > BigInt(target) ? '>' : '=';

/**
 * The one input a search takes: exactly one whole number from 0 to INT_MAX (the input field enforces this; a direct
 * call with anything else is refused rather than traced).
 */
export function singleWholeNumber(input: number[], algorithm: string, name: string): number {
  if (input.length !== 1 || !Number.isInteger(input[0]) || input[0] < 0 || input[0] > INT_MAX) {
    throw new RangeError(`${algorithm} takes one whole number ${name} from 0 to ${INT_MAX}.`);
  }
  return input[0];
}

/** the search view for a step: the range still searched over the original 0 … target range */
export const searchView = (
  target: number,
  valueLabel: string,
  lo: number,
  hi: number,
  probes: readonly NumberSearchProbe[],
  mid?: number
): NumberSearchView => ({ from: 0, to: target, lo, hi, ...(mid !== undefined ? { mid } : {}), target, valueLabel, probes: [...probes] });
