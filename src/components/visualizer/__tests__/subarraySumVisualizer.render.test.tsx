import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep, PrefixMapRange, PrefixMapView } from '../../../types/algorithm';
import { SubarraySumVisualizer } from '../SubarraySumVisualizer';
import { StockIIIVisualizer } from '../StockIIIVisualizer';

// The real SubarraySumVisualizer for steps of the real trace: the numbers, the prefix sums, the five value cards, the map
// with its lookup or write, why a match is a subarray summing to k, and the display-only subarrays counted.
const run = (nums: number[], k: number) => getAlgorithmDefinition('array-subarray-sum-k')!.generateSteps(nums, { target: k });
const render = (s: ExecutionStep) => renderToStaticMarkup(<SubarraySumVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, '');
const text = (s: ExecutionStep) => decode(render(s).replace(/<[^>]+>/g, ''));
const cells = (html: string) => [...html.matchAll(/data-index="(\d+)" data-value="(-?\d+)" data-tone="([a-z]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
const prefixes = (html: string) => [...html.matchAll(/data-p="(\d+)" data-value="(-?\d+)" data-tone="([a-z]+)"/g)].map(m => `P${m[1]}=${m[2]}:${m[3]}`);
/** the five cards, as "name=value" with * for the one this step set */
const cards = (html: string) => [...html.matchAll(/data-name="([^"]+)" data-value="(-?\d*)" data-active="(true|false)"/g)].map(m => `${m[1]}=${m[2]}${m[3] === 'true' ? '*' : ''}`);
const map = (html: string) => [...html.matchAll(/data-key="(-?\d+)" data-count="(\d+)" data-mark="([a-z]*)"/g)].map(m => `${m[1]}:${m[2]}${m[3] ? `(${m[3]})` : ''}`);
const lanes = (html: string) => [...html.matchAll(/data-lane="([^"]+)"/g)].map(m => m[1]);
const listed = (html: string) => [...html.matchAll(/data-match="([^"]+)"/g)].map(m => m[1]);

const STEPS = run([1, 2, 3], 3);
const at = (codeRef: string, x = 0) => STEPS.filter(s => s.codeRef === codeRef)[x];
const ZEROS = run([0, 0, 0], 0);

describe('SubarraySumVisualizer', () => {
  it('the first step: the numbers waiting, k, empty cards, no map yet, no subarray', () => {
    const html = decode(render(STEPS[0]));
    expect(cells(html)).toEqual(['0=1:waiting', '1=2:waiting', '2=3:waiting']);
    expect(cards(html)).toEqual(['k=3', 'nums[i]=', 'prefix=', 'need=', 'count=']);
    expect(text(STEPS[0])).toContain('not created yet');
    expect(text(STEPS[0])).toContain('subarrays found: none yet');
    expect(html).not.toContain('data-testid="ssk-brackets"');
    expect(prefixes(html)).toEqual(['P0=0:waiting', 'P1=1:waiting', 'P2=3:waiting', 'P3=6:waiting']);
  });

  it('freq = {0: 1}: the map holds P0 = 0 once, marked as just inserted, and P0 is recorded', () => {
    const html = decode(render(at('init-map')));
    expect(map(html)).toEqual(['0:1(insert)']);
    expect(html).toMatch(/data-testid="ssk-write" data-key="0" data-kind="insert"/);
    expect(prefixes(html)[0]).toBe('P0=0:recorded');
    expect(cards(html)).toEqual(['k=3', 'nums[i]=', 'prefix=0', 'need=', 'count=0']);
  });

  it('prefix += nums[i]: the card is set, the new prefix sum is marked as just computed', () => {
    const s = at('add-prefix', 1);
    const html = decode(render(s));
    expect(cards(html)).toEqual(['k=3', 'nums[i]=2', 'prefix=3*', 'need=-2', 'count=0']);
    expect(cells(html)).toEqual(['0=1:seen', '1=2:current', '2=3:waiting']);
    expect(prefixes(html)).toEqual(['P0=0:recorded', 'P1=1:recorded', 'P2=3:current', 'P3=6:waiting']);
  });

  it('a lookup that finds need: the map entry, count + occurrences, one lane per subarray, and why it sums to k', () => {
    const s = at('lookup', 1);
    const html = decode(render(s));
    expect(cards(html)).toEqual(['k=3', 'nums[i]=2', 'prefix=3', 'need=0', 'count=1*']);
    expect(map(html)).toEqual(['0:1(found)', '1:1']);
    expect(html).toMatch(/data-testid="ssk-lookup" data-key="0" data-found="true" data-occurrences="1"/);
    expect(text(s)).toContain('look up need = 0: occurred once → count 0 + 1 = 1');
    expect(lanes(html)).toEqual(['0-1']);
    expect(cells(html)).toEqual(['0=1:match', '1=2:current', '2=3:waiting']);
    expect(prefixes(html)).toEqual(['P0=0:start', 'P1=1:recorded', 'P2=3:current', 'P3=6:waiting']);
    expect(text(s)).toContain('P0 = 0 = need → nums[0..1] = [1, 2] sums to P2 − P0 = 3 − 0 = 3');
    expect(text(s)).toContain('why: sum of nums[j..i] = P(i + 1) − P(j). It is k exactly when P(j) = prefix − k = need');
    expect(listed(html)).toEqual(['0-1']);
  });

  it('a lookup that misses: count stays, no lane, the step says so', () => {
    const s = at('lookup', 0);
    const html = decode(render(s));
    expect(html).toMatch(/data-testid="ssk-lookup" data-key="-2" data-found="false" data-occurrences="0"/);
    expect(text(s)).toContain('look up need = −2: not in the map → count stays 0');
    expect(html).not.toContain('data-testid="ssk-brackets"');
    expect(cards(html)).toContain('count=0*');
  });

  it('a store: a new key is marked inserted; a repeated prefix sum is marked incremented', () => {
    expect(map(decode(render(at('store', 0))))).toEqual(['0:1', '1:1(insert)']);
    const html = decode(render(ZEROS.filter(s => s.codeRef === 'store')[1]));
    expect(map(html)).toEqual(['0:3(increment)']);
    expect(html).toMatch(/data-testid="ssk-write" data-key="0" data-kind="increment"/);
    expect(decode(render(ZEROS.filter(s => s.codeRef === 'store')[1]).replace(/<[^>]+>/g, ''))).toContain('record prefix = 0: 2 + 1 = 3');
  });

  it('[0, 0, 0], k = 0: three overlapping subarrays end at index 2, each in its own lane', () => {
    const s = ZEROS.filter(st => st.codeRef === 'lookup')[2];
    const html = decode(render(s));
    expect(lanes(html)).toEqual(['0-2', '1-2', '2-2']);
    expect(html).toMatch(/data-testid="ssk-brackets" data-ranges="0-2,1-2,2-2"/);
    expect(listed(html)).toEqual(['0-0', '0-1', '1-1', '0-2', '1-2', '2-2']);
    expect(html).toMatch(/data-testid="ssk-running" data-value="6"/);
  });

  it('the end: done, the result banner with the count, every subarray listed, display only', () => {
    const end = STEPS.at(-1)!;
    const html = decode(render(end));
    expect(html).toMatch(/role="status" data-testid="ssk-result" data-count="2"/);
    expect(text(end)).toContain('2 subarrays sum to 3: nums[0..1] = [1, 2], nums[2..2] = [3]');
    expect(listed(html)).toEqual(['0-1', '2-2']);
    expect(cells(html)).toEqual(['0=1:seen', '1=2:seen', '2=3:seen']);
    const box = html.slice(html.indexOf('data-testid="ssk-display-only"'), html.indexOf('data-testid="ssk-input"'));
    expect(box).toContain('Display only — the code does not store these subarrays; it only counts them');
    expect(box).not.toContain('data-name=');
  });

  it('the empty array: no cells, a note, count 0', () => {
    const end = run([], 0).at(-1)!;
    const html = decode(render(end));
    expect(html).toContain('data-testid="ssk-empty"');
    expect(cells(html)).toEqual([]);
    expect(html).toMatch(/data-testid="ssk-result" data-count="0"/);
    expect(text(end)).toContain('The array is empty: no subarray, count 0');
  });

  it('negative numbers and k are shown with a true minus sign', () => {
    const s = run([-1, 2], -1).find(st => st.codeRef === 'calc-need')!;
    const html = decode(render(s));
    expect(cards(html)).toEqual(['k=-1', 'nums[i]=-1', 'prefix=-1', 'need=0*', 'count=0']);
    expect(text(s)).toContain('k−1');
    expect(text(s)).toContain('nums: [−1, 2], k = −1');
  });

  describe('a made-up step: the subarrays are checked, and count, the map and the values are always shown', () => {
    const base = at('lookup', 2);
    const fake = (over: Partial<PrefixMapView>): ExecutionStep => ({ ...base, message: 'made up', prefixMap: { ...base.prefixMap!, ...over } });
    const real = decode(render(base));

    it('the real step shows its subarrays', () => {
      expect(lanes(real)).toEqual(['2-2']);
      expect(listed(real)).toEqual(['0-1', '2-2']);
    });

    const BAD: [string, Partial<PrefixMapView>, boolean, boolean][] = [
      // [what, override, this step's lanes hidden, the list hidden]
      ['a range that does not sum to k', { matchesHere: [{ start: 1, end: 2 }] }, true, false],
      ['a range that does not end at i', { matchesHere: [{ start: 0, end: 1 }] }, true, false],
      ['a range outside the array', { matchesHere: [{ start: 2, end: 5 }] }, true, false],
      ['a backwards range', { matchesHere: [{ start: 2, end: 1 }] }, true, false],
      ['more ranges than the lookup counted', { matchesHere: [{ start: 2, end: 2 }, { start: 2, end: 2 }] }, true, false],
      ['a listed range that does not sum to k', { matches: [{ start: 0, end: 0 }, { start: 2, end: 2 }] }, false, true],
      ['the same range listed twice', { matches: [{ start: 0, end: 1 }, { start: 0, end: 1 }] }, false, true],
      ['fewer listed ranges than count', { matches: [{ start: 0, end: 1 }] }, false, true],
      ['a listed range ending after i', { nums: [1, 2, 3, 3], matches: [{ start: 0, end: 1 }, { start: 3, end: 3 }] }, false, true],
      ['non-integer positions', { matchesHere: [{ start: 1.5, end: 2 } as PrefixMapRange], matches: [{ start: 0.5, end: 1 } as PrefixMapRange, { start: 2, end: 2 }] }, true, true],
    ];
    it.each(BAD)('%s: none of it is drawn, and count, the map and every card stay as the step gives them', (_, over, hideLanes, hideList) => {
      const html = decode(render(fake(over)));
      if (hideLanes) {
        expect(html).not.toContain('data-testid="ssk-brackets"');
        expect(html).not.toContain('data-why=');
        expect(html).not.toMatch(/data-tone="(match|start)"/);
      } else {
        expect(lanes(html)).toEqual(['2-2']);
      }
      if (hideList) {
        expect(listed(html)).toEqual([]);
        expect(html).toContain('data-testid="ssk-unshown"');
      } else {
        expect(listed(html)).toEqual(['0-1', '2-2']);
      }
      expect(cards(html).slice(2)).toEqual(['prefix=6', 'need=3', 'count=2*']);
      expect(map(html)).toEqual(map(real));
      expect(html).toMatch(/data-testid="ssk-running" data-value="2"/);
    });

    it('a count the ranges do not support: the list is not shown, the count is', () => {
      const html = decode(render(fake({ count: 7 })));
      expect(listed(html)).toEqual([]);
      expect(html).toContain('data-testid="ssk-unshown"');
      expect(cards(html)).toContain('count=7*');
      expect(html).toMatch(/data-testid="ssk-running" data-value="7"/);
    });
  });

  it('screen readers get the numbers, values, map, lookup and subarrays in words; the chart and prefix row are hidden', () => {
    const s = at('lookup', 1);
    const html = decode(render(s));
    expect(html).toMatch(/data-testid="ssk-chart" aria-hidden="true"/);
    expect(text(s)).toContain('nums [1, 2, 3], k = 3.');
    expect(text(s)).toContain('prefix = 3, need = 0, count = 1.');
    expect(text(s)).toContain('The map: 0 occurred 1 time; 1 occurred 1 time.');
    expect(text(s)).toContain('Looked up 0: occurred 1 time.');
    expect(text(s)).toContain('Subarrays counted here: nums[0..1] = [1, 2].');
  });

  it('responsive: cards two to a row on a phone, five on wider screens; the map and prefix row wrap; no sideways scroll', () => {
    const html = decode(render(run([-999, 999, -999, 999, -999, 999, -999, 999, -999, 999], 0).at(-1)!));
    expect(html).toMatch(/<ol class="relative z-10 grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono" data-testid="ssk-values">/);
    expect(html).toMatch(/class="flex flex-wrap justify-center gap-1 font-mono" data-testid="ssk-prefixes"/);
    expect(html).toMatch(/<ul class="flex flex-wrap gap-1">/);
    expect(cells(html)).toHaveLength(10);
    expect(html).not.toContain('overflow-x-auto');
  });

  it('a step of another algorithm draws nothing, and Stock III ignores a Subarray Sum step', () => {
    expect(renderToStaticMarkup(<SubarraySumVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
    expect(renderToStaticMarkup(<SubarraySumVisualizer currentStep={getAlgorithmDefinition('two-sum')!.generateSteps([1, 2], { target: 3 })[0]} />)).toBe('');
    expect(renderToStaticMarkup(<StockIIIVisualizer currentStep={STEPS[0]} />)).toBe('');
  });
});
