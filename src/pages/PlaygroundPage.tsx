import React, { useCallback, useEffect, useState } from 'react';
import { Terminal, Play, RotateCcw, Copy, Check, Sliders, Globe, AlertTriangle, Footprints } from 'lucide-react';
import { apiClient, type ExecutionLanguageId, type ExecutionLanguages, type RunResult, type TraceRunResult } from '../api';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { ExecutionTrace } from '../execution/trace';
import { TRACE_SAMPLES, normalizeProgramText } from '../execution/traceSamples';
import { DEFAULT_STDIN, SOURCE_FILE_NAMES, STARTER_PROGRAMS } from './playground/starterPrograms';
import { runHeadline, runMetrics } from './playground/runOutput';
import { TraceView } from './playground/TraceView';

const FALLBACK_NAMES: Record<ExecutionLanguageId, string> = { c: 'C', cpp: 'C++', java: 'Java', python: 'Python' };
const TONE_CLASS = { success: 'text-emerald-400', error: 'text-rose-400', warning: 'text-amber-400' } as const;

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: RunResult }
  | { kind: 'failed'; message: string };

/** a step-by-step trace request: a verified trace (of exactly this program and input), why there is none, or a failure */
type TraceState =
  | { kind: 'idle' }
  | { kind: 'tracing' }
  | { kind: 'traced'; id: number; trace: ExecutionTrace; source: string; stdin: string }
  | { kind: 'none'; result: TraceRunResult }
  | { kind: 'failed'; message: string };

const NO_TRACE_TITLE: Record<TraceRunResult['status'], string> = {
  traced: 'Traced',
  timeout: 'No trace: time limit',
  no_trace: 'No trace',
  invalid_trace: 'Trace not shown',
};

export const PlaygroundPage: React.FC = () => {
  const { selectedLanguage, setLanguage } = useVisualizerStore();
  const language = selectedLanguage as ExecutionLanguageId;
  // one draft per language: switching shows that language's own program and never loses what was typed
  const [drafts, setDrafts] = useState<Record<ExecutionLanguageId, string>>(() => ({ ...STARTER_PROGRAMS }));
  const code = drafts[language];
  const setCode = (value: string) => setDrafts(d => ({ ...d, [language]: value }));

  const [stdin, setStdin] = useState(DEFAULT_STDIN);
  const [copied, setCopied] = useState(false);
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const [traceState, setTraceState] = useState<TraceState>({ kind: 'idle' });
  const [traceCount, setTraceCount] = useState(0);
  const [info, setInfo] = useState<{ state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: ExecutionLanguages }>({ state: 'loading' });

  const fetchLanguages = useCallback(() => {
    apiClient.execution.getLanguages().then(
      data => setInfo({ state: 'ready', data }),
      (err: Error) => setInfo({ state: 'error', message: err.message || 'Could not reach the server.' })
    );
  }, []);
  useEffect(fetchLanguages, [fetchLanguages]);
  const retryLanguages = () => {
    setInfo({ state: 'loading' });
    fetchLanguages();
  };

  const ready = info.state === 'ready' ? info.data : null;
  const offered = ready?.languages.find(l => l.id === language);
  const busy = run.kind === 'running' || traceState.kind === 'tracing';
  const canRun = Boolean(ready?.available && offered) && !busy && code.trim().length > 0;
  const tracing = ready?.tracing ?? null;
  const traceable = Boolean(tracing?.languages.includes(language));
  const canTrace = Boolean(ready?.available && offered) && traceable && !busy && code.trim().length > 0;
  const usedToday = run.kind === 'done' ? run.result.usedToday : ready?.usedToday;

  const handleRun = async () => {
    if (!canRun) return;
    setRun({ kind: 'running' });
    try {
      const result = await apiClient.execution.run({ language, source: code, stdin });
      setRun({ kind: 'done', result });
    } catch (err) {
      // no result: say so, never show output that was not produced
      setRun({ kind: 'failed', message: (err as Error)?.message || 'The program could not be run.' });
    }
  };

  const handleVisualize = async () => {
    if (!canTrace) return;
    const traced = { source: code, stdin };
    setTraceState({ kind: 'tracing' });
    try {
      const result = await apiClient.execution.trace({ language, ...traced });
      if (result.status !== 'traced' || !result.trace) return setTraceState({ kind: 'none', result });
      // verified again here: a trace that does not pass the same checks as on the server is never shown (the
      // validator, with zod, is loaded only now, not with the page)
      const { validateTrace } = await import('../execution/trace');
      const checked = validateTrace(result.trace, traced);
      if (!checked.ok) {
        return setTraceState({ kind: 'none', result: { ...result, status: 'invalid_trace', trace: null, message: 'The trace could not be verified, so it is not shown.' } });
      }
      const id = traceCount + 1;
      setTraceCount(id);
      setTraceState({ kind: 'traced', id, trace: checked.trace, ...traced });
    } catch (err) {
      setTraceState({ kind: 'failed', message: (err as Error)?.message || 'The program could not be traced.' });
    }
  };

  const loadExample = (id: string) => {
    const sample = TRACE_SAMPLES.find(s => s.id === id);
    if (!sample) return;
    setDrafts(d => ({ ...d, python: sample.source }));
    setStdin(sample.stdin);
  };

  const traceIsStale =
    traceState.kind === 'traced' &&
    (normalizeProgramText(traceState.source) !== normalizeProgramText(drafts.python) || normalizeProgramText(traceState.stdin) !== normalizeProgramText(stdin));

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const labelFor = (id: ExecutionLanguageId) => ready?.languages.find(l => l.id === id)?.label ?? FALLBACK_NAMES[id];
  const headline = run.kind === 'done' ? runHeadline(run.result) : null;

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 space-y-6 max-w-7xl mx-auto flex flex-col">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono">
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            MULTI-LANGUAGE PLAYGROUND
          </div>
          <h1 className="text-2xl font-bold font-mono text-ink mt-2">
            Code <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Playground</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-cyan-300">
            <Globe className="w-3.5 h-3.5 mr-2 text-cyan-400" aria-hidden="true" />
            <select
              aria-label="Language to run"
              value={language}
              onChange={(e) => setLanguage(e.target.value as ExecutionLanguageId)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              {(Object.keys(FALLBACK_NAMES) as ExecutionLanguageId[]).map(id => (
                <option key={id} value={id} className="bg-slate-900">{labelFor(id)}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleVisualize}
            disabled={!canTrace}
            aria-busy={traceState.kind === 'tracing'}
            aria-describedby={tracing && !traceable ? 'trace-language-note' : undefined}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 font-mono text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Footprints className="w-4 h-4" aria-hidden="true" />
            <span>{traceState.kind === 'tracing' ? 'Tracing...' : 'Visualize'}</span>
          </button>

          <button
            onClick={handleRun}
            disabled={!canRun}
            aria-busy={run.kind === 'running'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-white" aria-hidden="true" />
            <span>{run.kind === 'running' ? 'Running...' : 'Run Code'}</span>
          </button>
        </div>
      </div>

      {info.state === 'error' && (
        <div role="alert" data-testid="playground-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Code execution could not be loaded: {info.message}</span>
          <button type="button" onClick={retryLanguages} className="font-mono font-bold underline underline-offset-2">Retry</button>
        </div>
      )}
      {ready && !ready.available && (
        <div role="status" data-testid="playground-unavailable" className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Code execution is not available on this server, so programs cannot be run. You can still write and copy code.</span>
        </div>
      )}
      {ready?.available && !offered && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          {FALLBACK_NAMES[language]} cannot be run on this server.
        </div>
      )}
      {tracing && !traceable && (
        <p id="trace-language-note" className="text-xs font-mono text-slate-400">
          Step-by-step visualization is available for Python. Choose Python to visualize a program line by line.
        </p>
      )}
      {tracing?.mode === 'recorded' && traceable && (
        <p role="note" data-testid="playground-recorded-traces" className="text-xs font-mono text-slate-400">
          Test mode: only the example programs, with their example input, can be visualized (their traces were recorded).
        </p>
      )}
      {ready?.provider === 'fake' && (
        <div role="note" data-testid="playground-fake-provider" className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-xs font-mono text-slate-300">
          Test mode: this server uses a fake execution provider. Programs are not compiled or run.
        </div>
      )}

      {/* Main Grid: Code Editor | Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Code Editor Column */}
        <div className="lg:col-span-7 bg-surface border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl min-h-[450px]">
          <div className="px-4 py-3 bg-page border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span className="text-xs font-mono font-bold text-slate-200" data-testid="source-file-name">{SOURCE_FILE_NAMES[language]}</span>
              {language === 'python' && (
                <select
                  aria-label="Load an example program"
                  value=""
                  onChange={(e) => loadExample(e.target.value)}
                  className="ml-2 max-w-40 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-0.5 text-[11px] font-mono text-slate-300"
                >
                  <option value="">Example…</option>
                  {TRACE_SAMPLES.map(s => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              )}
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-cyan-300"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="flex-1 p-3 bg-surface">
            <textarea
              aria-label="Source code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={ready?.limits.sourceMaxChars}
              className="w-full h-full min-h-[380px] bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Input Config & Console Output Column */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Standard input for the program */}
          <div className="bg-surface border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
            <label htmlFor="playground-stdin" className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
              <Sliders className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>STANDARD INPUT (STDIN)</span>
            </label>
            <textarea
              id="playground-stdin"
              rows={3}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              maxLength={ready?.limits.stdinMaxChars}
              placeholder="Input your program reads, e.g. comma separated integers..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500/50 resize-y"
            />
          </div>

          {/* Console Output */}
          <div className="flex-1 bg-console border border-slate-800 rounded-2xl p-4 flex flex-col shadow-xl min-h-[300px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                EXECUTION CONSOLE
              </span>
              <div className="flex items-center gap-3">
                {ready?.available && usedToday !== undefined && (
                  <span data-testid="playground-usage" className="text-[10px] font-mono text-slate-400">
                    {usedToday} / {ready.limits.dailyPerUser} runs today
                  </span>
                )}
                <button
                  onClick={() => setRun({ kind: 'idle' })}
                  aria-label="Clear console"
                  className="p-1 rounded text-slate-400 hover:text-slate-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div data-testid="run-console" className="flex-1 font-mono text-xs leading-relaxed overflow-y-auto custom-scrollbar space-y-3" aria-live="polite">
              {run.kind === 'idle' && (
                <p className="text-slate-400">
                  {info.state === 'loading' ? 'Checking code execution…' : ready?.available ? 'Ready. Press "Run Code" to compile and run your program.' : 'Code execution is unavailable.'}
                </p>
              )}
              {run.kind === 'running' && <p role="status" className="text-cyan-300">Running on the execution service…</p>}
              {run.kind === 'failed' && (
                <p role="alert" data-testid="run-failed" className="text-rose-400">
                  Not run: {run.message}
                </p>
              )}
              {run.kind === 'done' && headline && (
                <>
                  <p role="status" data-testid="run-status" data-status={run.result.status} className={`font-bold ${TONE_CLASS[headline.tone]}`}>
                    {headline.text}
                  </p>
                  {run.result.compileOutput && (
                    <section aria-label="Compiler output">
                      <h2 className="text-[10px] font-bold text-slate-400 uppercase">Compiler output</h2>
                      <pre data-testid="run-compile-output" className="whitespace-pre-wrap text-rose-300">{run.result.compileOutput}</pre>
                    </section>
                  )}
                  <section aria-label="Standard output">
                    <h2 className="text-[10px] font-bold text-slate-400 uppercase">Output (stdout)</h2>
                    <pre data-testid="run-stdout" className="whitespace-pre-wrap text-cyan-300/90">{run.result.stdout || <span className="text-slate-400">(no output)</span>}</pre>
                  </section>
                  {run.result.stderr && (
                    <section aria-label="Standard error">
                      <h2 className="text-[10px] font-bold text-slate-400 uppercase">Errors (stderr)</h2>
                      <pre data-testid="run-stderr" className="whitespace-pre-wrap text-amber-300">{run.result.stderr}</pre>
                    </section>
                  )}
                  {run.result.truncated && <p className="text-amber-300">Output was cut short: it exceeded the size the server returns.</p>}
                  <p data-testid="run-metrics" className="text-slate-400">
                    {[run.result.language?.label, runMetrics(run.result)].filter(Boolean).join(' · ')}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Step-by-step trace (Python) */}
      {traceState.kind === 'tracing' && (
        <p role="status" className="text-xs font-mono text-cyan-300">Running your program under the tracer…</p>
      )}
      {traceState.kind === 'failed' && (
        <p role="alert" data-testid="trace-failed" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          Not traced: {traceState.message}
        </p>
      )}
      {traceState.kind === 'none' && (
        <div role="alert" data-testid="trace-none" data-status={traceState.result.status} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 space-y-2">
          <p className="font-mono font-bold">{NO_TRACE_TITLE[traceState.result.status]}</p>
          <p>{traceState.result.message}</p>
          {traceState.result.stderr && <pre className="whitespace-pre-wrap text-xs font-mono text-amber-200/90">{traceState.result.stderr}</pre>}
        </div>
      )}
      {traceState.kind === 'traced' && (
        <TraceView key={traceState.id} trace={traceState.trace} source={traceState.source} stdin={traceState.stdin} stale={traceIsStale} />
      )}
    </div>
  );
};
