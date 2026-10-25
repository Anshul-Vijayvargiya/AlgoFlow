import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId } from '../../../types/algorithm';
import { NumberVisualizer } from '../NumberVisualizer';

// The real NumberVisualizer for steps of the real Prime Number Checker and Swap traces.
const steps = (id: AlgorithmId, input: number[]) => getAlgorithmDefinition(id)!.generateSteps(input);
const render = (id: AlgorithmId, input: number[], at: (s: ReturnType<typeof steps>) => number) => {
  const all = steps(id, input);
  return renderToStaticMarkup(<NumberVisualizer currentStep={all[at(all)]} stepIntervalMs={700} />);
};
const attr = (html: string, name: string) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map(m => m[1]);
/** one value card: its role attribute and its value as read (tags stripped, so a missing value reads "—not set") */
const cell = (html: string, name: string) => {
  const start = html.indexOf(`data-number-cell="${name}"`);
  if (start < 0) return null;
  const next = html.indexOf('data-number-cell="', start + 1);
  const card = html.slice(start, next < 0 ? undefined : next);
  return {
    role: /data-role="([a-z]*)"/.exec(card)![1],
    value: /data-number-value="[^"]*">(.*?)<\/dd>/.exec(card)![1].replace(/<[^>]+>/g, ''),
  };
};

describe('NumberVisualizer — Prime Number Checker', () => {
  it('a divisor check: n, the divisor and n % i as cards; every divisor tried so far, the current one marked', () => {
    const html = render('prime-check', [29], s => s.findIndex(x => x.codeRef === 'check-divisor' && x.variables?.i === 3));
    expect(attr(html, 'data-number-cell')).toEqual(['n', 'i', 'n % i']);
    expect(cell(html, 'i')).toEqual({ role: 'current', value: '3' });
    expect(cell(html, 'n % i')).toEqual({ role: 'changed', value: '2' });
    expect(attr(html, 'data-divisor')).toEqual(['2', '3']);
    expect(html).toMatch(/data-divisor="3" data-current="true" data-divides="false" aria-current="step"/);
    expect(html).toContain('i = 3 · n % i = 2');
    expect(html).toContain('Divisors checked (2)');
    expect(html).not.toContain('(divides n)');
    expect(html).not.toContain('data-testid="number-result"');
  });

  it('roles are said in words, not only by colour', () => {
    const html = render('prime-check', [29], s => s.findIndex(x => x.codeRef === 'check-divisor'));
    expect(html).toMatch(/data-number-cell="n % i"[^>]*>.*?changed<\/dd>/);
    expect(html).toMatch(/data-number-cell="i"[^>]*>.*?in use<\/dd>/);
  });

  it('a composite: the dividing check is marked and the result explains it', () => {
    const html = render('prime-check', [91], s => s.length - 1);
    expect(html).toMatch(/data-divisor="7" [^>]*data-divides="true"/);
    expect(html).toContain('(divides n)');
    expect(html).toMatch(/role="status" data-testid="number-result" data-result-kind="not-prime"[^>]*>.*91 is not prime: 91 = 7 × 13\./);
  });

  it('a prime and n ≤ 1: the result banner says so', () => {
    expect(render('prime-check', [97], s => s.length - 1)).toMatch(/data-result-kind="prime"[^>]*>.*97 is prime: none of the 8 divisors from 2 to 9 divides it\./);
    const small = render('prime-check', [1], s => s.length - 1);
    expect(small).toContain('1 is not prime: numbers up to 1 are not prime.');
    expect(small).toContain('No divisors checked yet');
  });
});

describe('NumberVisualizer — Swap of Two Numbers', () => {
  it('before the swap: a and b, temp not set yet', () => {
    const html = render('swap-two-numbers', [5, 9], () => 0);
    expect(attr(html, 'data-number-cell')).toEqual(['a', 'b', 'temp']);
    expect(cell(html, 'temp')).toEqual({ role: '', value: '—not set' });
    expect(html).not.toContain('data-testid="divisor-checks"');
  });

  it.each([
    [1, 'temp = a', 'temp', 'a', { a: '5', b: '9', temp: '5' }],
    [2, 'a = b', 'a', 'b', { a: '9', b: '9', temp: '5' }],
    [3, 'b = temp', 'b', 'temp', { a: '9', b: '5', temp: '5' }],
  ])('step %i (%s): the written variable is changed, the read one in use, with the values after it', (i, op, written, read, vals) => {
    const html = render('swap-two-numbers', [5, 9], () => i);
    expect(html).toMatch(new RegExp(`data-testid="number-operation"[^>]*>${op}<`));
    expect(cell(html, written)?.role).toBe('changed');
    expect(cell(html, read)?.role).toBe('current');
    for (const [name, value] of Object.entries(vals)) expect(cell(html, name)?.value, name).toBe(value);
  });

  it('the last step shows the swapped values', () => {
    const html = render('swap-two-numbers', [5, 9], s => s.length - 1);
    expect(html).toMatch(/data-result-kind="swapped"[^>]*>.*Swapped: a = 9, b = 5 \(they were a = 5, b = 9\)\./);
  });
});
