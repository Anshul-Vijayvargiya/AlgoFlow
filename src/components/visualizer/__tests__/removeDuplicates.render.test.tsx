import { describe, it, expect } from 'vitest';
import { getAlgorithmDefinition, getAllAlgorithms } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { parseBars, renderStep, rolesOf } from './visualTestUtils';

// Remove Duplicates from Sorted Array in the real ArrayVisualizer: the kept (unique) prefix, slow/fast pointers,
// comparisons and writes, the value cards, the dimmed leftover tail and the outcome.
const steps = getAlgorithmDefinition('remove-duplicates-sorted')!.generateSteps([1, 1, 2, 2, 3]);
const at = (pick: (s: ExecutionStep) => boolean) => steps.findIndex(pick);
const render = (k: number) => renderStep('remove-duplicates-sorted', steps, k);
const cardValue = (html: string, name: string) => {
  const start = html.indexOf(`data-number-cell="${name}"`);
  return /data-number-value="[^"]*">(.*?)<\/dd>/.exec(html.slice(start))![1].replace(/<[^>]+>/g, '');
};

describe('Remove Duplicates in the array view', () => {
  it('a duplicate: slow and fast on their bars, both compared; the prefix is kept; the skipped count goes up', () => {
    const html = render(at(s => s.codeRef === 'compare'));
    const bars = parseBars(html);
    expect(bars[0].pointers).toEqual(['slow']);
    expect(bars[1].pointers).toEqual(['fast']);
    expect(rolesOf(bars, 'compare')).toEqual([0, 1]);
    expect(cardValue(html, 'skipped')).toBe('1');
    expect(cardValue(html, 'unique')).toBe('1');
  });

  it('a write: ASSIGN on the written and the read bar, the new value in place, and the prefix grows', () => {
    const k = at(s => s.codeRef === 'write');
    const html = render(k);
    expect(html).toMatch(/data-bar-index="1" data-role="assign"[^>]*data-value="2"/);
    expect(rolesOf(parseBars(html), 'assign')).toEqual([1, 2]);
    // the next step (loop check) shows the grown prefix as kept
    expect(rolesOf(parseBars(render(k + 1)), 'kept')).toEqual([0, 1]);
    expect(cardValue(html, 'unique')).toBe('2');
  });

  it('kept bars are announced in words, not only by colour', () => {
    const html = render(at(s => s.codeRef === 'init-slow') + 1);
    expect(html).toContain('aria-label="Index 0, value 1, kept (unique prefix), pointer slow"');
  });

  it('the end: the unique prefix kept, the leftover tail dimmed, and the banner gives the count and the values', () => {
    const html = render(steps.length - 1);
    const bars = parseBars(html);
    expect(rolesOf(bars, 'kept')).toEqual([0, 1, 2]);
    expect(bars.filter(b => !b.inRange).map(b => b.index)).toEqual([3, 4]);
    expect(html).toContain('aria-label="Index 3, value 2, outside the current range"');
    expect(html).toMatch(/data-outcome-kind="complete"[^>]*>.*3 unique values: \[1, 2, 3\] \(nums\[0\.\.2\]\)<\/div>/);
    expect(cardValue(html, 'unique')).toBe('3');
    expect(cardValue(html, 'skipped')).toBe('2');
  });

  it('no other algorithm marks bars as kept', () => {
    for (const d of getAllAlgorithms().filter(a => (a.visual ?? 'array') === 'array' && a.id !== 'remove-duplicates-sorted')) {
      const s = d.generateSteps([...d.defaultInput], d.inputSpec?.target ? { target: d.inputSpec.target.defaultValue } : undefined);
      for (const k of [0, Math.floor(s.length / 2), s.length - 1]) expect(rolesOf(parseBars(renderStep(d.id, s, k)), 'kept'), d.id).toEqual([]);
    }
  });
});
