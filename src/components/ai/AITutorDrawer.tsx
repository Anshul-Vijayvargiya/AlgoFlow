import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Send, X, Lightbulb, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';
import { apiClient, type ExecutionLanguageId, type TutorStatus } from '../../api';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getAlgorithmById } from '../../data/algorithmMetadata';
import { isImplementedAlgorithm } from '../../data/algorithmCatalog';
import { historyForRequest, type TutorMessage } from './tutorConversation';

interface AITutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  'Explain what is happening at the current step.',
  'What is the time and space complexity of this algorithm, and why?',
  'Is there a more efficient approach or a common variation?',
];

/**
 * The AI Tutor. Answers come only from the server (POST /api/tutor/messages), which builds the algorithm context from
 * its own run of the visualizer's algorithm. When the server has no AI provider, or a request fails, the drawer says
 * so; it never shows an answer the server did not return. The conversation stays in this component (never stored).
 */
export const AITutorDrawer: React.FC<AITutorDrawerProps> = ({ isOpen, onClose }) => {
  const { selectedAlgorithm, selectedLanguage, array, target, index, second, texts, steps, currentStepIndex, executionStatus } = useVisualizerStore();
  const meta = getAlgorithmById(selectedAlgorithm);
  const language = selectedLanguage as ExecutionLanguageId;
  const canAskAboutState = executionStatus === 'ok' && isImplementedAlgorithm(selectedAlgorithm) && steps.length > 0;

  const [status, setStatus] = useState<{ state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: TutorStatus }>({ state: 'loading' });
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const fetchStatus = useCallback(() => {
    apiClient.tutor.getStatus().then(
      data => setStatus({ state: 'ready', data }),
      (err: Error) => setStatus({ state: 'error', message: err.message || 'Could not reach the server.' })
    );
  }, []);

  // on opening: check availability, move focus into the dialog; on closing: give focus back
  useEffect(() => {
    if (!isOpen) return;
    // where focus goes back on closing: what had it, or the AI Tutor button (Safari does not focus a clicked button)
    const active = document.activeElement as HTMLElement | null;
    returnFocusTo.current = active && active !== document.body ? active : document.getElementById('header-ai-tutor-btn');
    fetchStatus();
    // the input stays disabled until availability is known: focus the dialog itself first (unless the question field,
    // enabled by a fast availability answer, already has focus)
    const t = setTimeout(() => {
      if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      returnFocusTo.current?.focus();
    };
  }, [isOpen, fetchStatus]);

  // Escape closes from anywhere while open (focus can leave the dialog, e.g. when a pressed button becomes disabled)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // once the tutor is known to be available, move focus to the question field
  const isAvailable = status.state === 'ready' && status.data.available;
  useEffect(() => {
    if (isOpen && isAvailable) inputRef.current?.focus();
  }, [isOpen, isAvailable]);

  if (!isOpen) return null;

  const ready = status.state === 'ready' ? status.data : null;
  const available = Boolean(ready?.available);
  const maxChars = ready?.limits.questionMaxChars ?? 500;

  const ask = async (question: string, conversation: TutorMessage[]) => {
    const q = question.trim();
    if (!q || pending || !available || !canAskAboutState) return;
    const withQuestion: TutorMessage[] = [...conversation, { id: nextId.current++, role: 'user', text: q }];
    setMessages(withQuestion);
    setPending(true);
    try {
      const reply = await apiClient.tutor.ask({
        algorithmId: selectedAlgorithm,
        input: { array, target, index, ...(second !== null ? { second } : {}), ...(texts !== null ? { texts } : {}) },
        stepIndex: currentStepIndex,
        language,
        question: q,
        history: historyForRequest(conversation),
      });
      setMessages(m => [...m, { id: nextId.current++, role: 'model', text: reply.answer, truncated: reply.truncated }]);
    } catch (err) {
      // no answer: say so, and offer to ask again (nothing is invented)
      setMessages(m => [...m, { id: nextId.current++, role: 'error', text: (err as Error)?.message || 'The AI Tutor could not answer.', question: q }]);
    } finally {
      setPending(false);
    }
  };

  const retry = (errorId: number) => {
    const idx = messages.findIndex(m => m.id === errorId);
    const failed = messages[idx];
    if (failed?.role !== 'error') return;
    // ask again from the conversation as it was before the failed question
    void ask(failed.question, messages.slice(0, Math.max(0, idx - 1)));
  };

  // keyboard: Tab stays inside the dialog (Escape is handled for the whole window, above)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const sendDisabled = !available || !canAskAboutState || pending || !input.trim();

  return (
    <>
      {/* backdrop: clicking outside closes (the page behind is not interactive while the dialog is open) */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-tutor-title"
        aria-describedby={canAskAboutState ? undefined : 'ai-tutor-context'}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="ai-tutor"
        className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-page border-l border-cyan-500/30 z-50 flex flex-col shadow-2xl focus:outline-none"
      >
        {/* Header */}
        <div className="p-4 bg-surface border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-white shrink-0" aria-hidden="true">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="ai-tutor-title" className="text-sm font-bold font-mono text-ink">AI Tutor</h2>
              {/* only when questions cannot be sent: says why (the Send button is disabled) */}
              {!canAskAboutState && (
                <p id="ai-tutor-context" data-testid="ai-tutor-context" className="text-[11px] text-slate-400 truncate">
                  {meta.name}: open an algorithm the visualizer can run to ask about its steps
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Tutor"
            className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-ink hover:bg-slate-800"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Availability */}
        {status.state === 'loading' && (
          <p role="status" className="px-4 py-2 text-xs font-mono text-slate-400">Checking whether the AI Tutor is available…</p>
        )}
        {status.state === 'error' && (
          <div role="alert" data-testid="ai-tutor-status-error" className="m-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300 flex flex-wrap items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">The AI Tutor could not be reached: {status.message}</span>
            <button
              type="button"
              onClick={() => {
                setStatus({ state: 'loading' });
                fetchStatus();
              }}
              className="font-mono font-bold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
        {ready && !ready.available && (
          <p role="status" data-testid="ai-tutor-unavailable" className="m-4 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300">
            The AI Tutor is not available on this server, so it cannot answer questions right now.
          </p>
        )}

        {/* Conversation */}
        <div role="log" aria-live="polite" aria-label="Conversation" data-testid="ai-tutor-log" className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
          {available && messages.length === 0 && (
            <p className="text-xs text-slate-400">
              Ask about {canAskAboutState ? 'the current step, the code or the complexity' : 'an algorithm once it is open in the visualizer'}.
            </p>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              {m.role === 'user' && (
                <div className="max-w-[85%] p-3 rounded-2xl rounded-br-none text-xs leading-relaxed bg-gradient-to-r from-cyan-600 to-blue-600 text-white whitespace-pre-wrap">
                  <span className="sr-only">You: </span>
                  {m.text}
                </div>
              )}
              {m.role === 'model' && (
                <div data-testid="ai-tutor-answer" className="max-w-[85%] p-3 rounded-2xl rounded-bl-none text-xs leading-relaxed bg-surface border border-slate-800 text-slate-200">
                  <span className="block text-[10px] font-mono text-cyan-400 mb-1">AI Tutor</span>
                  {/* plain text only: model output is never rendered as HTML */}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  {m.truncated && <p className="mt-1 text-[10px] text-amber-300">This answer was cut short.</p>}
                </div>
              )}
              {m.role === 'error' && (
                <div data-testid="ai-tutor-error" className="max-w-[85%] p-3 rounded-2xl text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                  <p>
                    <span className="sr-only">Error: </span>
                    {m.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => retry(m.id)}
                    disabled={pending}
                    className="flex items-center gap-1 font-mono font-bold underline underline-offset-2 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    Ask again
                  </button>
                </div>
              )}
            </div>
          ))}
          {pending && (
            <p role="status" data-testid="ai-tutor-pending" className="flex items-center gap-2 text-xs text-cyan-300 font-mono">
              <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" />
              Waiting for the tutor's answer…
            </p>
          )}
        </div>

        {/* Quick questions */}
        {available && (
          <div className="px-4 py-2 border-t border-slate-800 flex flex-wrap gap-1.5 shrink-0">
            {QUICK_PROMPTS.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  inputRef.current?.focus();
                  void ask(q, messages);
                }}
                disabled={pending || !canAskAboutState}
                className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/40 disabled:opacity-50 flex items-center gap-1"
              >
                <Lightbulb className="w-2.5 h-2.5 text-amber-400" aria-hidden="true" />
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 bg-surface border-t border-slate-800 shrink-0 space-y-2">
          <form
            onSubmit={e => {
              e.preventDefault();
              const q = input;
              setInput('');
              // keep the keyboard in the dialog: the send button is disabled while the answer is pending
              inputRef.current?.focus();
              void ask(q, messages);
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="ai-tutor-input" className="sr-only">Your question</label>
            <input
              ref={inputRef}
              id="ai-tutor-input"
              type="text"
              value={input}
              maxLength={maxChars}
              disabled={!available}
              onChange={e => setInput(e.target.value)}
              placeholder={available ? 'Ask about this algorithm…' : 'The AI Tutor is unavailable'}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500/50 font-sans disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Send question"
              disabled={sendDisabled}
              className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white disabled:opacity-40"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
          {ready?.provider === 'gemini' && (
            <p data-testid="ai-tutor-disclosure" className="text-[10px] text-slate-400 leading-snug">
              Answers are generated by AI (Google Gemini) and can be wrong. Your question and the algorithm context are sent to
              Google; don&apos;t include personal information. <Link to="/privacy" className="underline underline-offset-2">Privacy</Link>
            </p>
          )}
          {ready?.provider === 'fake' && (
            <p data-testid="ai-tutor-test-mode" className="text-[10px] text-slate-400">Test mode: answers come from a fake provider, not an AI model.</p>
          )}
        </div>
      </div>
    </>
  );
};
