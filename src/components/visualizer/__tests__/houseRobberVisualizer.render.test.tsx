import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { HouseRobberVisualizer } from '../HouseRobberVisualizer';
import { ClimbingStairsVisualizer } from '../ClimbingStairsVisualizer';
import { SortColorsVisualizer } from '../SortColorsVisualizer';

// The real HouseRobberVisualizer for steps of the real House Robber trace: the row of houses, the rob and skip choices,
// the blocked neighbour, the three variables, and the display-only history and plan.
const run = (...nums: number[]) => getAlgorithmDefinition('dp-house-robber')!.generateSteps(nums);
const render = (s: ExecutionStep) => renderToStaticMarkup(<HouseRobberVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, '');
/** the visible and screen-reader text of a step (tags are removed before "<" in a message is decoded) */
const text = (s: ExecutionStep) => decode(render(s).replace(/<[^>]+>/g, ''));
/** every house as "k=money:plan" with the step's focus after a / */
const houses = (html: string) =>
  [...html.matchAll(/data-house="(\d+)" data-value="(\d+)" data-plan="([a-z]+)" data-focus="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}${m[4] === 'none' ? '' : `/${m[4]}`}`);
const vars = (html: string) => [...html.matchAll(/data-var="([a-z0-9]+)" data-value="(\d*)" data-moved="(true|false)"/g)].map(m => `${m[1]}=${m[2]}${m[3] === 'true' ? '*' : ''}`);
const choice = (html: string) => html.match(/data-testid="houses-choice" data-house="(\d*)" data-rob="(\d*)" data-skip="(\d*)" data-winner="([a-z]*)"/)!.slice(1).join('|');
const legend = (html: string) => [...html.matchAll(/data-legend="([a-z]+)"/g)].map(m => m[1]);
const best = (html: string) => html.match(/data-testid="houses-best" data-values="([\d,]*)"/)![1];
const selected = (html: string) => html.match(/data-testid="houses-selected" data-houses="([\d,]*)" data-sum="(\d+)"/)!.slice(1).join('|');

const STEPS = run(2, 7, 9, 3, 1);
const at = (codeRef: string, k = 0) => STEPS.filter(s => s.codeRef === codeRef)[k];

describe('HouseRobberVisualizer', () => {
  it('the first step: every house with its index and money, none decided, no variables yet', () => {
    const html = decode(render(STEPS[0]));
    expect(houses(html)).toEqual(['0=2:waiting', '1=7:waiting', '2=9:waiting', '3=3:waiting', '4=1:waiting']);
    expect([...html.matchAll(/<span class="text-\[10px\] text-slate-400">(\d)<\/span>/g)].map(m => m[1])).toEqual(['0', '1', '2', '3', '4']);
    expect(vars(html)).toEqual(['prev2=', 'prev1=', 'current=']);
    expect(choice(html)).toBe('|||');
    expect(text(STEPS[0])).toContain('The rob and skip choices appear here when the first house is decided.');
    expect(html).toContain('data-testid="houses-choice-idle"');
    expect(html).not.toContain('data-choice=');
    expect(text(STEPS[0])).toContain('0 of 5 decided');
    expect(text(STEPS[0])).toContain('nums: [2, 7, 9, 3, 1]');
    expect(html).toMatch(/data-testid="houses-visualizer" data-length="5" data-operation="start"/);
    expect(html).not.toContain('data-testid="houses-result"');
    expect(legend(html)).toEqual(['waiting']);
  });

  it('the current house is marked with i, in words as well as colour', () => {
    const html = decode(render(at('loop-condition', 0)));
    expect(houses(html)).toEqual(['0=2:waiting/current', '1=7:waiting', '2=9:waiting', '3=3:waiting', '4=1:waiting']);
    expect(html).toMatch(/data-focus-tag="0"[^>]*><span class="text-amber-300">▲ i<\/span>/);
    expect(legend(html)).toEqual(['current', 'waiting']);
    expect(text(at('loop-condition', 0))).toContain('house i: being decided');
  });

  it('the rob choice: nums[i] + prev2 written out, and the house before it marked as blocked', () => {
    const step = at('rob-choice', 2);
    const html = decode(render(step));
    expect(houses(html)).toEqual(['0=2:skipped', '1=7:robbed/blocked', '2=9:waiting/current', '3=3:waiting', '4=1:waiting']);
    expect(html).toMatch(/data-focus-tag="1"[^>]*><span class="text-rose-200">✕ blocked<\/span>/);
    expect(choice(html)).toBe('2|11||');
    expect(text(step)).toContain('Rob house 2');
    expect(text(step)).toContain('nums[2] + prev2 = 9 + 2 = 11');
    expect(text(step)).toContain('house 1 cannot be robbed too');
    expect(text(step)).toContain('prev1 = …');
    expect(legend(html)).toContain('blocked');
    expect(text(step)).toContain('blocked: cannot be robbed if house i is');
    // house 1 is robbed in the plan so far AND blocked by this choice: the row says which label is which, and the rob
    // box says what robbing house 2 would do to the plan
    expect(html).toMatch(/data-plan-word="1"[^>]*>robbed</);
    expect(text(step)).toContain('robbed / skipped: the plan so far · ✕ blocked: only if house 2 is robbed');
    expect(text(step)).toContain('house 1 cannot be robbed too: it is in the plan so far, and would have to leave it');
    // the choice being worked out is marked, in words too
    expect(html).toMatch(/data-testid="houses-choice" data-house="2" data-rob="11" data-skip="" data-winner="" data-evaluating="rob"/);
    expect(html).toMatch(/data-choice="rob" data-wins="false" data-active="true" class="[^"]*border-amber-400/);
    expect(html).toMatch(/data-choice="skip" data-wins="false" data-active="false" class="[^"]*border-slate-600/);
    expect(text(step)).toContain('Rob house 2 — being worked out');
    expect(text(step)).not.toContain('Skip house 2 — being worked out');
    // the first house has nothing before it to block
    const first = decode(render(at('rob-choice', 0)));
    expect(houses(first)[0]).toBe('0=2:waiting/current');
    expect(first).not.toContain('✕ blocked');
    expect(text(at('rob-choice', 0))).toContain('no house before it');
    expect(first).not.toContain('data-testid="houses-row-key"');
    // a blocked house that is not in the plan needs no such remark: house 3 is skipped when house 4 is decided
    expect(text(at('rob-choice', 4))).toContain('house 3 cannot be robbed too');
    expect(text(at('rob-choice', 4))).not.toContain('would have to leave it');
  });

  it('the skip choice, then the winner: rob wins for house 2, skip wins for house 3', () => {
    const skip = decode(render(at('skip-choice', 2)));
    expect(choice(skip)).toBe('2|11|7|');
    expect(text(at('skip-choice', 2))).toContain('prev1 = 7');
    expect(skip).not.toContain('✕ blocked');
    expect(skip).toMatch(/data-choice="skip" data-wins="false" data-active="true" class="[^"]*border-amber-400/);
    expect(skip).toMatch(/data-choice="rob" data-wins="false" data-active="false"/);
    expect(text(at('skip-choice', 2))).toContain('Skip house 2 — being worked out');
    expect(skip).not.toContain('data-testid="houses-verdict"');
    const max = decode(render(at('take-max', 2)));
    expect(choice(max)).toBe('2|11|7|rob');
    expect(max).toMatch(/data-choice="rob" data-wins="true"/);
    expect(max).toMatch(/data-choice="skip" data-wins="false"/);
    expect(text(at('take-max', 2))).toContain('Rob house 2 — wins');
    // the comparison is stated once: it is the step's own description, in the note
    expect(text(at('take-max', 2)).split('current = max(7, 11) = 11 — rob wins')).toHaveLength(2);
    expect(max).toMatch(/data-testid="houses-note" data-kind="max"><span data-testid="houses-verdict"[^>]*>current = max\(7, 11\) = 11 — rob wins<\/span>/);
    expect(max).toMatch(/data-choice="rob" data-wins="true" data-active="false"/);
    expect(text(at('take-max', 2))).not.toContain('being worked out');
    expect(vars(max)).toEqual(['prev2=2', 'prev1=7', 'current=11*']);
    const later = decode(render(at('take-max', 3)));
    expect(choice(later)).toBe('3|10|11|skip');
    expect(later).toMatch(/data-choice="skip" data-wins="true"/);
    expect(text(at('take-max', 3))).toContain('Skip house 3 — wins');
    expect(text(at('take-max', 3)).split('current = max(11, 10) = 11 — skip wins')).toHaveLength(2);
    // a tie says so, and skips
    const tie = run(5, 5).filter(s => s.codeRef === 'take-max')[1];
    expect(text(tie).split('current = max(5, 5) = 5 — equal: skip')).toHaveLength(2);
    expect(decode(render(tie))).toMatch(/data-choice="skip" data-wins="true"/);
  });

  it('prev2, prev1 and current are shown with what they mean, and the one just set is marked', () => {
    expect(vars(decode(render(at('init-prev2'))))).toEqual(['prev2=0*', 'prev1=', 'current=']);
    expect(vars(decode(render(at('init-prev1'))))).toEqual(['prev2=0', 'prev1=0*', 'current=']);
    expect(vars(decode(render(at('shift-prev2', 2))))).toEqual(['prev2=7*', 'prev1=7', 'current=11']);
    expect(vars(decode(render(at('shift-prev1', 2))))).toEqual(['prev2=7', 'prev1=11*', 'current=11']);
    const words = text(at('shift-prev1', 2));
    expect(words).toContain('prev2= 7(most money up to two houses back)');
    expect(words).toContain('prev1= 11(most money up to the previous house)');
    expect(words).toContain('current= 11(most money up to this house)');
    const html = decode(render(at('shift-prev1', 2)));
    expect(html).toMatch(/data-testid="houses-vars"/);
    expect(html).toMatch(/<dl class="[^"]*flex flex-col sm:flex-row sm:flex-wrap/);
    expect([...html.matchAll(/<dt class="shrink-0 [^"]*">(\w+)<\/dt><dd class="shrink-0 whitespace-nowrap [^"]*">= (\d+)<\/dd><dd class="min-w-0 /g)].map(m => `${m[1]}=${m[2]}`)).toEqual(['prev2=7', 'prev1=11', 'current=11']);
  });

  it('the history and the plan are labelled display only, apart from the variables the code keeps', () => {
    const html = decode(render(at('take-max', 2)));
    const box = html.slice(html.indexOf('data-testid="houses-display-only"'), html.indexOf('data-testid="houses-legend"'));
    expect(box).toContain('Display only — the code does not store these; it keeps only prev2 and prev1');
    expect(box).toContain('data-testid="houses-best"');
    expect(box).toContain('data-testid="houses-selected"');
    // the variables are outside that box
    expect(html.indexOf('data-testid="houses-vars"')).toBeLessThan(html.indexOf('data-testid="houses-display-only"'));
    expect(box).not.toContain('data-var=');
    expect(best(html)).toBe('2,7,11');
    expect(selected(html)).toBe('0,2|11');
    expect(text(at('take-max', 2))).toContain('most money so far:After house 0: 2After house 1: 7After house 2: 11');
    expect(html).not.toContain('0–0');
    expect(text(at('take-max', 2))).toContain('one way to reach 11: rob houses 0 and 2 (2 + 9 = 11)');
    expect(text(STEPS[0])).toContain('most money so far:no house decided yet');
    expect(text(STEPS[0])).toContain('one way to reach 0: no house decided yet');
  });

  it('the plan follows the run: house 1 is robbed after two houses and skipped again once house 2 is decided; robbed houses are never neighbours', () => {
    expect(houses(decode(render(at('take-max', 1))))).toEqual(['0=2:skipped', '1=7:robbed/current', '2=9:waiting', '3=3:waiting', '4=1:waiting']);
    expect(houses(decode(render(at('take-max', 2))))).toEqual(['0=2:robbed', '1=7:skipped', '2=9:robbed/current', '3=3:waiting', '4=1:waiting']);
    const html = decode(render(at('shift-prev1', 2)));
    expect([...html.matchAll(/data-plan-word="(\d)"[^>]*>([a-z]*)</g)].map(m => `${m[1]}:${m[2]}`)).toEqual(['0:robbed', '1:skipped', '2:robbed', '3:', '4:']);
    for (const s of STEPS) {
      const robbed = houses(decode(render(s))).flatMap((h, k) => (h.includes(':robbed') ? [k] : []));
      expect(robbed.every((k, j) => j === 0 || k - robbed[j - 1] >= 2), `step ${s.id}`).toBe(true);
    }
  });

  it('the end: the houses robbed, the others skipped, and the result with its houses announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(houses(html)).toEqual(['0=2:robbed', '1=7:skipped', '2=9:robbed', '3=3:skipped', '4=1:robbed']);
    expect(html).toMatch(/role="status" data-testid="houses-result" data-amount="12" data-houses="0,2,4"/);
    expect(text(STEPS.at(-1)!)).toContain('Maximum 12: rob houses 0, 2 and 4 (2 + 9 + 1 = 12)');
    expect(html).toMatch(/data-testid="houses-progress"[^>]*>Done</);
    expect(best(html)).toBe('2,7,11,11,12');
    expect(selected(html)).toBe('0,2,4|12');
    expect(legend(html)).toEqual(['robbed', 'skipped']);
    expect(text(STEPS.at(-1)!)).toContain('Every house has been decided: the answer is prev1.');
    expect(text(STEPS.at(-1)!)).not.toContain('while a house is being decided');
    // between houses and after the last one, the line says where the run is
    expect(text(at('loop-condition', 0))).toContain('House 0: rob it, or skip it?');
    expect(text(STEPS.at(-2)!)).toContain('No house is left to decide.');
    // the area takes no fixed height when there is nothing to choose
    expect(html).toMatch(/class="relative z-10 flex flex-col items-center gap-1.5 font-mono text-\[11px\]" data-testid="houses-choice"/);
    // nothing to rob
    const zeros = run(0, 0, 0);
    expect(text(zeros.at(-1)!)).toContain('Maximum 0: no house holds any money');
    expect(text(zeros.at(-1)!)).toContain('one way to reach 0: rob no house');
    expect(houses(decode(render(zeros.at(-1)!)))).toEqual(['0=0:skipped', '1=0:skipped', '2=0:skipped']);
  });

  it('nothing is worked out here: the picture follows the step it is given, even one the algorithm would never produce', () => {
    const fake: ExecutionStep = {
      id: 0,
      state: [1, 2, 3],
      type: 'assign',
      message: 'made up',
      houseRobber: { nums: [1, 2, 3], i: 0, prev2: 50, prev1: 60, current: 70, operation: 'max', choice: { rob: 8, skip: 9, winner: 'rob' }, blocked: 2, best: [4, 5], selected: [0, 1] },
    };
    const html = decode(render(fake));
    expect(houses(html)).toEqual(['0=1:robbed/current', '1=2:robbed', '2=3:waiting/blocked']);
    expect(vars(html)).toEqual(['prev2=50', 'prev1=60', 'current=70*']);
    expect(choice(html)).toBe('0|8|9|rob');
    expect(best(html)).toBe('4,5');
    expect(selected(html)).toBe('0,1|3');
    expect(text(fake)).toContain('made up');
    expect(text(fake)).toContain('nums[0] + prev2 = 1 + 50 = 8');
    expect(html).not.toContain('data-testid="houses-result"');
  });

  it('screen readers get the houses, the choice and the plan in words; the row of cells is hidden from them', () => {
    const step = at('take-max', 2);
    const html = decode(render(step));
    expect(html).toMatch(/data-testid="houses-row" aria-hidden="true"/);
    expect(html).toContain(
      'The houses: house 0 holds 2, robbed in the plan so far; house 1 holds 7, skipped in the plan so far; house 2 holds 9, house i: being decided, robbed in the plan so far; house 3 holds 3; house 4 holds 1.'
    );
    expect(html).toContain('For house 2: robbing gives 11, skipping gives 7; rob wins.');
    expect(html).toContain('Shown for explanation only, not stored by the code: the most money so far is 11, by robbing houses 0 and 2.');
    expect(decode(render(at('rob-choice', 2)))).toContain('house 1 holds 7, blocked: cannot be robbed if house i is, robbed in the plan so far');
  });

  it('responsive: houses keep their size and wrap onto more rows instead of scrolling', () => {
    const html = decode(render(run(400, 400, 400, 400, 400, 400, 400, 400, 400, 400).at(-1)!));
    expect(html).toMatch(/data-testid="houses-row" aria-hidden="true" class="[^"]*flex flex-wrap/);
    expect(houses(html)).toHaveLength(10);
    expect(html).toMatch(/class="flex flex-col items-center gap-0.5 w-12 sm:w-14"/);
    expect(html).toMatch(/data-testid="houses-best"[^>]*>/);
    expect(html).not.toContain('overflow-x-auto');
    expect(html).toContain('Maximum 2000: rob houses 0, 2, 4, 6 and 8 (400 + 400 + 400 + 400 + 400 = 2000)');
  });

  it('a step of another algorithm draws nothing, and the other visualizers ignore a House Robber step', () => {
    expect(renderToStaticMarkup(<HouseRobberVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<HouseRobberVisualizer currentStep={getAlgorithmDefinition('dp-climbing-stairs')!.generateSteps([5])[0]} />)).toBe('');
    expect(renderToStaticMarkup(<ClimbingStairsVisualizer currentStep={STEPS[0]} />)).toBe('');
    expect(renderToStaticMarkup(<SortColorsVisualizer currentStep={STEPS[0]} />)).toBe('');
  });
});
