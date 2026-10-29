import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TraceView } from '../TraceView';
import { RECORDED_TRACES } from '../../../execution/recordedTraces.generated';
import { TRACE_SAMPLES } from '../../../execution/traceSamples';
import type { ExecutionTrace } from '../../../execution/trace';

// The step-by-step view as first shown (step 1), for recorded example traces. Playback is covered end to end.
const sample = (id: string) => TRACE_SAMPLES.find(s => s.id === id)!;
/** whether the control with this accessible label is disabled (attribute order aside) */
const isDisabled = (html: string, label: string) => {
  const tag = new RegExp(`<(button|input)[^>]*aria-label="${label}"[^>]*>`).exec(html)![0];
  return / disabled=""/.test(tag);
};
const render = (trace: ExecutionTrace, source: string, stdin = '', stale = false) =>
  renderToStaticMarkup(<TraceView trace={trace} source={source} stdin={stdin} stale={stale} />);

describe('TraceView', () => {
  it('step 1: the program with its first line marked, the global frame, playback at the start', () => {
    const s = sample('factorial');
    const html = render(RECORDED_TRACES.factorial, s.source);
    const first = RECORDED_TRACES.factorial.steps[0];
    expect(html).toMatch(new RegExp(`data-line="${first.line}" data-active="true" aria-current="step"`));
    expect(html.match(/data-active="true"/g)).toHaveLength(1);
    expect(html.match(/data-line="/g)).toHaveLength(s.source.split('\n').length);
    expect(html).toContain(`Step 1 of ${RECORDED_TRACES.factorial.steps.length} · line ${first.line} · next line to run`);
    expect(html).toContain('Global frame');
    expect(isDisabled(html, 'First step')).toBe(true);
    expect(isDisabled(html, 'Previous step')).toBe(true);
    expect(isDisabled(html, 'Next step')).toBe(false);
    expect(html).toContain('(no output yet)');
    expect(html).toMatch(/data-testid="trace-status" data-status="completed"[^>]*>Finished with exit code 0/);
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it('a recorded trace says so; a stale one says the program changed', () => {
    const s = sample('bubble-sort');
    const html = render(RECORDED_TRACES['bubble-sort'], s.source, '', true);
    expect(html).toContain('data-provenance="fixture"');
    expect(html).toContain('Test mode: a recorded trace of this example program');
    expect(html).toContain('data-testid="trace-stale"');
    const runtime = render({ ...RECORDED_TRACES['bubble-sort'], provenance: 'runtime' }, s.source);
    expect(runtime).not.toContain('data-testid="trace-recorded"');
    expect(runtime).not.toContain('data-testid="trace-stale"');
  });

  it('stdin: how much has been read is shown', () => {
    const s = sample('read-and-print');
    expect(render(RECORDED_TRACES['read-and-print'], s.source, s.stdin)).toContain(`Input read: 0 of ${s.stdin.length} characters`);
  });

  it('a syntax error: no steps, the end straight away, the error output', () => {
    const trace: ExecutionTrace = {
      ...RECORDED_TRACES.factorial, provenance: 'runtime', status: 'syntax_error', steps: [], exitCode: null, stdout: '',
      error: { type: 'SyntaxError', message: 'invalid syntax', line: 1 }, stderr: 'SyntaxError: invalid syntax (line 1)\n',
    };
    const html = render(trace, 'def f(:\n');
    expect(html).toContain('No steps: the program did not run');
    expect(html).toContain('Syntax error on line 1: nothing ran');
    expect(html).toMatch(/data-line="1" data-active="false"[^>]*class="[^"]*border-rose-400/);
    expect(html).toContain('SyntaxError: invalid syntax (line 1)');
    expect(isDisabled(html, 'Step')).toBe(true);
  });
});
