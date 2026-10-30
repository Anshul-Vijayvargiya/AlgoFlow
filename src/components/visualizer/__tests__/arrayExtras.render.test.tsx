import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { parseBars, renderStep, rolesOf } from './visualTestUtils';

// The real ArrayVisualizer for Two Sum (value cards + hash map) and Majority Element (value cards), on real trace
// steps; and the outcome banner's own text. Other array algorithms render neither panel.
const trace = (id: AlgorithmId, input: number[], params?: Record<string, unknown>) => getAlgorithmDefinition(id)!.generateSteps(input, params);
const at = (steps: ExecutionStep[], pick: (s: ExecutionStep) => boolean) => steps.findIndex(pick);

/** the value cards: name → { value, role } (a missing value reads "—not set") */
function cards(html: string) {
  const out: Record<string, { value: string; role: string }> = {};
  const starts = [...html.matchAll(/data-number-cell="([^"]+)" data-role="([a-z]*)"/g)];
  starts.forEach((m, k) => {
    const card = html.slice(m.index, starts[k + 1]?.index);
    out[m[1]] = { role: m[2], value: /data-number-value="[^"]*">(.*?)<\/dd>/.exec(card)![1].replace(/<[^>]+>/g, '') };
  });
  return out;
}
/** the hash map entries as drawn: "key → value" with their mark ('found', 'insert', 'update' or '') */
const entries = (html: string) =>
  [...html.matchAll(/data-key="(-?\d+)" data-value="(\d+)" data-mark="([a-z]*)"/g)].map(m => ({ key: Number(m[1]), value: Number(m[2]), mark: m[3] }));

describe('Two Sum in the array view', () => {
  const steps = trace('two-sum', [3, 8, 11, 5, 2, 7, 4], { target: 9 });

  it('a complement step: the target pill, i on the bar, and the cards with the complement marked as changed', () => {
    const html = renderStep('two-sum', steps, at(steps, s => s.codeRef === 'calc-complement' && s.variables!.i === 2));
    expect(html).toContain('data-testid="target-pill"');
    expect(parseBars(html)[2].pointers).toEqual(['i']);
    expect(cards(html)).toEqual({
      target: { value: '9', role: '' },
      i: { value: '2', role: '' },
      'nums[i]': { value: '11', role: 'current' },
      complement: { value: '-2', role: 'changed' },
    });
    expect(html).toMatch(/data-number-cell="complement" data-role="changed"[^>]*>.*?changed<\/dd>/);
  });

  it('a lookup miss: says the complement is not in the map; nothing is marked', () => {
    const html = renderStep('two-sum', steps, at(steps, s => s.codeRef === 'lookup' && s.variables!.i === 2));
    expect(html).toContain('aria-label="Hash map seen (value → index)"');
    expect(entries(html)).toEqual([{ key: 3, value: 0, mark: '' }, { key: 8, value: 1, mark: '' }]);
    expect(html).toMatch(/data-testid="hash-lookup" data-found="false"[^>]*>lookup -2: <span[^>]*>not in seen<\/span>/);
  });

  it('a store: the new entry is marked "added", in words', () => {
    const html = renderStep('two-sum', steps, at(steps, s => s.codeRef === 'store' && s.variables!.i === 2));
    expect(entries(html).at(-1)).toEqual({ key: 11, value: 2, mark: 'insert' });
    expect(html).toMatch(/data-key="11"[^>]*>11 → 2<span[^>]*>added<\/span>/);
    expect(html).toContain('3 entries');
  });

  it('an update of a repeated value is marked "updated"', () => {
    const s2 = trace('two-sum', [4, 1, 4], { target: 100 });
    const html = renderStep('two-sum', s2, at(s2, s => s.codeRef === 'store' && s.variables!.i === 2));
    expect(entries(html)).toEqual([{ key: 4, value: 2, mark: 'update' }, { key: 1, value: 1, mark: '' }]);
    expect(html).toContain('updated</span>');
  });

  it('the hit: the matching entry is marked found, both bars are highlighted, and the outcome names the pair', () => {
    const hit = renderStep('two-sum', steps, at(steps, s => s.codeRef === 'lookup' && s.result === 'true'));
    expect(entries(hit).find(e => e.mark === 'found')).toEqual({ key: 2, value: 4, mark: 'found' });
    expect(hit).toMatch(/data-found="true"[^>]*>lookup 2: <span[^>]*>found → 4<\/span>/);
    const bars = parseBars(hit);
    expect(bars[4].pointers).toEqual(['j']);
    expect(bars[5].pointers).toEqual(['i']);

    const end = renderStep('two-sum', steps, steps.length - 1);
    expect(rolesOf(parseBars(end), 'found')).toEqual([4, 5]);
    expect(end).toMatch(/role="status" data-testid="outcome-banner" data-outcome-kind="found"[^>]*>.*Pair found: indices \[4, 5\] — 2 \+ 7 = 9<\/div>/);
  });

  it('no solution: the banner says no pair sums to the target', () => {
    const s2 = trace('two-sum', [1, 2, 3], { target: 7 });
    expect(renderStep('two-sum', s2, s2.length - 1)).toMatch(/data-outcome-kind="not-found"[^>]*>.*No pair sums to 7<\/div>/);
  });

  it('before the map is created its panel holds its place: "not created yet", no entries, no lookup', () => {
    const html = renderStep('two-sum', steps, 0);
    expect(html).toMatch(/data-testid="hash-map" data-created="false" aria-label="Hash map seen \(value → index\)"/);
    expect(html).toContain('>not created yet</span>');
    expect(entries(html)).toEqual([]);
    expect(html).not.toContain('data-testid="hash-lookup"');
  });
});

describe('a stable layout: the value cards and the map panel keep their shape at every step', () => {
  /** the structure that decides their height: per card, its dd lines; for the map, the fixed entries area and the lookup line */
  const shape = (html: string) => ({
    cardLines: [...html.matchAll(/data-number-cell="[^"]+"[^>]*>(.*?)<\/div>/g)].map(m => (m[1].match(/<dd/g) ?? []).length),
    entriesArea: /data-testid="hash-map-entries" class="h-\[4\.75rem\] overflow-y-auto/.test(html),
    lookupLine: /data-testid="hash-lookup"|<p aria-hidden="true" class="mt-1\.5 text-\[11px\] font-mono invisible">/.test(html),
  });

  it.each([
    ['two-sum', [3, 8, 11, 5, 2, 7, 4], { target: 9 }],
    ['majority-element', [2, 2, 1, 1, 1, 2, 2], undefined],
    ['container-most-water', [1, 8, 6, 2, 5, 4, 8, 3, 7], undefined],
  ] as const)('%s: every card always has its role line (a hidden placeholder when it has no role)', (id, input, params) => {
    const steps = trace(id, [...input], params);
    const shapes = steps.map((_, k) => shape(renderStep(id, steps, k)));
    const first = shapes[0];
    expect(first.cardLines.every(n => n === 2)).toBe(true);
    for (const [k, s] of shapes.entries()) expect(s, `step ${k + 1}`).toEqual(first);
  });

  it('the hidden placeholder is not read out: aria-hidden, invisible, and only where a card has no role', () => {
    const steps = trace('container-most-water', [1, 8, 6]);
    const html = renderStep('container-most-water', steps, steps.findIndex(s => s.codeRef === 'calc-area'));
    expect(html).toMatch(/data-number-cell="area" data-role="changed"[^>]*>.*?<dd class="[^"]*">changed<\/dd><\/div>/);
    expect(html).toMatch(/data-number-cell="maxArea" data-role=""[^>]*>.*?<dd aria-hidden="true" class="[^"]*invisible"> <\/dd><\/div>/);
  });
});

describe('Majority Element in the array view', () => {
  it('pass 1: candidate and count cards, i on the bar; candidate is "not set" before the first element', () => {
    const steps = trace('majority-element', [2, 2, 1, 1, 1, 2, 2]);
    expect(cards(renderStep('majority-element', steps, 1)).candidate).toEqual({ value: '—not set', role: 'changed' });
    const html = renderStep('majority-element', steps, at(steps, s => s.codeRef === 'decrement-count'));
    expect(cards(html)).toMatchObject({ i: { value: '2' }, 'nums[i]': { value: '1' }, candidate: { value: '2' }, count: { value: '1', role: 'changed' } });
    expect(parseBars(html)[2].pointers).toEqual(['i']);
    expect(html).not.toContain('data-testid="hash-map"');
    expect(html).not.toContain('data-testid="target-pill"');
  });

  it('pass 2: freq and ⌊n/2⌋ cards; a majority locks every copy as found and the banner names it', () => {
    const steps = trace('majority-element', [2, 2, 1, 1, 1, 2, 2]);
    const check = renderStep('majority-element', steps, at(steps, s => s.codeRef === 'check-majority'));
    expect(cards(check)).toMatchObject({ freq: { value: '4', role: 'current' }, 'n / 2': { value: '3', role: 'current' } });
    const end = renderStep('majority-element', steps, steps.length - 1);
    expect(rolesOf(parseBars(end), 'found')).toEqual([0, 1, 5, 6]);
    expect(end).toMatch(/data-outcome-kind="found"[^>]*>.*Majority element: 2 \(4 of 7, more than ⌊7\/2⌋ = 3\)<\/div>/);
  });

  it('no majority: nothing is locked and the banner explains why', () => {
    const steps = trace('majority-element', [1, 1, 2, 2]);
    const end = renderStep('majority-element', steps, steps.length - 1);
    expect(rolesOf(parseBars(end), 'found')).toEqual([]);
    expect(end).toMatch(/data-outcome-kind="not-found"[^>]*>.*No majority element: the candidate \d occurs 2 of 4 times, not more than ⌊4\/2⌋ = 2<\/div>/);
  });
});

describe('other array algorithms are unchanged', () => {
  it('no value cards or map panel, and the generic outcome text', () => {
    const withPanels = ['two-sum', 'majority-element', 'container-most-water', 'merge-sorted-array', 'trapping-rain-water', 'remove-duplicates-sorted', 'maximum-subarray'];
    for (const d of getAllAlgorithms().filter(a => (a.visual ?? 'array') === 'array' && !withPanels.includes(a.id))) {
      const steps = d.generateSteps([...d.defaultInput], d.inputSpec?.target ? { target: d.inputSpec.target.defaultValue } : undefined);
      for (const k of [0, steps.length - 1]) {
        const html = renderStep(d.id, steps, k);
        expect(html, d.id).not.toContain('data-testid="tracker"');
        expect(html, d.id).not.toContain('data-testid="hash-map"');
      }
      expect(steps.some(s => s.outcomeText !== undefined), d.id).toBe(false);
    }
    const bubble = trace('bubble-sort', [3, 1, 2]);
    expect(renderStep('bubble-sort', bubble, bubble.length - 1)).toMatch(/data-outcome-kind="sorted"[^>]*>.*Array sorted<\/div>/);
  });
});
