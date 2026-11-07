import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { REVISION_REASONS, type RevisionReasonId } from '../../data/revisions';
import { useRevisionStore } from '../../store/useRevisionStore';

const NO_REASON = 'none';

/**
 * The Visualizer's bookmark: shows whether the algorithm is on the user's Revision List, and opens a small form to add
 * it (a reason is optional), change its reason, mark it revised or pending again, or remove it. Nothing is saved until a
 * button in the form is pressed.
 */
export const RevisionBookmark: React.FC<{ algorithmId: string; algorithmName: string }> = ({ algorithmId, algorithmName }) => {
  const record = useRevisionStore(s => s.items.find(r => r.algorithmId === algorithmId));
  const listStatus = useRevisionStore(s => s.status);
  const listError = useRevisionStore(s => s.error);
  const busy = useRevisionStore(s => s.busy.includes(algorithmId));
  const { load, mark, setStatus, remove } = useRevisionStore.getState();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RevisionReasonId | typeof NO_REASON>(NO_REASON);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // the page is usable on its own (the header normally loads the list first)
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // on the document: Safari does not focus a radio or button on click, so the key press may not come from inside the form
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // into the form when it opens, on the chosen reason
  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const toggle = () => {
    if (!open) {
      setReason(record?.reason ?? NO_REASON);
      setError(null);
    }
    setOpen(!open);
  };

  /** runs a change; the form closes when it worked, and says why when it did not */
  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      close();
    } catch (err) {
      setError((err as Error)?.message || 'That did not work. Please try again.');
    }
  };

  const save = () => run(() => mark(algorithmId, reason === NO_REASON ? null : reason));
  const label = record ? 'Added to Revision' : 'Mark for Revision';
  const Icon = record ? BookmarkCheck : Bookmark;
  // the list is unknown until it loads: the button cannot yet say whether this algorithm is on it
  const unknown = listStatus === 'idle' || listStatus === 'loading';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        data-testid="revision-bookmark"
        data-marked={Boolean(record)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={unknown}
        title={label}
        disabled={unknown}
        onClick={toggle}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
          record
            ? 'bg-purple-500/15 border-purple-400/40 text-purple-300 hover:bg-purple-500/25'
            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-purple-400/50 hover:text-purple-300'
        }`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${record ? 'fill-purple-400/30' : ''}`} aria-hidden="true" />
        {/* phones: the icon alone, so the title row stays one line; the button keeps its name */}
        <span className="hidden sm:inline whitespace-nowrap">{label}</span>
      </button>

      {open && (
        <div
          ref={formRef}
          role="dialog"
          aria-label={`Revision: ${algorithmName}`}
          data-testid="revision-form"
          className="z-30 absolute left-0 top-full mt-2 w-72 max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-32 max-sm:mt-0 max-sm:w-auto bg-slate-900 border border-purple-500/30 rounded-xl shadow-2xl shadow-black/50 p-4 space-y-3"
        >
          <div>
            <p className="text-sm font-semibold text-ink">{record ? 'On your Revision List' : 'Add to your Revision List'}</p>
            {record && (
              <p data-testid="revision-form-status" className="text-xs font-mono text-slate-400 mt-0.5">
                Status: {record.status === 'revised' ? 'Revised' : 'Pending'}
              </p>
            )}
          </div>

          {listStatus === 'error' && (
            <div role="alert" className="text-xs text-rose-300 space-y-1">
              <p>{listError}</p>
              <button type="button" onClick={() => load({ force: true })} className="underline underline-offset-2 cursor-pointer">Retry</button>
            </div>
          )}

          <fieldset className="space-y-1">
            <legend className="text-xs font-mono text-slate-400 mb-1">Reason (optional)</legend>
            {[...REVISION_REASONS, { id: NO_REASON, label: 'No reason' } as const].map(option => (
              <label key={option.id} className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm text-slate-200 hover:bg-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name={`revision-reason-${algorithmId}`}
                  checked={reason === option.id}
                  onChange={() => setReason(option.id)}
                  className="accent-purple-500"
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition-colors cursor-pointer disabled:opacity-60"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
              {record ? 'Update reason' : 'Save'}
            </button>
            <button type="button" onClick={close} className="px-3 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 text-xs font-mono transition-colors cursor-pointer">
              Cancel
            </button>
          </div>

          {record && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setStatus(algorithmId, record.status === 'revised' ? 'pending' : 'revised'))}
                className="text-xs font-mono text-cyan-300 hover:underline underline-offset-2 cursor-pointer disabled:opacity-60"
              >
                {record.status === 'revised' ? 'Revise Again' : 'Mark as Revised'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => remove(algorithmId))}
                className="text-xs font-mono text-rose-300 hover:underline underline-offset-2 cursor-pointer disabled:opacity-60"
              >
                Remove from Revision
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
