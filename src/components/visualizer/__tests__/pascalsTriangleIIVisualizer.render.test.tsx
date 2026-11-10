import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { PascalsTriangleIIVisualizer } from '../PascalsTriangleIIVisualizer';

// The real PascalsTriangleIIVisualizer for steps of the real Pascal's Triangle II trace: the one DP array, the cell being
// updated and the value added to it, the cells this pass has updated, the backward direction and the calculation.
const run = (rowIndex: number) => getAlgorithmDefinition('dp-pascals-triangle-ii')!.generateSteps([rowIndex]);
const render = (s: ExecutionStep) => renderToStaticMarkup(<PascalsTriangleIIVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
/** every position as "k=value:state" */
const cells = (html: string) => [...html.matchAll(/data-dp-cell="(\d+)" data-value="(\d*)" data-state="([a-z-]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
const pointers = (html: string) => [...html.matchAll(/data-dp-pointer="(\d+)"[^>]*>([^<]*)</g)].filter(m => m[2]).map(m => `${m[1]}:${m[2]}`);
const calc = (html: string) => decode(html.match(/data-testid="dp-row-calc" data-kind="([a-z-]*)"[^>]*>(?:<pre[^>]*>([^<]*)<\/pre>)?/)!.slice(1).join('|'));

const STEPS = run(3);
const find = (codeRef: string, i: number, j?: number) => STEPS.find(s => s.codeRef === codeRef && s.dpRow!.i === i && (j === undefined || s.dpRow!.j === j))!;

describe('PascalsTriangleIIVisualizer', () => {
  it('the first step: an empty array, its rowIndex + 1 positions reserved as empty outlines', () => {
    const html = decode(render(STEPS[0]));
    expect(cells(html)).toEqual(['0=:pending', '1=:pending', '2=:pending', '3=:pending']);
    expect(text(html)).toContain('row: [ ]');
    expect(html).toContain('The row array is empty.');
    expect(html).not.toContain('data-testid="dp-row-result"');
  });

  it('a boundary insertion: the new last 1 is highlighted, and the calculation says every row ends in 1', () => {
    const html = decode(render(find('append-one', 3)));
    expect(cells(html)).toEqual(['0=1:normal', '1=2:normal', '2=1:normal', '3=1:appended']);
    expect(calc(html)).toBe('appended|row[3] = 1 — every row ends in 1');
    expect(html).toMatch(/data-legend="appended"[^>]*>.*new last 1/);
  });

  it('the current cell row[j] and the value added to it, row[j − 1], are marked, with their pointers', () => {
    const html = decode(render(find('read-values', 3, 2)));
    expect(cells(html)).toEqual(['0=1:normal', '1=2:addend', '2=1:current', '3=1:normal']);
    expect(pointers(html)).toEqual(['1:j − 1', '2:j']);
    expect(html).toMatch(/data-legend="current"[^>]*>.*row\[j\]: being updated/);
    expect(html).toMatch(/data-legend="addend"[^>]*>.*row\[j − 1\]: added to it/);
  });

  it('the calculation: row[2] = row[2] + row[1], = 1 + 2, = ?, then = 3, then row[2] holds 3', () => {
    expect(calc(decode(render(STEPS.find(s => s.codeRef === 'col-loop' && s.result === 'true' && s.dpRow!.i === 3 && s.dpRow!.j === 2)!)))).toBe('selected|row[2] = row[2] + row[1]');
    expect(calc(decode(render(find('read-values', 3, 2))))).toBe('read|row[2] = row[2] + row[1]\n       = 1 + 2\n       = ?');
    expect(calc(decode(render(find('add-values', 3, 2))))).toBe('sum|row[2] = row[2] + row[1]\n       = 1 + 2\n       = 3');
    const html = decode(render(find('update-cell', 3, 2)));
    expect(cells(html)).toEqual(['0=1:normal', '1=2:addend', '2=3:updated', '3=1:normal']);
    expect(calc(html).startsWith('updated|')).toBe(true);
  });

  it('backward iteration: the direction is shown, cells this pass updated are new, cells to the left still the previous row', () => {
    // row 3, the loop check that selects j = 1: row[2] was updated already (right of j), row[1] is updated next
    const html = decode(render(STEPS.find(s => s.codeRef === 'col-loop' && s.result === 'true' && s.dpRow!.i === 3 && s.dpRow!.j === 1)!));
    expect(cells(html)).toEqual(['0=1:normal', '1=2:current', '2=3:fresh', '3=1:normal']);
    expect(html).toContain('data-testid="dp-row-direction"');
    expect(text(html)).toContain('← j runs from right to left, so row[j − 1] still holds the previous row');
    // in row 5 at j = 3: 4 was updated, 1 and 2 not yet
    const row5 = decode(render(run(5).find(s => s.codeRef === 'col-loop' && s.dpRow!.i === 5 && s.dpRow!.j === 3 && s.result === 'true')!));
    expect(cells(row5).map(c => c.split(':')[1])).toEqual(['normal', 'old', 'old', 'current', 'fresh', 'normal']);
    expect(row5).toMatch(/data-legend="old"[^>]*>.*still the previous row/);
    // no direction outside the backward loop
    expect(render(find('append-one', 3))).not.toContain('data-testid="dp-row-direction"');
  });

  it('a completed row: every cell marked, and the row stated', () => {
    const html = decode(render(STEPS.find(s => s.dpRow!.rowComplete && s.dpRow!.i === 3)!));
    expect(cells(html)).toEqual(['0=1:row-complete', '1=3:row-complete', '2=3:row-complete', '3=1:row-complete']);
    expect(calc(html)).toBe('row-complete|Row 3 complete: [1, 3, 3, 1]');
  });

  it('the completed result: the final row, every cell final, and the answer announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(cells(html)).toEqual(['0=1:result', '1=3:result', '2=3:result', '3=1:result']);
    expect(html).toMatch(/data-testid="dp-row-array" data-values="1,3,3,1"/);
    expect(html).toMatch(/role="status" data-testid="dp-row-result"/);
    expect(text(html)).toContain("Row 3 of Pascal's Triangle: [1, 3, 3, 1]");
  });

  it('screen readers get the array in words; the cells themselves are hidden from them', () => {
    const html = decode(render(find('read-values', 3, 2)));
    expect(html).toMatch(/data-testid="dp-row-cells" aria-hidden="true"/);
    expect(html).toContain('The row array: row[0] = 1, row[1] = 2 (row[j − 1]: added to it), row[2] = 1 (row[j]: being updated), row[3] = 1.');
  });

  it('responsive: rowIndex 9 shrinks cells, borders and text to fit instead of scrolling', () => {
    const html = render(run(9).at(-1)!);
    expect(html).toMatch(/style="width:min\(100%, 35rem\)"/);
    expect(html).toMatch(/data-testid="dp-row-cells"[^>]*class="[^"]*gap-0.5 sm:gap-1.5[^"]*text-\[10px\] sm:text-sm"[^>]*style="grid-template-columns:repeat\(10, minmax\(0, 1fr\)\)"/);
    expect(html).toMatch(/data-dp-cell="4"[^>]*class="[^"]* border sm:border-2 /);
    expect(html).not.toContain('overflow-x-auto');
    expect(render(run(0).at(-1)!)).toMatch(/data-dp-cell="0"[^>]*class="[^"]* border-2 /);
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<PascalsTriangleIIVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});
