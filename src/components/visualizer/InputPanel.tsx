import React, { useEffect, useState } from 'react';
import { ListOrdered, Target, Play, ArrowDownUp, Undo2, AlertCircle, Info } from 'lucide-react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { MAX_ARRAY_SIZE, MAX_VALUE, MIN_VALUE, validateDraft } from '../../engine/inputParsing';

const fieldClass =
  'bg-slate-900 border rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-200 placeholder:text-slate-500 focus:border-cyan-400 w-full';

/**
 * Applying input remounts the panel (so drafts reset to the applied values). To keep the user's place in
 * the workflow, the control that triggered the change is remembered here and focused again after the remount.
 * It is only set by this panel's own actions, so remounts caused by anything else (sidebar, Randomize, Size)
 * never move focus.
 */
let pendingFocusId: string | null = null;

const list = (a: number[]) => (a.length ? a.join(', ') : '(empty)');

/**
 * Editable array (+ target) for the selected algorithm. Drafts live in local state and are validated
 * on every keystroke, but only "Visualize" (or Enter) applies them — so half-typed input never
 * replaces the running trace. Remounted (via `key`) whenever the store's input changes, which resets
 * the drafts to the applied values.
 */
const InputPanelForm: React.FC = () => {
  const selectedAlgorithm = useVisualizerStore(s => s.selectedAlgorithm);
  const array = useVisualizerStore(s => s.array);
  const target = useVisualizerStore(s => s.target);
  const inputNotice = useVisualizerStore(s => s.inputNotice);
  const applyInput = useVisualizerStore(s => s.applyInput);
  const sortInputCopy = useVisualizerStore(s => s.sortInputCopy);
  const restoreOriginalInput = useVisualizerStore(s => s.restoreOriginalInput);

  const def = getAlgorithmDefinition(selectedAlgorithm);
  const spec = def?.inputSpec;

  useEffect(() => {
    if (pendingFocusId === null) return;
    const wanted = document.getElementById(pendingFocusId) as HTMLInputElement | HTMLButtonElement | null;
    const el = wanted && !wanted.disabled ? wanted : document.getElementById('array-input');
    pendingFocusId = null;
    el?.focus();
  }, []);

  const [arrayText, setArrayText] = useState(array.join(', '));
  const [targetText, setTargetText] = useState(target === null ? '' : String(target));

  if (!def) return null;
  const draft = validateDraft(def, arrayText, targetText);
  const arrayBad = !draft.ok && (draft.field === 'array' || draft.field === 'order');
  const targetBad = !draft.ok && draft.field === 'target';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.ok) return;
    const active = document.activeElement;
    pendingFocusId =
      active instanceof HTMLElement && e.currentTarget.contains(active) && active.id ? active.id : 'apply-input';
    if (!applyInput(draft.array, draft.target).ok) pendingFocusId = null;
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="input-panel"
      aria-label="Array and target input"
      className="bg-surface border border-cyan-500/20 rounded-2xl p-4 flex flex-col gap-3 shadow-xl"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="array-input" className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
            <ListOrdered className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            Array
          </label>
          <input
            id="array-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={arrayText}
            onChange={e => setArrayText(e.target.value)}
            placeholder="5, 1, 4, 2"
            aria-invalid={arrayBad}
            aria-describedby="input-hint input-error"
            className={`${fieldClass} ${arrayBad ? 'border-rose-500/70' : 'border-slate-700'}`}
          />
        </div>

        {spec?.target && (
          <div className="w-36">
            <label htmlFor="target-input" className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
              <Target className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              {spec.target.label}
            </label>
            <input
              id="target-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={targetText}
              onChange={e => setTargetText(e.target.value)}
              placeholder="7"
              aria-invalid={targetBad}
              aria-describedby="input-hint input-error"
              className={`${fieldClass} ${targetBad ? 'border-rose-500/70' : 'border-slate-700'}`}
            />
          </div>
        )}

        <button
          type="submit"
          id="apply-input"
          disabled={!draft.ok}
          className="self-end flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
          Visualize
        </button>
      </div>

      <p id="input-hint" className="flex items-start gap-1.5 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>
          {spec?.minLength ? `${spec.minLength} to ${MAX_ARRAY_SIZE}` : `Up to ${MAX_ARRAY_SIZE}`} whole numbers ({spec?.minValue ?? MIN_VALUE} to {MAX_VALUE}), separated by commas
          {spec?.sortedRequired ? '; must be sorted ascending' : ''}.
          {spec?.target ? ` ${spec.target.hint}.` : ''}
          {spec?.minLength ? '' : ' Leave the array blank for an empty array.'}
          {spec?.sortedRequired
            ? ' Your order is never changed unless you choose "Sort a copy".'
            : ' Your order is preserved exactly.'}
        </span>
      </p>

      {/* A persistent POLITE live region: the message is read after the user pauses typing, instead of an
          assertive alert interrupting on every keystroke. The field also references it via aria-describedby. */}
      <div aria-live="polite" aria-atomic="true" data-testid="input-error-live">
        {!draft.ok && (
          <div
            id="input-error"
            data-testid="input-error"
            data-field={draft.field}
            className="flex flex-wrap items-center gap-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-[200px]">{draft.message}</span>
            {draft.canSortCopy && draft.array && (
              <button
                type="button"
                id="sort-copy-btn"
                onClick={() => {
                  pendingFocusId = 'array-input';
                  if (!sortInputCopy(draft.array, draft.target).ok) pendingFocusId = null;
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-600 text-slate-200 font-mono hover:border-cyan-400"
              >
                <ArrowDownUp className="w-3.5 h-3.5" aria-hidden="true" />
                Sort a copy
              </button>
            )}
          </div>
        )}
      </div>

      {inputNotice && (
        <div
          role="status"
          data-testid="input-notice"
          data-kind={inputNotice.kind}
          className="flex flex-wrap items-center gap-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
        >
          <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">
            {inputNotice.kind === 'sorted-copy'
              ? `Sorted ascending because ${def.name} requires it. Your original order: ${list(inputNotice.original)}.`
              : `Your entered array (${list(inputNotice.original)}) was replaced by a random one.`}
          </span>
          <button
            type="button"
            id="restore-input"
            onClick={() => {
              pendingFocusId = 'array-input';
              restoreOriginalInput();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-600 text-slate-200 font-mono hover:border-cyan-400"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            {inputNotice.kind === 'sorted-copy' ? 'Restore original order' : 'Restore my array'}
          </button>
        </div>
      )}
    </form>
  );
};

export const InputPanel: React.FC = () => {
  const selectedAlgorithm = useVisualizerStore(s => s.selectedAlgorithm);
  const revision = useVisualizerStore(s => s.inputRevision);
  return <InputPanelForm key={`${selectedAlgorithm}:${revision}`} />;
};
