import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { Sidebar } from '../../layout/Sidebar';
import { BitVisualizer } from '../BitVisualizer';

// The real BitVisualizer for steps of the real traces: each row's bits and position labels, its signed and unsigned
// values, the state of every bit, the discarded bits and the result.
const run = (id: AlgorithmId, ...args: number[]) => getAlgorithmDefinition(id)!.generateSteps(args);
const render = (s: ExecutionStep) => renderToStaticMarkup(<BitVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
/** the markup of one row */
const rowHtml = (html: string, id: string) => {
  const at = html.indexOf(`data-row="${id}"`);
  expect(at, `row ${id}`).toBeGreaterThan(-1);
  const end = html.indexOf('data-testid="bit-row"', at);
  return html.slice(at, end === -1 ? undefined : end);
};
/** a row's cells as position → "bit:state", in the order drawn */
const cells = (html: string) => [...html.matchAll(/data-pos="(\d+)" data-bit="([01]?)" data-state="([a-z]+)"/g)].map(m => ({ pos: Number(m[1]), bit: m[2], state: m[3] }));
const stateOf = (html: string, id: string, pos: number) => cells(rowHtml(html, id)).find(c => c.pos === pos)!.state;

describe('BitVisualizer', () => {
  it('bit positions: 32 in each row, 31 on the left down to 0 on the right, each with its label', () => {
    const html = render(run('bitwise-and', 12, 10)[0]);
    const a = rowHtml(html, 'a');
    expect(cells(a).map(c => c.pos)).toEqual(Array.from({ length: 32 }, (_, k) => 31 - k));
    // every cell is labelled with its position, just above it
    for (const p of [31, 16, 8, 1, 0]) expect(a).toMatch(new RegExp(`>${p}</span><span data-pos="${p}"`));
    expect(html).toContain('position 0 is the rightmost bit');
    // four bytes, which wrap on a narrow screen
    expect(a).toMatch(/flex flex-wrap gap-x-2/);
    expect(a.match(/class="flex gap-px"/g)).toHaveLength(4);
  });

  it('the binary and decimal display: the bits as drawn, with the signed and unsigned values', () => {
    const html = render(run('bit-check-even', -3)[0]);
    const n = rowHtml(html, 'n');
    expect(n).toContain(`data-binary="${'1'.repeat(30)}01"`);
    expect(n).toContain('data-signed="-3"');
    expect(n).toContain('data-unsigned="4294967293"');
    expect(cells(n).map(c => c.bit).join('')).toBe(`${'1'.repeat(30)}01`);
    expect(decode(n)).toContain('signed: <span class="font-bold text-cyan-300">-3</span>');
    expect(decode(n)).toContain('unsigned: <span class="font-bold text-cyan-300">4294967293</span>');
    expect(html).toContain('data-role="input"');
  });

  it('says which integer model is in use, and what is being evaluated', () => {
    const html = render(run('bit-clear-ith', 13, 2)[0]);
    expect(html).toContain('signed 32-bit two&#x27;s complement');
    expect(decode(html)).toContain('data-testid="bit-expression" class="font-bold text-cyan-300">n & ~(1 << i)</span>');
    expect(html).toContain('data-testid="bit-operation"');
  });

  it('selected bits: the position the step works on, in the inputs', () => {
    const step = run('bitwise-and', 12, 10)[3]; // position 2
    const html = render(step);
    expect(stateOf(html, 'a', 2)).toBe('selected');
    expect(stateOf(html, 'b', 2)).toBe('selected');
    expect(stateOf(html, 'a', 3)).toBe('unchanged');
    // its label stands out, and the legend says what the colour means
    expect(rowHtml(html, 'a')).toMatch(/font-bold text-amber-200">2<\/span><span data-pos="2"/);
    expect(html).toContain('data-legend="selected"');
    expect(decode(html)).toContain('selected: position 2');
  });

  it('a result in progress: the bits worked out so far, the others pending, no decimal value yet', () => {
    const html = render(run('bitwise-and', 12, 10)[3]);
    const r = rowHtml(html, 'result');
    expect(stateOf(html, 'result', 2)).toBe('cleared');
    expect(stateOf(html, 'result', 3)).toBe('pending');
    expect(stateOf(html, 'result', 31)).toBe('pending');
    expect(r).toContain('data-signed=""');
    expect(r).toContain('being worked out');
    expect(r).toMatch(/data-binary="·{29}000"/);
    expect(html).toContain('data-legend="pending"');
  });

  it('changed bits: set, cleared and flipped are drawn and said differently', () => {
    const set = render(run('bit-set-ith', 8, 1).at(-1)!);
    expect(stateOf(set, 'result', 1)).toBe('set');
    expect(rowHtml(set, 'result')).toMatch(/data-pos="1" data-bit="1" data-state="set"[^>]*bg-emerald/);
    expect(decode(set)).toContain('set to 1: position 1');
    const clear = render(run('bit-clear-ith', 13, 2).at(-1)!);
    expect(stateOf(clear, 'result', 2)).toBe('cleared');
    expect(rowHtml(clear, 'result')).toMatch(/data-pos="2" data-bit="0" data-state="cleared"[^>]*bg-rose/);
    expect(decode(clear)).toContain('cleared to 0: position 2');
    const flip = render(run('bitwise-not', 12)[1]);
    expect(stateOf(flip, 'result', 0)).toBe('flipped');
    expect(rowHtml(flip, 'result')).toMatch(/data-pos="0" data-bit="1" data-state="flipped"[^>]*bg-sky/);
  });

  it('shifts: moved bits, the fill and the discarded bits', () => {
    const left = render(run('bitwise-left-shift', -1, 2).at(-2)!);
    expect(stateOf(left, 'result', 5)).toBe('shifted');
    expect(stateOf(left, 'result', 0)).toBe('cleared');
    expect(stateOf(left, 'a', 31)).toBe('selected');
    expect(left).toContain('data-testid="bit-discarded" data-bits="11"');
    const right = render(run('bitwise-right-shift', -16, 2).find(s => s.message === 'a >> 2 = -4')!);
    expect(stateOf(right, 'result', 31)).toBe('set');
    expect(stateOf(right, 'result', 3)).toBe('shifted');
    expect(right).toContain('data-testid="bit-discarded" data-bits="00"');
    // no shift, nothing discarded
    expect(render(run('bitwise-left-shift', 5, 0).at(-1)!)).not.toContain('bit-discarded');
  });

  it('right shift shows the logical result next to the arithmetic one', () => {
    const html = render(run('bitwise-right-shift', -16, 2).at(-1)!);
    expect(rowHtml(html, 'result')).toContain('data-signed="-4"');
    expect(rowHtml(html, 'logical')).toContain('data-unsigned="1073741820"');
    expect(rowHtml(html, 'logical')).toContain('logical shift, for comparison');
  });

  it('final results: the status line; before the last step there is none', () => {
    const steps = run('bitwise-and', 12, 10);
    expect(render(steps[5])).not.toContain('data-testid="bit-result"');
    const html = render(steps.at(-1)!);
    expect(html).toMatch(/role="status" data-testid="bit-result"/);
    expect(html).toContain('12 &amp; 10 = 8');
    expect(rowHtml(html, 'result')).toContain('data-signed="8"');
    expect(stateOf(html, 'result', 3)).toBe('set');
    expect(render(run('bit-check-even', 6).at(-1)!)).toContain('EVEN: bit 0 of 6 is 0');
    expect(render(run('bit-check-even', 7).at(-1)!)).toContain('ODD: bit 0 of 7 is 1');
    expect(render(run('bit-update-ith', 13, 2, 0).at(-1)!)).toContain('Bit 2 of 13: old 1, new 0, result 9');
  });

  it('the rows are described in words for assistive technology; the drawn cells are hidden from it', () => {
    const html = render(run('bit-set-ith', 8, 1).at(-1)!);
    expect(decode(html)).toContain('n: 8 as signed, 8 as unsigned; bits from position 31 to 0: 00000000000000000000000000001000. selected: position 1.');
    expect(rowHtml(html, 'n')).toMatch(/<div aria-hidden="true" class="flex flex-wrap/);
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<BitVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});

describe('Bit manipulation — the input and the sidebar', () => {
  it('input validation: each algorithm declares its own fields, saying what each accepts (the panel itself: bit-manipulation.spec.ts)', () => {
    const fields = (id: AlgorithmId) => getAlgorithmDefinition(id)!.inputSpec!.numbers!.map(f => [f.label, f.hint, f.min, f.max]);
    expect(fields('bit-clear-range')).toEqual([
      ['n', 'A whole number from -2147483648 to 2147483647 (a signed 32-bit integer)', -2147483648, 2147483647],
      ['l', 'The lower bit position: a whole number from 0 to 31, not above r', 0, 31],
      ['r', 'The upper bit position: a whole number from 0 to 31, not below l', 0, 31],
    ]);
    expect(fields('bit-update-ith')[2]).toEqual(['bit', 'The new bit: 0 or 1', 0, 1]);
    expect(fields('bit-clear-last-i')[1]).toEqual(['i', 'How many low bits to clear: a whole number from 0 to 32', 0, 32]);
    expect(fields('bitwise-left-shift')[1]).toEqual(['i', 'The shift amount: a whole number from 0 to 31', 0, 31]);
  });

  it('the sidebar: the category, its three subheadings in order, each above its first algorithm; no other subheading', () => {
    const html = decode(renderToStaticMarkup(<Sidebar />));
    expect(html).toContain('<span>BIT MANIPULATION</span>');
    expect(html).toContain('>13/13</span>');
    const groups = [...html.matchAll(/data-testid="algorithm-group"[^>]*>([^<]+)</g)].map(m => m[1]);
    expect(groups).toEqual(['Basic Bitwise Operators', 'Basic Bit Manipulation', 'Advanced Bit Manipulation']);
    const at = (t: string) => html.indexOf(t);
    expect(at('Basic Bitwise Operators')).toBeLessThan(at('>Binary AND<'));
    expect(at('>Binary Right Shift<')).toBeLessThan(at('Basic Bit Manipulation'));
    expect(at('Basic Bit Manipulation')).toBeLessThan(at('>Check if Even<'));
    expect(at('>Update i-th Bit<')).toBeLessThan(at('Advanced Bit Manipulation'));
    expect(at('Advanced Bit Manipulation')).toBeLessThan(at('>Clear Last i Bits<'));
    expect(at('>BACKTRACKING<')).toBeLessThan(at('>BIT MANIPULATION<'));
    expect(at('>BIT MANIPULATION<')).toBeLessThan(at('>FUNDAMENTALS<'));
  });
});
