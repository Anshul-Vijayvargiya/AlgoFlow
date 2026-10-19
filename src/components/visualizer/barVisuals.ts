/**
 * barVisuals — pure mapping from the CURRENT ExecutionStep to what each bar should show.
 *
 * Nothing here re-runs or re-derives algorithm state: it only reads fields the step already
 * carries (type, indices, pointers, sortedIndices, extraInfo, comparedValues, result).
 *
 * WHICH INDICES ARE EMPHASIZED, AND WHY
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  step.type                       indices →        why
 *  compare                         compare          these bars hold the values being compared
 *  swap                            swap             these two bars exchange values (state is post-swap)
 *  found                           found            the bar(s) that satisfy the search
 *  assign / update                 assign           bars read or written by the assignment
 *  condition / loop-condition /    focus            the bars the condition is looking at (outline only)
 *   loop-start / increment /
 *   decrement / return / init /
 *   complete / not-found
 *  sorted                          (ignored)        sortedIndices already shows the locked bars
 *
 *  pointers.minIdx                 min              current minimum candidate (Selection Sort)
 *  pointers.inserted               insert           insertion position (Insertion Sort)
 *  extraInfo.pivotIndex            pivot            Quick Sort pivot — wins over compare so the pivot stays visible
 *  sortedIndices                   sorted | found   locked-in bars (final position); shown as "found" when the run is a
 *                                                   successful search
 *  sortedPrefixIndices             prefix           sorted relative to each other but not final (Insertion Sort's prefix)
 *
 *  Priority when several apply: found > swap > pivot > compare > min/insert > assign > focus > sorted / prefix.
 *
 *  Bars outside the current working range (extraInfo.subRange, else pointers low/high, else
 *  left/right) are dimmed, but locked (sorted/found) bars never are.
 *
 *  A pointer is drawn under a bar only if its value is an integer inside the array. Anything else
 *  (e.g. j = -1, right = -1, k = n) is reported in `offArray` and is never turned into a visual element.
 */
import type { ExecutionStep } from '../../types/algorithm';

export type BarRole =
  | 'default'
  | 'sorted'
  | 'prefix'
  | 'focus'
  | 'assign'
  | 'min'
  | 'insert'
  | 'compare'
  | 'pivot'
  | 'swap'
  | 'found';

export type Outcome = 'sorted' | 'found' | 'not-found' | 'complete' | 'empty';

export interface BarVisual {
  index: number;
  value: number;
  role: BarRole;
  /** false → outside the current working range; rendered dimmed */
  inRange: boolean;
  /** pointer labels sitting on this index, in a stable order */
  pointers: string[];
}

export interface OffArrayPointer {
  name: string;
  value: number;
}

export interface StepVisuals {
  bars: BarVisual[];
  offArray: OffArrayPointer[];
  /** inclusive working range, when the step defines one */
  range: [number, number] | null;
}

const RANK: Record<BarRole, number> = {
  default: 0,
  sorted: 1,
  // never on the same bar as sorted (the two index lists are disjoint)
  prefix: 1,
  focus: 2,
  assign: 3,
  min: 4,
  insert: 4,
  compare: 5,
  pivot: 6,
  swap: 7,
  found: 8,
};

/** Order pointer labels appear in when several share an index. */
const POINTER_ORDER = ['low', 'l', 'left', 'i', 'j', 'j+1', 'minIdx', 'mid', 'm', 'k', 'pi', 'pivotIndex', 'inserted', 'right', 'r', 'high'];

export const POINTER_LABELS: Record<string, string> = {
  minIdx: 'min',
  pivotIndex: 'pivot',
  inserted: 'ins',
};

export const pointerLabel = (name: string) => POINTER_LABELS[name] ?? name;

const ROLE_BY_TYPE: Partial<Record<ExecutionStep['type'], BarRole>> = {
  compare: 'compare',
  swap: 'swap',
  found: 'found',
  assign: 'assign',
  update: 'assign',
  condition: 'focus',
  'loop-condition': 'focus',
  'loop-start': 'focus',
  increment: 'focus',
  decrement: 'focus',
  return: 'focus',
  init: 'focus',
  complete: 'focus',
  'not-found': 'focus',
};

const isIndex = (v: unknown, n: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;

export function deriveOutcome(steps: ExecutionStep[], index: number): Outcome | null {
  const step = steps[index];
  if (!step || step.type !== 'complete') return null;
  const prev = steps[index - 1];
  if (prev?.type === 'found') return 'found';
  if (prev?.type === 'not-found') return 'not-found';
  const n = step.state.length;
  if (n === 0) return 'empty';
  if ((step.sortedIndices?.length ?? 0) === n) return 'sorted';
  return 'complete';
}

export function deriveStepVisuals(
  step: ExecutionStep,
  options: { positionPointers?: string[]; outcome?: Outcome | null } = {}
): StepVisuals {
  const n = step.state.length;
  const roles: BarRole[] = Array(n).fill('default');
  const raise = (idx: number, role: BarRole) => {
    if (isIndex(idx, n) && RANK[role] > RANK[roles[idx]]) roles[idx] = role;
  };

  // locked bars
  const lockedRole: BarRole = options.outcome === 'found' ? 'found' : 'sorted';
  for (const i of step.sortedIndices ?? []) raise(i, lockedRole);
  for (const i of step.sortedPrefixIndices ?? []) raise(i, 'prefix');

  // event bars
  const typeRole = step.type === 'sorted' ? undefined : ROLE_BY_TYPE[step.type];
  if (typeRole) for (const i of step.indices ?? []) raise(i, typeRole);

  // semantic bars carried by pointers / extraInfo
  const p = step.pointers ?? {};
  if (p.minIdx !== undefined) raise(p.minIdx, 'min');
  if (p.inserted !== undefined) raise(p.inserted, 'insert');
  if (step.extraInfo?.pivotIndex !== undefined) raise(step.extraInfo.pivotIndex, 'pivot');

  // working range
  let range: [number, number] | null = null;
  if (step.extraInfo?.subRange) range = step.extraInfo.subRange;
  else if (typeof p.low === 'number' && typeof p.high === 'number') range = [p.low, p.high];
  else if (typeof p.left === 'number' && typeof p.right === 'number') range = [p.left, p.right];

  // pointers under bars
  const allowed = options.positionPointers;
  const byIndex = new Map<number, string[]>();
  const offArray: OffArrayPointer[] = [];
  const names = Object.keys(p).filter(k => !allowed || allowed.includes(k));
  names.sort((a, b) => {
    const ia = POINTER_ORDER.indexOf(a);
    const ib = POINTER_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  for (const name of names) {
    const value = p[name];
    if (isIndex(value, n)) {
      const list = byIndex.get(value) ?? [];
      list.push(pointerLabel(name));
      byIndex.set(value, list);
    } else {
      offArray.push({ name, value });
    }
  }

  const bars: BarVisual[] = step.state.map((value, index) => {
    const role = roles[index];
    const locked = role === 'sorted' || role === 'found';
    const inRange = !range || locked || (index >= range[0] && index <= range[1]);
    return { index, value, role, inRange, pointers: byIndex.get(index) ?? [] };
  });

  return { bars, offArray, range };
}

/**
 * How long a bar animates to its new height / colour (ms). 300 ms at the default speed and slower; when playback is
 * faster, 60% of the step interval, so the bars always reach the current step's state before the next step replaces
 * it. Playback timing itself is never changed.
 */
export const BAR_TRANSITION_MS = 300;
export const barTransitionMs = (stepIntervalMs?: number) =>
  stepIntervalMs === undefined ? BAR_TRANSITION_MS : Math.min(BAR_TRANSITION_MS, Math.round(stepIntervalMs * 0.6));

/**
 * Bar height (% of the plot area) for a value. Non-negative arrays keep proportional heights
 * (value / max). When any value is negative, heights are scaled linearly between the minimum and the
 * maximum so that ordering is always visible (a plain value/max would flatten every negative bar).
 */
export const barHeightPercent = (values: number[]) => {
  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  return (value: number) =>
    min >= 0
      ? Math.max(12, Math.min(88, (value / max) * 100))
      : 12 + ((value - min) / (max - min || 1)) * 76;
};
