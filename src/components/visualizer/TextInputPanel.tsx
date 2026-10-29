import React, { useEffect, useState } from 'react';
import { Type, Play, Undo2, AlertCircle, Info } from 'lucide-react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getAlgorithmDefinition } from '../../engine/AlgorithmRegistry';
import { validateTextDraft } from '../../engine/inputParsing';

const fieldClass =
  'bg-slate-900 border rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-200 placeholder:text-slate-500 focus:border-cyan-400 w-full';

/** as in InputPanel: the control that applied the input gets focus back after the remount the change causes */
let pendingFocusId: string | null = null;

const fieldId = (label: string) => `text-input-${label}`;

/**
 * The strings a text algorithm takes (s; haystack and needle; a and b), declared by its inputSpec.texts. Values are
 * kept exactly as typed — spaces included — and validated on every keystroke; only "Visualize" (or Enter) applies
 * them. Remounted whenever the store's input changes, which resets the drafts to the applied values.
 */
const TextInputForm: React.FC = () => {
  const selectedAlgorithm = useVisualizerStore(s => s.selectedAlgorithm);
  const texts = useVisualizerStore(s => s.texts);
  const inputNotice = useVisualizerStore(s => s.inputNotice);
  const applyInput = useVisualizerStore(s => s.applyInput);
  const restoreOriginalInput = useVisualizerStore(s => s.restoreOriginalInput);

  const def = getAlgorithmDefinition(selectedAlgorithm);
  const fields = def?.inputSpec?.texts ?? [];

  useEffect(() => {
    if (pendingFocusId === null) return;
    const el = document.getElementById(pendingFocusId) as HTMLInputElement | HTMLButtonElement | null;
    pendingFocusId = null;
    el?.focus();
  }, []);

  const [drafts, setDrafts] = useState<string[]>(() => fields.map((f, i) => texts?.[i] ?? f.defaultValue));

  if (!def) return null;
  const draft = validateTextDraft(def, drafts);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.ok) return;
    const active = document.activeElement;
    pendingFocusId = active instanceof HTMLElement && e.currentTarget.contains(active) && active.id ? active.id : 'apply-input';
    if (!applyInput([], null, null, null, draft.texts).ok) pendingFocusId = null;
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="text-input-panel"
      aria-label={`${def.name} input`}
      className="bg-surface border border-cyan-500/20 rounded-2xl p-4 flex flex-col gap-3 shadow-xl"
    >
      <div className="flex flex-wrap items-start gap-3">
        {fields.map((field, i) => {
          const bad = !draft.ok && draft.field === i;
          return (
            <div key={field.label} className="flex-1 min-w-[12rem]">
              <label htmlFor={fieldId(field.label)} className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
                <Type className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                {field.label}
              </label>
              <input
                id={fieldId(field.label)}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={drafts[i] ?? ''}
                onChange={e => setDrafts(d => d.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={field.defaultValue}
                aria-invalid={bad}
                aria-describedby="text-input-hint text-input-error"
                className={`${fieldClass} ${bad ? 'border-rose-500/70' : 'border-slate-700'}`}
              />
            </div>
          );
        })}

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

      <p id="text-input-hint" className="flex items-start gap-1.5 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>{fields.map(f => `${f.label}: ${f.hint.charAt(0).toLowerCase()}${f.hint.slice(1)}`).join('. ')}.</span>
      </p>

      {/* a POLITE live region, read after the user pauses typing (as in InputPanel) */}
      <div aria-live="polite" aria-atomic="true" data-testid="text-input-error-live">
        {!draft.ok && (
          <div
            id="text-input-error"
            data-testid="input-error"
            data-field={fields[draft.field]?.label}
            className="flex flex-wrap items-center gap-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-[200px]">{draft.message}</span>
          </div>
        )}
      </div>

      {inputNotice?.kind === 'replaced-custom' && inputNotice.originalTexts && (
        <div
          role="status"
          data-testid="input-notice"
          data-kind={inputNotice.kind}
          className="flex flex-wrap items-center gap-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
        >
          <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">
            Your input ({fields.map((f, i) => `${f.label} = ${JSON.stringify(inputNotice.originalTexts![i] ?? '')}`).join(', ')}) was replaced by an example.
          </span>
          <button
            type="button"
            id="restore-input"
            onClick={() => {
              pendingFocusId = fieldId(fields[0]?.label ?? '');
              restoreOriginalInput();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-600 text-slate-200 font-mono hover:border-cyan-400"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            Restore my input
          </button>
        </div>
      )}
    </form>
  );
};

export const TextInputPanel: React.FC = () => {
  const selectedAlgorithm = useVisualizerStore(s => s.selectedAlgorithm);
  const revision = useVisualizerStore(s => s.inputRevision);
  return <TextInputForm key={`${selectedAlgorithm}:${revision}`} />;
};
