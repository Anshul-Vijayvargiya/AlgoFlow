import React, { useEffect, useState } from 'react';
import { ListOrdered, Target, Hash, Play, Undo2, AlertCircle, Info } from 'lucide-react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { MAX_LIST_SIZE, MAX_VALUE, MIN_VALUE, lastListIndex, maxInputLength, validateListDraft } from '../../engine/inputParsing';

const fieldClass =
  'bg-slate-900 border rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-200 placeholder:text-slate-500 focus:border-cyan-400 w-full';

/** As in InputPanel: the control that applied the input is focused again after the remount that follows. */
const pendingFocus: { id: string | null } = { id: null };
const focusAfterRemount = (id: string | null) => {
  pendingFocus.id = id;
};

const shown = (a: number[]) => (a.length ? a.join(', ') : '(empty)');

/**
 * List values plus, depending on the operation, a value (target for Search, new value for the inserts) and a position
 * (insert / delete at a position). Drafts are validated on every keystroke with the same rules the store applies, and
 * only "Visualize" (or Enter) applies them. Remounted whenever the store's input changes, which resets the drafts.
 */
const LinkedListInputForm: React.FC = () => {
  const selectedAlgorithm = useVisualizerStore(s => s.selectedAlgorithm);
  const array = useVisualizerStore(s => s.array);
  const target = useVisualizerStore(s => s.target);
  const index = useVisualizerStore(s => s.index);
  const inputNotice = useVisualizerStore(s => s.inputNotice);
  const applyInput = useVisualizerStore(s => s.applyInput);
  const restoreOriginalInput = useVisualizerStore(s => s.restoreOriginalInput);

  const def = getAlgorithmDefinition(selectedAlgorithm);
  const spec = def?.inputSpec;

  useEffect(() => {
    if (pendingFocus.id === null) return;
    const wanted = document.getElementById(pendingFocus.id) as HTMLInputElement | HTMLButtonElement | null;
    const el = wanted && !wanted.disabled ? wanted : document.getElementById('list-input');
    focusAfterRemount(null);
    el?.focus();
  }, []);

  const [listText, setListText] = useState(array.join(', '));
  const [valueText, setValueText] = useState(target === null ? '' : String(target));
  const [indexText, setIndexText] = useState(index === null ? '' : String(index));

  if (!def) return null;
  const draft = validateListDraft(def, listText, valueText, indexText);
  const bad = (field: 'list' | 'value' | 'index') => !draft.ok && draft.field === field;
  const max = maxInputLength(def);
  const draftLength = draft.ok ? draft.list.length : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.ok) return;
    const active = document.activeElement;
    focusAfterRemount(active instanceof HTMLElement && e.currentTarget.contains(active) && active.id ? active.id : 'apply-input');
    if (!applyInput(draft.list, draft.value, draft.index).ok) focusAfterRemount(null);
  };

  const positionHint = spec?.index
    ? spec.index.bound === 'insert'
      ? ` Position: 0 to the list length${draftLength !== null ? ` (${lastListIndex('insert', draftLength)})` : ''}; the length appends at the end.`
      : ` Position: 0 to the last node${draftLength !== null && draftLength > 0 ? ` (${lastListIndex('delete', draftLength)})` : ''}.`
    : '';

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="list-input-panel"
      aria-label="Linked list input"
      className="bg-surface border border-cyan-500/20 rounded-2xl p-4 flex flex-col gap-3 shadow-xl"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="list-input" className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
            <ListOrdered className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            List values
          </label>
          <input
            id="list-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={listText}
            onChange={e => setListText(e.target.value)}
            placeholder="4, 7, 1, 9"
            aria-invalid={bad('list')}
            aria-describedby="list-input-hint list-input-error"
            className={`${fieldClass} ${bad('list') ? 'border-rose-500/70' : 'border-slate-700'}`}
          />
        </div>

        {spec?.value && (
          <div className="w-32">
            <label htmlFor="value-input" className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
              <Target className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              {spec.value.label}
            </label>
            <input
              id="value-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={valueText}
              onChange={e => setValueText(e.target.value)}
              placeholder={String(spec.value.defaultValue)}
              aria-invalid={bad('value')}
              aria-describedby="list-input-hint list-input-error"
              className={`${fieldClass} ${bad('value') ? 'border-rose-500/70' : 'border-slate-700'}`}
            />
          </div>
        )}

        {spec?.index && (
          <div className="w-28">
            <label htmlFor="index-input" className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
              <Hash className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              {spec.index.label}
            </label>
            <input
              id="index-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={indexText}
              onChange={e => setIndexText(e.target.value)}
              placeholder={String(spec.index.defaultValue)}
              aria-invalid={bad('index')}
              aria-describedby="list-input-hint list-input-error"
              className={`${fieldClass} ${bad('index') ? 'border-rose-500/70' : 'border-slate-700'}`}
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

      <p id="list-input-hint" className="flex items-start gap-1.5 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>
          Up to {max} whole numbers ({MIN_VALUE} to {MAX_VALUE}), separated by commas, read from HEAD to TAIL
          {spec?.addsNode ? ` (this operation adds a node, and the visualizer shows at most ${MAX_LIST_SIZE})` : ''}. Leave
          the list blank for an empty list.{spec?.value ? ` ${spec.value.hint}.` : ''}
          {positionHint}
        </span>
      </p>

      <div aria-live="polite" aria-atomic="true" data-testid="input-error-live">
        {!draft.ok && (
          <div
            id="list-input-error"
            data-testid="input-error"
            data-field={draft.field}
            className="flex flex-wrap items-center gap-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-[200px]">{draft.message}</span>
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
          <span className="flex-1 min-w-[200px]">Your entered list ({shown(inputNotice.original)}) was replaced by a random one.</span>
          <button
            type="button"
            id="restore-input"
            onClick={() => {
              focusAfterRemount('list-input');
              restoreOriginalInput();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-600 text-slate-200 font-mono hover:border-cyan-400"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            Restore my list
          </button>
        </div>
      )}
    </form>
  );
};

export const LinkedListInputPanel: React.FC = () => {
  const selectedAlgorithm = useVisualizerStore(s => s.selectedAlgorithm);
  const revision = useVisualizerStore(s => s.inputRevision);
  return <LinkedListInputForm key={`${selectedAlgorithm}:${revision}`} />;
};
