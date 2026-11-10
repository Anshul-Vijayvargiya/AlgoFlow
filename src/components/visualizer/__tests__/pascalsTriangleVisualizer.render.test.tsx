import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { PascalsTriangleVisualizer } from '../PascalsTriangleVisualizer';

// The real PascalsTriangleVisualizer for steps of the real Pascal's Triangle trace: the triangle, the cell being
// calculated, its parents and their sum, the boundary cells, the completed and appended rows and the final result.
const run = (numRows: number) => getAlgorithmDefinition('dp-pascals-triangle')!.generateSteps([numRows]);
const render = (s: ExecutionStep) => renderToStaticMarkup(<PascalsTriangleVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
/** every cell as "row,col=value:state" (no value: "row,col=:state") */
const cells = (html: string) => [...html.matchAll(/data-tri-cell="(\d+,\d+)" data-value="(\d*)" data-state="([a-z-]+)"/g)].map(m => `${m[1]}=${m[2]}:${m[3]}`);
const cell = (html: string, rc: string) => cells(html).find(c => c.startsWith(`${rc}=`));
/** the text a reader sees, tags removed */
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ''));
const rows = (html: string) => [...html.matchAll(/data-tri-row="(\d+)" data-row-state="([a-z-]+)"/g)].map(m => `${m[1]}:${m[2]}`);

const STEPS = run(5);
const find = (codeRef: string, i: number, j?: number) => STEPS.find(s => s.codeRef === codeRef && s.triangle!.i === i && (j === undefined || s.triangle!.j === j))!;

describe('PascalsTriangleVisualizer', () => {
  it('the first step: every row of the triangle is an empty placeholder, nothing built yet', () => {
    const html = decode(render(STEPS[0]));
    expect(cells(html)).toHaveLength(15);
    expect(cells(html).every(c => c.endsWith('=:pending'))).toBe(true);
    expect(rows(html)).toEqual(['0:pending', '1:pending', '2:pending', '3:pending', '4:pending']);
    expect(text(html)).toContain('triangle: [ ]');
    expect(html).toContain('0 / 5 rows');
    expect(html).toContain('The triangle has no rows yet.');
    expect(html).not.toContain('data-testid="triangle-result"');
  });

  it('a centred triangle: 2n equal columns, row r starting n - r columns in, every cell two columns wide', () => {
    const html = render(STEPS.at(-1)!);
    expect(html).toMatch(/data-testid="triangle-grid"[^>]*style="width:min\(100%, 16.25rem\);grid-template-columns:repeat\(10, minmax\(0, 1fr\)\)"/);
    const place = (rc: string) => html.match(new RegExp(`data-tri-cell="${rc}"[^>]*style="grid-row:(\\d+);grid-column:([^;]+);`))!.slice(1).join(' | ');
    expect(place('0,0')).toBe('1 | 5 / span 2');
    expect(place('1,0')).toBe('2 | 4 / span 2');
    expect(place('1,1')).toBe('2 | 6 / span 2');
    expect(place('4,0')).toBe('5 | 1 / span 2');
    expect(place('4,4')).toBe('5 | 9 / span 2');
  });

  it('a boundary cell: highlighted, and the calculation says "Boundary element = 1"', () => {
    const first = decode(render(find('set-first', 2)));
    expect(cell(first, '2,0')).toBe('2,0=1:boundary');
    expect(cell(first, '2,1')).toBe('2,1=:unset');
    expect(cell(first, '2,2')).toBe('2,2=:unset');
    expect(first).toMatch(/data-testid="triangle-calc" data-kind="boundary"/);
    expect(first).toContain('Boundary element = 1');
    expect(first).toMatch(/data-legend="boundary"[^>]*>.*boundary element = 1/);
    const last = decode(render(find('set-last', 2)));
    expect(cell(last, '2,2')).toBe('2,2=1:boundary');
    expect(cell(last, '2,0')).toBe('2,0=1:set');
  });

  it('the parents: the two cells above the current cell are marked; the current cell waits for its value', () => {
    const html = decode(render(find('read-parents', 4, 2)));
    expect(cell(html, '3,1')).toBe('3,1=3:parent');
    expect(cell(html, '3,2')).toBe('3,2=3:parent');
    expect(cell(html, '3,0')).toBe('3,0=1:complete');
    expect(cell(html, '4,2')).toBe('4,2=:current');
    expect(html).toMatch(/data-tri-cell="4,2"[^>]*>\?<\/div>/);
    expect(html).toContain('3 + 3 = ?');
    expect(html).toMatch(/data-legend="set"[^>]*>.*set in this row/);
    expect(html).toMatch(/data-testid="triangle-vars"[^>]*>i = <span[^>]*>4<\/span>, j = <span[^>]*>2<\/span>/);
  });

  it('the calculation "3 + 3 = 6", then the current cell gets 6 and is marked as just assigned', () => {
    expect(decode(render(find('add-parents', 4, 2)))).toContain('3 + 3 = 6');
    const html = decode(render(find('assign-cell', 4, 2)));
    expect(cell(html, '4,2')).toBe('4,2=6:assigned');
    expect(cell(html, '3,1')).toBe('3,1=3:parent');
    expect(html).toContain('3 + 3 = 6  → row[2]');
    expect(html).toMatch(/data-testid="triangle-calc" data-kind="assigned"/);
    // the next step leaves the cell as set, without the parents
    const next = decode(render(STEPS[STEPS.indexOf(find('assign-cell', 4, 2)) + 1]));
    expect(cell(next, '4,2')).toBe('4,2=6:set');
    expect(cell(next, '3,1')).toBe('3,1=3:complete');
  });

  it('a completed row is marked as complete, then as appended to the triangle', () => {
    const complete = decode(render(STEPS.find(s => s.triangle!.rowComplete && s.triangle!.i === 3)!));
    expect(rows(complete)[3]).toBe('3:row-complete');
    expect(cells(complete).filter(c => c.startsWith('3,'))).toEqual(['3,0=1:row-complete', '3,1=3:row-complete', '3,2=3:row-complete', '3,3=1:row-complete']);
    expect(complete).toContain('Row 3 complete: [1, 3, 3, 1]');
    const appended = decode(render(find('add-row', 3)));
    expect(rows(appended)).toEqual(['0:complete', '1:complete', '2:complete', '3:appended', '4:pending']);
    expect(appended).toContain('Row 3 appended: [1, 3, 3, 1]');
    expect(text(appended)).toContain('triangle: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]');
    expect(appended).toContain('4 / 5 rows');
  });

  it('the final result: the whole triangle, the generated array, and the answer announced', () => {
    const html = decode(render(STEPS.at(-1)!));
    expect(cells(html)).toEqual(
      [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]].flatMap((r, i) => r.map((v, j) => `${i},${j}=${v}:result`))
    );
    expect(text(html)).toContain('triangle: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]');
    expect(html).toMatch(/role="status" data-testid="triangle-result"/);
    expect(html).toContain("Pascal's Triangle with 5 rows: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]");
    expect(html).toContain('>Done<');
    expect(text(html)).toContain('5 / 5 rows');
  });

  it('screen readers get the triangle in words; the drawing itself is hidden from them', () => {
    const html = decode(render(find('read-parents', 4, 2)));
    expect(html).toMatch(/data-testid="triangle-grid" aria-hidden="true"/);
    expect(html).toContain('Row 3: 1, 3 (parent of the current cell), 3 (parent of the current cell), 1. Row 4: 1, 4, being calculated, not set, 1.');
  });

  it('responsive: ten rows shrink the cells and the text to fit the width instead of scrolling', () => {
    const html = render(run(10).at(-1)!);
    expect(html).toMatch(/data-testid="triangle-grid"[^>]*class="[^"]*text-\[10px\] sm:text-xs"[^>]*style="width:min\(100%, 32.5rem\);grid-template-columns:repeat\(20, minmax\(0, 1fr\)\)"/);
    expect(cells(html)).toHaveLength(55);
    expect(html).not.toContain('overflow-x-auto');
    // a phone leaves about 21px per cell for ten rows: a thinner border there, the usual one from sm up
    expect(html).toMatch(/data-tri-cell="9,4"[^>]*class="[^"]* border sm:border-2 /);
    expect(render(run(7).at(-1)!)).toMatch(/data-tri-cell="6,3"[^>]*class="[^"]* border-2 /);
    expect(render(run(1).at(-1)!)).toMatch(/class="[^"]*text-sm sm:text-base"/);
  });

  it('a step of another algorithm draws nothing', () => {
    expect(renderToStaticMarkup(<PascalsTriangleVisualizer currentStep={{ id: 0, state: [], type: 'init', message: '' }} />)).toBe('');
  });
});
