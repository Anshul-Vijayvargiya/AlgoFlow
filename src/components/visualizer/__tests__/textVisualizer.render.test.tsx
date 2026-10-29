import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { TextVisualizer } from '../TextVisualizer';

// The real TextVisualizer for steps of the real string-algorithm traces: the rows of characters with their marks and
// pointers, the needle aligned under its window, the stack, the value cards, and the result.
const steps = (id: AlgorithmId, texts: string[]) => getAlgorithmDefinition(id)!.generateSteps([], { texts });
const render = (step: ExecutionStep) => renderToStaticMarkup(<TextVisualizer currentStep={step} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** the characters of a row as drawn: [index, char, mark] */
function rowCells(html: string, name: string) {
  const start = html.indexOf(`data-row="${name}"`);
  const next = html.indexOf('data-testid="text-row"', start + 1);
  const row = html.slice(start, next < 0 ? undefined : next);
  return {
    cells: [...row.matchAll(/data-index="(-?\d+)" data-char="([^"]*)" data-mark="([a-z]*)"/g)].map(m => [Number(m[1]), decode(m[2]), m[3]] as const),
    pointers: [...row.matchAll(/data-pointer="([^"]+)" data-index="(-?\d+)"/g)].map(m => [m[1], Number(m[2])] as const),
    /** how many empty columns come before the first character */
    lead: (row.slice(0, row.indexOf('data-index=')).match(/class="w-6 sm:w-7 shrink-0 h-9"/g) ?? []).length,
    sr: decode(/<span class="sr-only">(.*?)<\/span>/.exec(row)?.[1] ?? '').replace(/<!-- -->/g, ''),
  };
}
const find = (all: ExecutionStep[], codeRef: string, n = 0) => all.filter(s => s.codeRef === codeRef)[n];

describe('TextVisualizer', () => {
  it('Valid Palindrome: both pointers under their characters; a skipped character is drawn and said as skipped', () => {
    const all = steps('valid-palindrome', ['A man, a plan, a canal: Panama']);
    const html = render(find(all, 'skip-left'));
    const s = rowCells(html, 's');
    expect(s.cells).toHaveLength(30);
    expect(s.cells[1]).toEqual([1, ' ', 'skipped']);
    // the first pair (A, a) has matched, so right has already moved in once
    expect(s.pointers).toEqual([['left', 2], ['right', 28]]);
    expect(s.sr).toContain('skipped at 1');
    expect(s.sr).toContain('left at 2, right at 28');
    // the space is shown with a visible symbol, and named for assistive technology
    expect(html).toContain('␣');
    expect(s.sr).toMatch(/^s: A space m a n/);
  });

  it('strStr: the needle is aligned under its window, and a compared pair is marked match / mismatch in both rows', () => {
    const all = steps('find-first-occurrence', ['mississippi', 'issip']);
    const mismatch = all.find(s => s.codeRef === 'compare' && s.result === 'false' && (s.variables as { i: number }).i === 1)!;
    const html = render(mismatch);
    const hay = rowCells(html, 'haystack');
    const needle = rowCells(html, 'needle');
    expect(needle.lead - hay.lead).toBe(1); // aligned at i = 1
    expect(hay.cells.filter(c => c[2] === 'match').map(c => c[0])).toEqual([1, 2, 3, 4]);
    expect(hay.cells.find(c => c[2] === 'mismatch')).toEqual([5, 's', 'mismatch']);
    expect(needle.cells.find(c => c[2] === 'mismatch')).toEqual([4, 'p', 'mismatch']);
    expect(needle.pointers).toEqual([['j', 4]]);
  });

  it('Valid Parentheses: the stack bottom to top, its top marked, and what the step did', () => {
    const all = steps('valid-parentheses', ['([)]']);
    const pushed = render(find(all, 'push', 1));
    expect(pushed).toMatch(/data-testid="text-stack" data-action="push"/);
    expect([...pushed.matchAll(/data-stack-item="([^"]+)" data-top="(true|false)"/g)].map(m => [m[1], m[2]])).toEqual([['(', 'false'], ['[', 'true']]);
    expect(pushed).toContain('Stack, bottom to top: ( [');
    const bad = render(find(all, 'check-close'));
    expect(bad).toMatch(/data-action="mismatch"/);
    expect(rowCells(bad, 's').cells.filter(c => c[2] === 'mismatch').map(c => c[0])).toEqual([1, 2]);
  });

  it('Add Binary: digits line up by place value, and the result row grows from the right', () => {
    const all = steps('add-binary', ['11', '1']);
    const html = render(find(all, 'write-bit', 1));
    const a = rowCells(html, 'a');
    const b = rowCells(html, 'b');
    const result = rowCells(html, 'result');
    // width 3: a = 11 starts one column in, b = 1 two columns in, the 2 bits written so far also two columns in
    expect([a.lead, b.lead, result.lead]).toEqual([2, 3, 2]);
    expect(result.cells.map(c => c[1]).join('')).toBe('00');
    expect(result.cells[0][2]).toBe('current'); // the bit just written
  });

  it('Valid Palindrome II: each deletion candidate is a row aligned under the range it checks, with its own pointers', () => {
    const all = steps('valid-palindrome-ii', ['cbbcc']);
    // the second candidate's comparison: s[1..2] = "bb" without s[3]
    const html = render(all.filter(st => st.codeRef === 'range-compare').at(-1)!);
    const main = rowCells(html, 's');
    const withoutLeft = rowCells(html, 'without s[1]');
    const withoutRight = rowCells(html, 'without s[3]');
    expect(main.cells.filter(c => c[2] === 'mismatch').map(c => c[0])).toEqual([1, 3]);
    expect([withoutLeft.lead - main.lead, withoutLeft.cells.map(c => c[1]).join('')]).toEqual([2, 'bc']);
    expect([withoutRight.lead - main.lead, withoutRight.cells.map(c => c[1]).join('')]).toEqual([1, 'bb']);
    expect(withoutLeft.cells.filter(c => c[2] === 'mismatch').map(c => c[0])).toEqual([0, 1]);
    expect(withoutRight.cells.map(c => c[2])).toEqual(['match', 'match']);
    expect(withoutRight.pointers).toEqual([['i', 0], ['j', 1]]);
    expect([...html.matchAll(/data-number-cell="([^"]+)"/g)].map(m => decode(m[1]))).toEqual(['left', 'right', 'i', 'j', 'delete left', 'delete right']);
  });

  it('pointers before the string (index -1) and past it are drawn in the extra columns', () => {
    const all = steps('length-of-last-word', ['a']);
    const html = render(find(all, 'count'));
    expect(rowCells(html, 's').pointers).toEqual([['i', -1]]);
  });

  it('the value cards, the operation label, and the result on the last step only', () => {
    const all = steps('roman-to-integer', ['MCMXCIV']);
    const mid = render(find(all, 'subtract'));
    expect([...mid.matchAll(/data-number-cell="([^"]+)"/g)].map(m => decode(m[1]))).toEqual(['i', 's[i]', 'value', 'next value', 'total']);
    expect(mid).toContain('data-testid="text-operation"');
    expect(mid).not.toContain('data-testid="text-result"');
    const end = render(all[all.length - 1]);
    expect(end).toMatch(/role="status" data-testid="text-result" data-result-kind="answer"/);
    expect(end).toContain('MCMXCIV = 1994');
  });

  it('long strings scroll inside a focusable, named region instead of widening the page', () => {
    const html = render(steps('valid-palindrome', ['Was it a car or a cat I saw?'])[0]);
    expect(html).toMatch(/tabindex="0" role="region" aria-label="Strings at this step" data-testid="text-rows" class="[^"]*overflow-x-auto/);
  });
});
