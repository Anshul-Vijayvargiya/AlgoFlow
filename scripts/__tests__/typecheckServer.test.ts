import { describe, expect, it } from 'vitest';
import { compareWithBaseline, parseTscOutput, toBaseline } from '../typecheckServer.ts';

// `npm run typecheck:server`: new server type errors fail, pre-existing (baseline) errors are only counted.

const OUTPUT = [
  'server/routes/noteRoutes.ts(13,15): error TS2769: No overload matches this call.',
  '  The last overload gave the following error.',
  '    Object literal may only specify known properties.',
  'server/routes/noteRoutes.ts(18,15): error TS2769: No overload matches this call.',
  'server\\routes\\progressRoutes.ts(40,9): error TS2339: Property \'toLowerCase\' does not exist on type \'string | string[]\'.',
  'Found 3 errors.',
].join('\r\n');

describe('typecheckServer', () => {
  it('parses tsc --pretty false output, ignoring continuation lines and normalising paths', () => {
    const errors = parseTscOutput(OUTPUT);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({ file: 'server/routes/noteRoutes.ts', line: 13, column: 15, code: 'TS2769', message: 'No overload matches this call.' });
    expect(errors[2].file).toBe('server/routes/progressRoutes.ts');
  });

  it('builds a baseline that counts duplicates and ignores line numbers', () => {
    expect(toBaseline(parseTscOutput(OUTPUT))).toEqual([
      { file: 'server/routes/noteRoutes.ts', code: 'TS2769', message: 'No overload matches this call.', count: 2 },
      { file: 'server/routes/progressRoutes.ts', code: 'TS2339', message: "Property 'toLowerCase' does not exist on type 'string | string[]'.", count: 1 },
    ]);
  });

  it('treats known errors as known even when their lines moved', () => {
    const baseline = toBaseline(parseTscOutput(OUTPUT));
    const moved = parseTscOutput(OUTPUT.replace('(13,15)', '(99,1)').replace('(40,9)', '(41,9)'));
    expect(compareWithBaseline(moved, baseline)).toEqual({ newErrors: [], fixed: [], knownCount: 3 });
  });

  it('reports an extra occurrence of a known message as new (multiset, not set)', () => {
    const baseline = toBaseline(parseTscOutput(OUTPUT));
    const more = parseTscOutput(`${OUTPUT}\nserver/routes/noteRoutes.ts(50,1): error TS2769: No overload matches this call.`);
    const result = compareWithBaseline(more, baseline);
    expect(result.newErrors).toEqual([expect.objectContaining({ line: 50, code: 'TS2769' })]);
    expect(result.knownCount).toBe(3);
  });

  it('reports errors in other files or with other codes as new', () => {
    const baseline = toBaseline(parseTscOutput(OUTPUT));
    const result = compareWithBaseline(
      parseTscOutput('server/services/adminBootstrap.ts(64,30): error TS2769: No overload matches this call.'),
      baseline
    );
    expect(result.newErrors).toHaveLength(1);
    expect(result.knownCount).toBe(0);
  });

  it('reports baseline errors that no longer occur as fixed', () => {
    const baseline = toBaseline(parseTscOutput(OUTPUT));
    const result = compareWithBaseline(parseTscOutput(OUTPUT.split('\r\n').slice(3).join('\n')), baseline);
    expect(result.fixed).toEqual([expect.objectContaining({ file: 'server/routes/noteRoutes.ts', count: 1 })]);
    expect(result.newErrors).toEqual([]);
  });
});
