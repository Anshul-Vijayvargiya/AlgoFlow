import React from 'react';
import { Equal } from 'lucide-react';
import type { ExecutionStep, HouseRobberView } from '../../types/algorithm';

interface HouseRobberVisualizerProps {
  currentStep: ExecutionStep;
  /** current playback interval (ms per step); highlight transitions stay shorter than it */
  stepIntervalMs?: number;
}

/**
 * a house in the plan shown (display only). robbed: in the set of houses that reaches the best amount so far; skipped:
 * decided and not in it; waiting: not decided yet
 */
type Plan = 'robbed' | 'skipped' | 'waiting';
/** what the step is doing with a house. current: the house being decided (i); blocked: the house before it, on the rob choice */
type Focus = 'current' | 'blocked' | 'none';
type Tone = 'current' | 'blocked' | Plan;

const TONE: Record<Tone, string> = {
  current: 'bg-amber-500/20 border-amber-400 text-amber-200',
  blocked: 'bg-rose-500/15 border-rose-400 text-rose-200',
  robbed: 'bg-emerald-500/15 border-emerald-500 text-emerald-300',
  skipped: 'bg-slate-800/80 border-slate-600 text-slate-200',
  waiting: 'bg-slate-900/40 border-dashed border-slate-500 text-slate-300',
};

/** what a tone means, in words (the legend and screen readers never rely on colour alone) */
const TONE_TEXT: Record<Tone, string> = {
  current: 'house i: being decided',
  blocked: 'blocked: cannot be robbed if house i is',
  robbed: 'robbed in the plan so far',
  skipped: 'skipped in the plan so far',
  waiting: 'not decided yet',
};
const PLAN_WORD: Record<Plan, string> = { robbed: 'robbed', skipped: 'skipped', waiting: '' };

const VARS = [
  { name: 'prev2', text: 'most money up to two houses back' },
  { name: 'prev1', text: 'most money up to the previous house' },
  { name: 'current', text: 'most money up to this house' },
] as const;

const WINNER_TEXT = { rob: 'rob wins', skip: 'skip wins', tie: 'equal: skip' } as const;

function planOf(view: HouseRobberView, k: number): Plan {
  if (k >= view.best.length) return 'waiting';
  return view.selected.includes(k) ? 'robbed' : 'skipped';
}

function focusOf(view: HouseRobberView, k: number): Focus {
  if (view.blocked === k) return 'blocked';
  if (view.i === k && view.operation !== 'start' && view.operation !== 'done') return 'current';
  return 'none';
}

const list = (xs: readonly number[]) => `[${xs.join(', ')}]`;
const housesText = (houses: readonly number[]) =>
  houses.length === 0 ? 'no houses' : houses.length === 1 ? `house ${houses[0]}` : `houses ${houses.slice(0, -1).join(', ')} and ${houses[houses.length - 1]}`;

/** what the choice area says while no house is being decided */
function idleText(view: HouseRobberView, house: number | null): string {
  if (view.operation === 'done') return 'Every house has been decided: the answer is prev1.';
  if (house !== null) return `House ${house}: rob it, or skip it?`;
  if (view.i !== null) return 'No house is left to decide.';
  return 'The rob and skip choices appear here when the first house is decided.';
}

/**
 * House Robber (visual: 'houses'): the row of houses with their indexes and money, the house being decided and (on the
 * rob choice) the neighbour that robbing it rules out, the rob and skip choices with the winner, and the three variables
 * of the code. Below them, marked DISPLAY ONLY because the O(1)-space code stores neither: the best amount after each
 * house decided so far, and one set of houses that reaches the latest amount, which is also marked on the row. Every
 * house keeps its index and labels with it, so a long row wraps on a phone instead of scrolling. Everything shown comes
 * from the step itself (ExecutionStep.houseRobber and the step's message): the comparison is the step's own words.
 */
export const HouseRobberVisualizer: React.FC<HouseRobberVisualizerProps> = ({ currentStep, stepIntervalMs }) => {
  const view = currentStep.houseRobber;
  if (!view) return null;
  const transitionMs = Math.max(0, Math.min(300, Math.floor((stepIntervalMs ?? 700) * 0.6)));
  const n = view.nums.length;
  const plans = view.nums.map((_, k) => planOf(view, k));
  const focuses = view.nums.map((_, k) => focusOf(view, k));
  const tones: Tone[] = view.nums.map((_, k) => (focuses[k] === 'none' ? plans[k] : focuses[k]));
  const shown = new Set(tones);
  const decided = view.best.length;
  const bestNow = decided > 0 ? view.best[decided - 1] : null;
  const selectedSum = view.selected.reduce((sum, k) => sum + view.nums[k], 0);

  const choice = view.choice;
  const house = view.i !== null && view.i < n ? view.i : null;
  const verdict = choice?.winner ? (choice.winner === 'rob' ? 'rob' : choice.rob === choice.skip ? 'tie' : 'skip') : null;
  /** the choice this step is working out, before there is a winner */
  const evaluating = view.operation === 'rob' ? 'rob' : view.operation === 'skip' ? 'skip' : null;
  // prev2 as the rob choice used it: the step's own prev2 while the max line is evaluated; once prev2 has been
  // shifted, what the step's rob amount says it was
  const onMaxLine = view.operation === 'rob' || view.operation === 'skip' || view.operation === 'max';
  const prev2Used = choice && house !== null ? (onMaxLine && view.prev2 !== null ? view.prev2 : choice.rob - view.nums[house]) : null;
  const blockedInPlan = view.blocked !== undefined && plans[view.blocked] === 'robbed';
  const value = (name: (typeof VARS)[number]['name']) => view[name];
  const choiceTone = (which: 'rob' | 'skip'): Tone => (choice?.winner === which ? 'robbed' : evaluating === which ? 'current' : 'skipped');

  const described = view.nums
    .map((money, k) => {
      const parts = [`house ${k} holds ${money}`];
      if (focuses[k] !== 'none') parts.push(TONE_TEXT[focuses[k] as Tone]);
      if (plans[k] !== 'waiting') parts.push(TONE_TEXT[plans[k]]);
      return parts.join(', ');
    })
    .join('; ');

  return (
    <div className="w-full flex flex-col gap-2" data-testid="houses-visualizer" data-length={n} data-operation={view.operation}>
      <div className="w-full min-h-56 bg-surface/90 border border-cyan-500/15 rounded-2xl px-3 sm:px-6 pt-10 pb-4 relative overflow-hidden shadow-inner flex flex-col gap-3">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--af-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--af-grid)_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

        {currentStep.actionLabel && (
          <span
            data-testid="houses-operation"
            className="absolute top-2 left-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200"
          >
            {currentStep.actionLabel}
          </span>
        )}
        <span
          data-testid="houses-progress"
          className="absolute top-2 right-3 z-10 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-300"
        >
          {view.result ? 'Done' : `${decided} of ${n} decided`}
        </span>

        {/* the houses: each with its index, its place in the plan so far and what the step is doing with it; they wrap */}
        <ol data-testid="houses-row" aria-hidden="true" className="relative z-10 w-full flex flex-wrap justify-center gap-x-1 gap-y-2 font-mono select-none">
          {view.nums.map((money, k) => (
            <li key={k} className="flex flex-col items-center gap-0.5 w-12 sm:w-14">
              <span
                data-house={k}
                data-value={money}
                data-plan={plans[k]}
                data-focus={focuses[k]}
                style={{ transitionDuration: `${transitionMs}ms` }}
                className={`w-full h-11 sm:h-12 flex items-center justify-center rounded-lg border-2 text-sm sm:text-base font-bold tabular-nums transition-colors motion-reduce:transition-none ${TONE[tones[k]]}`}
              >
                {money}
              </span>
              <span className="text-[10px] text-slate-400">{k}</span>
              <span data-plan-word={k} className="text-[10px] leading-none min-h-2.5 text-slate-300">
                {PLAN_WORD[plans[k]]}
              </span>
              <span data-focus-tag={k} className="min-h-3 text-[10px] font-bold leading-none">
                {focuses[k] === 'current' && <span className="text-amber-300">▲ i</span>}
                {focuses[k] === 'blocked' && <span className="text-rose-200">✕ blocked</span>}
              </span>
            </li>
          ))}
        </ol>
        {/* what the two kinds of label under a house refer to: the plan so far is a fact, "blocked" is only the rob choice */}
        {(decided > 0 || view.blocked !== undefined) && (
          <p data-testid="houses-row-key" aria-hidden="true" className="relative z-10 text-center text-[10px] font-mono text-slate-400">
            {decided > 0 && (
              <>
                <span className="text-slate-300">robbed / skipped</span>: the plan so far
              </>
            )}
            {decided > 0 && view.blocked !== undefined && ' · '}
            {view.blocked !== undefined && (
              <>
                <span className="font-bold text-rose-200">✕ blocked</span>: only if house {view.i} is robbed
              </>
            )}
          </p>
        )}
        <p className="sr-only" data-testid="houses-text">
          The houses: {described}.{' '}
          {choice && house !== null && `For house ${house}: robbing gives ${choice.rob}${choice.skip !== undefined ? `, skipping gives ${choice.skip}` : ''}${verdict ? `; ${WINNER_TEXT[verdict]}` : ''}.`}{' '}
          {bestNow !== null && `Shown for explanation only, not stored by the code: the most money so far is ${bestNow}, by robbing ${housesText(view.selected)}.`}
        </p>

        {/* the two choices for house i, as the max line is evaluated; one line of text while no house is being decided */}
        <div
          className="relative z-10 flex flex-col items-center gap-1.5 font-mono text-[11px]"
          data-testid="houses-choice"
          data-house={choice && house !== null ? house : ''}
          data-rob={choice?.rob ?? ''}
          data-skip={choice?.skip ?? ''}
          data-winner={choice?.winner ?? ''}
          data-evaluating={evaluating ?? ''}
        >
          {!choice || house === null ? (
            <p data-testid="houses-choice-idle" className="text-slate-400 text-center">
              {idleText(view, house)}
            </p>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <div data-choice="rob" data-wins={choice.winner === 'rob' ? 'true' : 'false'} data-active={evaluating === 'rob' ? 'true' : 'false'} className={`px-2 py-1 rounded-md border-2 ${TONE[choiceTone('rob')]}`}>
                <p className="font-bold">
                  Rob house {house}
                  {choice.winner === 'rob' && ' — wins'}
                  {evaluating === 'rob' && ' — being worked out'}
                </p>
                <p className="tabular-nums">
                  nums[{house}] + prev2 = {view.nums[house]} + {prev2Used} = {choice.rob}
                </p>
                <p>
                  {house > 0 ? `house ${house - 1} cannot be robbed too` : 'no house before it'}
                  {blockedInPlan && ': it is in the plan so far, and would have to leave it'}
                </p>
              </div>
              <div data-choice="skip" data-wins={choice.winner === 'skip' ? 'true' : 'false'} data-active={evaluating === 'skip' ? 'true' : 'false'} className={`px-2 py-1 rounded-md border-2 ${TONE[choiceTone('skip')]}`}>
                <p className="font-bold">
                  Skip house {house}
                  {choice.winner === 'skip' && ' — wins'}
                  {evaluating === 'skip' && ' — being worked out'}
                </p>
                <p className="tabular-nums">{choice.skip === undefined ? 'prev1 = …' : `prev1 = ${choice.skip}`}</p>
                <p>keep what the houses before it gave</p>
              </div>
            </div>
          )}
        </div>

        {/* the three variables of the code: all it keeps. A name and its value never part; the meaning wraps beside them */}
        <dl className="relative z-10 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-x-3 gap-y-1 text-[11px] font-mono" data-testid="houses-vars">
          {VARS.map(v => (
            <div key={v.name} data-var={v.name} data-value={value(v.name) ?? ''} data-moved={view.moved === v.name || (v.name === 'current' && view.operation === 'max') ? 'true' : 'false'} className="flex items-baseline gap-1">
              <dt className="shrink-0 font-bold text-sky-200">{v.name}</dt>
              <dd className="shrink-0 whitespace-nowrap text-slate-200 tabular-nums">= {value(v.name) ?? '–'}</dd>
              <dd className="min-w-0 text-slate-400">({v.text})</dd>
            </div>
          ))}
        </dl>

        {/* what this step did, in the trace's own words. On the comparison this is where its outcome is stated, once */}
        <div className="relative z-10 min-h-7 flex items-center justify-center" data-testid="houses-note" data-kind={view.operation}>
          <span
            data-testid={view.operation === 'max' ? 'houses-verdict' : undefined}
            className={`px-2 py-1 rounded-md border font-mono font-bold text-[11px] sm:text-xs text-center break-words ${view.operation === 'max' ? TONE.robbed : 'bg-slate-800/80 border-slate-600 text-slate-200'}`}
          >
            {currentStep.message}
          </span>
        </div>

        {/* display only: what the trace remembers so that the answer can be explained. The code keeps none of it */}
        <div className="relative z-10 w-full flex flex-col gap-1.5 text-[11px] font-mono rounded-lg border border-dashed border-slate-500 px-2 py-2" data-testid="houses-display-only">
          <p className="font-bold text-slate-300">Display only — the code does not store these; it keeps only prev2 and prev1</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="houses-best" data-values={view.best.join(',')}>
            <span className="text-slate-400">most money so far:</span>
            {decided === 0 && <span className="text-slate-400">no house decided yet</span>}
            <ol aria-label={`Most money after each house decided: ${list(view.best)}`} className="flex flex-wrap items-center gap-1">
              {view.best.map((amount, k) => (
                <li key={k} data-best={k} data-value={amount} className="px-1.5 py-0.5 rounded-md border bg-slate-900/80 border-slate-700 text-slate-200 tabular-nums whitespace-nowrap">
                  <span className="text-slate-400">After house {k}: </span>
                  {amount}
                </li>
              ))}
            </ol>
          </div>
          <p data-testid="houses-selected" data-houses={view.selected.join(',')} data-sum={selectedSum} className="text-slate-400 break-words">
            one way to reach {bestNow ?? 0}:{' '}
            <span className="text-slate-200">
              {decided === 0
                ? 'no house decided yet'
                : view.selected.length === 0
                  ? 'rob no house'
                  : `rob ${housesText(view.selected)} (${view.selected.map(k => view.nums[k]).join(' + ')}${view.selected.length > 1 ? ` = ${selectedSum}` : ''})`}
            </span>
          </p>
        </div>

        {/* what the colours mean (only the states this step shows) */}
        <ul className="relative z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-mono" aria-hidden="true" data-testid="houses-legend">
          {(Object.keys(TONE_TEXT) as Tone[])
            .filter(t => shown.has(t))
            .map(t => (
              <li key={t} data-legend={t} className="flex items-center gap-1 text-slate-300">
                <span className={`inline-block w-3 h-3 rounded border-2 ${TONE[t]}`} />
                {TONE_TEXT[t]}
              </li>
            ))}
        </ul>

        <p data-testid="houses-input" className="relative z-10 text-[11px] font-mono text-slate-400 break-words">
          nums: <span className="text-slate-300">{list(view.nums)}</span>
        </p>
      </div>

      {view.result && (
        <div
          role="status"
          data-testid="houses-result"
          data-amount={view.result.amount}
          data-houses={view.result.houses.join(',')}
          className="flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-cyan-500/15 border-cyan-500/40 text-cyan-300 break-words"
        >
          <Equal className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span className="min-w-0">{view.result.text}</span>
        </div>
      )}
    </div>
  );
};
