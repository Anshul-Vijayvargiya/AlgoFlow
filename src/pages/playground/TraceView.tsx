import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronLeft, Play, Pause, ChevronRight, ChevronsRight, Footprints, AlertTriangle, Info } from 'lucide-react';
import type { ExecutionTrace, HeapObject, TraceValue } from '../../execution/trace';
import { heapsByStep } from '../../execution/traceHeap';
import { EVENT_TEXT, changedNames, frameTitle, isEndPosition, outputAt, positionCount, traceHeadline, truncationNotes, valueText } from './traceModel';

const TONE = { success: 'text-emerald-400', error: 'text-rose-400', warning: 'text-amber-400' } as const;
const SPEEDS = [
  { label: 'Slow', ms: 1200 },
  { label: 'Medium', ms: 600 },
  { label: 'Fast', ms: 250 },
] as const;

/** one value: primitives as Python writes them; lists, dicts and objects drawn inline, with shared and cyclic references marked */
const Value: React.FC<{ value: TraceValue; heap: Record<string, HeapObject>; depth?: number; seen?: ReadonlySet<string> }> = ({ value, heap, depth = 2, seen = new Set() }) => {
  if (value.kind !== 'ref') {
    const tone = value.kind === 'str' ? 'text-amber-200' : value.kind === 'other' ? 'text-slate-400 italic' : 'text-cyan-200';
    return (
      <span className={tone}>
        {value.repr}
        {'length' in value && value.length !== undefined && <span className="text-slate-400"> ({value.length.toLocaleString('en-US')} chars)</span>}
      </span>
    );
  }
  const o = heap[value.id];
  const tag = <span className="text-[10px] text-slate-400">#{value.id.slice(1)}</span>;
  if (!o || seen.has(value.id) || depth < 0) {
    return (
      <span className="text-purple-300" title={o ? valueText(value, heap) : undefined}>
        {seen.has(value.id) ? '↺ ' : '→ '}
        {o?.type ?? 'object'} {tag}
      </span>
    );
  }
  const inner = new Set(seen).add(value.id);
  const child = (x: TraceValue, key: React.Key) => <Value key={key} value={x} heap={heap} depth={depth - 1} seen={inner} />;
  const more = (shown: number) => (o.kind !== 'object' && o.length > shown ? <span className="text-slate-400">, … +{o.length - shown} more</span> : null);
  if (o.kind === 'object') {
    const fields = Object.entries(o.fields);
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1 rounded border border-purple-500/30 bg-purple-500/5 px-1">
        <span className="text-purple-300">{o.type}</span>
        {tag}
        {fields.length === 0 ? <span className="text-slate-400">(no fields)</span> : fields.map(([k, x]) => (
          <span key={k}>
            <span className="text-slate-400">{k}=</span>
            {child(x, k)}
          </span>
        ))}
      </span>
    );
  }
  if (o.kind === 'dict') {
    return (
      <span>
        {'{'}
        {o.entries.map(([k, x], i) => (
          <span key={i}>
            {i > 0 && ', '}
            {child(k, 'k')}: {child(x, 'v')}
          </span>
        ))}
        {more(o.entries.length)}
        {'}'} {tag}
      </span>
    );
  }
  const [open, close] = o.kind === 'tuple' ? ['(', ')'] : o.kind === 'set' ? ['{', '}'] : ['[', ']'];
  return (
    <span>
      {open}
      {o.items.map((x, i) => (
        <span key={i} title={o.kind === 'set' ? undefined : `index ${i}`}>
          {i > 0 && ', '}
          {child(x, i)}
        </span>
      ))}
      {more(o.items.length)}
      {close} {tag}
    </span>
  );
};

interface TraceViewProps {
  trace: ExecutionTrace;
  /** the program and input that were traced (the editor may have changed since) */
  source: string;
  stdin: string;
  /** the editor's program or input differs from the traced one */
  stale: boolean;
}

/**
 * The step-by-step view of one trace: the traced program with the line about to run, the call stack with each
 * frame's variables (changed ones marked), the output so far, and playback. Everything shown comes from the trace.
 */
export const TraceView: React.FC<TraceViewProps> = ({ trace, source, stdin, stale }) => {
  const heaps = useMemo(() => heapsByStep(trace), [trace]);
  const total = positionCount(trace);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(SPEEDS[1].ms);
  const activeLine = useRef<HTMLLIElement>(null);

  // (the parent keys this view by trace, so a new trace starts from its first step)
  // playback stops by itself at the last position
  const isPlaying = playing && position < total - 1;
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => setPosition(p => Math.min(p + 1, total - 1)), speed);
    return () => clearTimeout(timer);
  }, [isPlaying, position, total, speed]);

  useEffect(() => {
    activeLine.current?.scrollIntoView({ block: 'nearest' });
  }, [position]);

  const atEnd = isEndPosition(trace, position);
  const step = atEnd ? null : trace.steps[position];
  const heap = heaps[Math.min(position, trace.steps.length - 1)] ?? {};
  const changed = useMemo(() => (step ? changedNames(trace, heaps, position) : new Map<string, Set<string>>()), [trace, heaps, position, step]);
  const output = outputAt(trace, position);
  const headline = traceHeadline(trace);
  const notes = truncationNotes(trace);
  const lines = source.split('\n');
  const stdinUsed = atEnd ? trace.steps[trace.steps.length - 1]?.stdinConsumed ?? 0 : step!.stdinConsumed;
  const go = (p: number) => {
    setPlaying(false);
    setPosition(Math.max(0, Math.min(total - 1, p)));
  };

  const where = step
    ? `Step ${position + 1} of ${trace.steps.length} · line ${step.line} · ${EVENT_TEXT[step.event]}`
    : trace.steps.length === 0
      ? 'No steps: the program did not run'
      : 'The program has ended';

  const button = 'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/50 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <section aria-label="Step-by-step trace" data-testid="trace-view" data-provenance={trace.provenance} className="bg-surface border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
          <Footprints className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          STEP-BY-STEP TRACE
          <span className="font-normal text-slate-400">· {trace.runtime}</span>
        </h2>
        <p data-testid="trace-status" data-status={trace.status} className={`text-xs font-mono font-bold ${TONE[headline.tone]}`}>
          {headline.text}
        </p>
      </div>

      {trace.provenance === 'fixture' && (
        <p role="note" data-testid="trace-recorded" className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-mono text-slate-300">
          <Info className="w-4 h-4 shrink-0 text-cyan-400" aria-hidden="true" />
          Test mode: a recorded trace of this example program (recorded with the real tracer), not a new run of your code.
        </p>
      )}
      {stale && (
        <p role="status" data-testid="trace-stale" className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          The program or its input has changed since this trace. It shows the version below; visualize again to trace your changes.
        </p>
      )}
      {notes.length > 0 && (
        <p data-testid="trace-truncated" className="text-[11px] font-mono text-amber-300">
          Limits applied: {notes.join('; ')}.
        </p>
      )}

      {/* playback */}
      <div role="group" aria-label="Trace playback" className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={() => go(0)} disabled={position === 0} aria-label="First step">
          <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <button type="button" className={button} onClick={() => go(position - 1)} disabled={position === 0} aria-label="Previous step">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${button} w-auto px-3 gap-1.5 text-xs font-mono`}
          onClick={() => {
            if (isPlaying) return setPlaying(false);
            if (position >= total - 1) setPosition(0);
            setPlaying(true);
          }}
          disabled={total <= 1}
        >
          {isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className={button} onClick={() => go(position + 1)} disabled={position >= total - 1} aria-label="Next step">
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <button type="button" className={button} onClick={() => go(total - 1)} disabled={position >= total - 1} aria-label="Last step">
          <ChevronsRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <input
          type="range"
          aria-label="Step"
          aria-valuetext={where}
          min={0}
          max={total - 1}
          value={position}
          onChange={e => go(Number(e.target.value))}
          className="flex-1 min-w-32 accent-cyan-400"
          disabled={total <= 1}
        />
        <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          Speed
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200">
            {SPEEDS.map(s => (
              <option key={s.ms} value={s.ms}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p data-testid="trace-position" data-position={position} aria-live={isPlaying ? 'off' : 'polite'} className="text-xs font-mono text-cyan-300">
        {where}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* the traced program */}
        <div className="lg:col-span-7 min-w-0">
          <h3 className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">Program (main.py)</h3>
          <ol aria-label="Traced program" data-testid="trace-code" className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-page py-2 font-mono text-xs leading-relaxed">
            {lines.map((text, i) => {
              const n = i + 1;
              const active = step?.line === n;
              const errorLine = atEnd && trace.error?.line === n;
              return (
                <li
                  key={n}
                  ref={active ? activeLine : undefined}
                  data-line={n}
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'step' : undefined}
                  className={`flex gap-3 px-2 whitespace-pre ${active ? (step!.event === 'exception' ? 'bg-rose-500/20 border-l-4 border-rose-400' : 'bg-cyan-500/20 border-l-4 border-cyan-400') : errorLine ? 'bg-rose-500/10 border-l-4 border-rose-400/60' : 'border-l-4 border-transparent'}`}
                >
                  <span className="w-8 shrink-0 text-right text-slate-400 select-none" aria-hidden="true">{n}</span>
                  <span className="text-slate-200">{text || ' '}</span>
                  {active && <span className="ml-auto pl-2 text-[10px] text-cyan-300 font-bold">← {EVENT_TEXT[step!.event]}</span>}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="lg:col-span-5 min-w-0 space-y-4">
          {/* call stack and variables */}
          <div>
            <h3 className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">Call stack and variables (innermost first)</h3>
            {!step ? (
              <p className="text-xs font-mono text-slate-400">{trace.steps.length === 0 ? 'Nothing ran.' : 'The program has ended; its frames are gone.'}</p>
            ) : (
              <ol data-testid="trace-frames" className="space-y-2">
                {step.framesOmitted ? <li className="text-[11px] font-mono text-amber-300">{step.framesOmitted} outer frame{step.framesOmitted === 1 ? '' : 's'} not shown</li> : null}
                {[...step.frames].reverse().map((frame, k) => {
                  const current = k === 0;
                  const names = changed.get(frame.id);
                  const locals = Object.entries(frame.locals);
                  return (
                    <li key={frame.id} data-frame={frame.name} data-current={current ? 'true' : 'false'} className={`rounded-xl border px-3 py-2 ${current ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
                      <div className="flex items-baseline justify-between gap-2 text-xs font-mono">
                        <span className={current ? 'text-cyan-300 font-bold' : 'text-slate-300'}>{frameTitle(frame.name)}</span>
                        <span className="text-[10px] text-slate-400">line {frame.line}</span>
                      </div>
                      {locals.length === 0 ? (
                        <p className="text-[11px] font-mono text-slate-400 mt-1">(no variables yet)</p>
                      ) : (
                        <dl className="mt-1 space-y-0.5 text-xs font-mono">
                          {locals.map(([name, value]) => {
                            const isChanged = names?.has(name) ?? false;
                            return (
                              <div key={name} data-variable={name} data-changed={isChanged ? 'true' : 'false'} className={`flex gap-2 rounded px-1 ${isChanged ? 'bg-emerald-500/10' : ''}`}>
                                <dt className="shrink-0 text-slate-300">{name}</dt>
                                <dd className="min-w-0 break-words" data-value-text={valueText(value, heap)}>
                                  <Value value={value} heap={heap} />
                                  {isChanged && <span className="ml-1 text-[10px] text-emerald-400">changed</span>}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      )}
                      {current && step.event === 'return' && step.returnValue && (
                        <p data-testid="trace-return" className="mt-1 text-xs font-mono text-emerald-300">
                          returns <Value value={step.returnValue} heap={heap} />
                        </p>
                      )}
                      {current && step.exception && (
                        <p data-testid="trace-exception" className="mt-1 text-xs font-mono text-rose-300">
                          raises {step.exception.type}{step.exception.message ? `: ${step.exception.message}` : ''}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* output */}
          <div>
            <h3 className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">Output so far (stdout)</h3>
            <pre data-testid="trace-stdout" className="max-h-48 overflow-auto rounded-xl border border-slate-800 bg-console px-3 py-2 font-mono text-xs whitespace-pre-wrap text-cyan-300/90">
              {output.text ? (
                <>
                  {output.text.slice(0, output.text.length - output.fresh)}
                  {output.fresh > 0 && <mark className="bg-emerald-500/20 text-emerald-200">{output.text.slice(output.text.length - output.fresh)}</mark>}
                </>
              ) : (
                <span className="text-slate-400">(no output yet)</span>
              )}
            </pre>
            {stdin.length > 0 && (
              <p data-testid="trace-stdin" className="mt-1 text-[11px] font-mono text-slate-400">
                Input read: {stdinUsed.toLocaleString('en-US')} of {stdin.length.toLocaleString('en-US')} characters
              </p>
            )}
            {atEnd && trace.stderr && (
              <>
                <h3 className="mt-3 text-[10px] font-mono font-bold text-slate-400 uppercase mb-1.5">Errors (stderr)</h3>
                <pre data-testid="trace-stderr" className="max-h-48 overflow-auto rounded-xl border border-slate-800 bg-console px-3 py-2 font-mono text-xs whitespace-pre-wrap text-amber-300">{trace.stderr}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
