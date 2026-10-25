/**
 * useVisualizerStore — Zustand store for the AlgoFlow visualizer.
 *
 * KEY DESIGN RULES:
 * 1. Steps are generated ONCE per (algorithm, input, target) triple. NOT per language.
 *    Language only affects code display — NOT step generation.
 * 2. Code line is resolved at render time via:
 *    resolveCodeRef(def, selectedLanguage, step.codeRef)
 * 3. Failures are explicit (see engine/buildExecution.ts): unimplemented, invalid id
 *    and generator errors are different states. NEVER falls back to another
 *    algorithm and NEVER turns a generator error into "not implemented".
 * 4. An unknown codeRef resolves to null (no highlighted line), never to line 1.
 * 5. USER INPUT is never changed silently. `array` is exactly what the user entered (or what Randomize
 *    produced). Algorithm requirements are validated (engine/inputParsing.ts); an array that does not
 *    satisfy the selected algorithm yields the explicit 'invalid-input' state with NO trace — never a
 *    stale trace from another input/algorithm. The only transformation is the user-triggered,
 *    disclosed `sortInputCopy`.
 * 6. Every input change regenerates synchronously and atomically (steps, status, position 0, playback
 *    stopped, input revision bumped), so a rapid sequence of changes can only ever show the last one.
 */
import { create } from 'zustand';
import type { AlgorithmId, ExecutionStep, ProgrammingLanguage } from '../types/algorithm';
import { getAlgorithmDefinition, resolveCodeRange, resolveCodeRef, visualKindOf } from '../engine/AlgorithmRegistry';
import { buildExecution } from '../engine/buildExecution';
import type { ExecutionBuild, ExecutionFailure } from '../engine/buildExecution';
import { defaultListIndex, lastListIndex, maxInputLength, sortedCopy, validateAlgorithmInput } from '../engine/inputParsing';

export type InputSource = 'default' | 'random' | 'custom';

/** Why the current array differs from what the user last entered (shown with a Restore action). */
export interface InputNotice {
  kind: 'replaced-custom' | 'sorted-copy';
  original: number[];
  /** the position entered with the original list (insert / delete at a position): Size may have moved it into range */
  originalIndex?: number | null;
}

export interface InputIssue {
  message: string;
  canSortCopy: boolean;
}

export type InputResult = { ok: true } | { ok: false; message: string; canSortCopy: boolean };

export type VisualizerStatus = ExecutionBuild['status'] | 'invalid-input';

// ─── Store shape ──────────────────────────────────────────────────────────────
interface VisualizerState {
  selectedAlgorithm: AlgorithmId;
  selectedLanguage: ProgrammingLanguage;
  /** The input array exactly as entered / generated. Never reordered by the store or by generators. */
  array: number[];
  /** Search target / target sum; only meaningful for algorithms whose inputSpec has a target */
  target: number | null;
  /** Linked-list operations that take a position (insert/delete at index); null otherwise */
  index: number | null;
  inputSource: InputSource;
  inputNotice: InputNotice | null;
  /** Set only when status === 'invalid-input' */
  inputIssue: InputIssue | null;
  /** Bumped on every input change so input widgets can reset their drafts */
  inputRevision: number;
  steps: ExecutionStep[];
  /** Outcome of the last trace generation */
  executionStatus: VisualizerStatus;
  executionError: ExecutionFailure | null;
  currentStepIndex: number;
  isPlaying: boolean;
  speed: number;
  arraySize: number;

  /** Resolves the current step's codeRef to a line number; null when the step has no valid mapping */
  resolveCurrentLine: () => number | null;
  resolveCurrentRange: () => { start: number; end: number } | null;

  setAlgorithm: (id: AlgorithmId) => void;
  setLanguage: (lang: ProgrammingLanguage) => void;
  nextStep: () => void;
  previousStep: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  reset: () => void;
  setSpeed: (speedMs: number) => void;
  setArraySize: (size: number) => void;
  randomizeArray: () => void;
  setCurrentStepIndex: (index: number) => void;

  /** Apply user-entered values. Rejected (state untouched) if invalid for the selected algorithm. */
  applyInput: (array: number[], target: number | null, index?: number | null) => InputResult;
  /** Explicit, user-triggered: replace the array with a sorted COPY (original kept in inputNotice). */
  sortInputCopy: (array?: number[], target?: number | null) => InputResult;
  /** Put back the array that Randomize / Size / Sort-a-copy replaced. */
  restoreOriginalInput: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DEFAULT_ALGORITHM: AlgorithmId = 'bubble-sort';
const DEFAULT_LANGUAGE: ProgrammingLanguage = 'cpp';

/** Validates the input, runs the generator and returns the state fields that depend on its outcome. */
function runExecution(id: AlgorithmId, arr: number[], target: number | null, index: number | null) {
  const def = getAlgorithmDefinition(id);
  if (def) {
    const v = validateAlgorithmInput(def, arr, target, index);
    if (!v.ok) {
      return {
        steps: [] as ExecutionStep[],
        executionStatus: 'invalid-input' as VisualizerStatus,
        executionError: null,
        inputIssue: { message: v.message, canSortCopy: v.canSortCopy } as InputIssue | null,
      };
    }
  }
  const spec = def?.inputSpec;
  // searches take `target`; linked-list operations take `value` (held in the same field) and/or `index`
  const params = spec?.target
    ? { target }
    : spec?.value || spec?.index
      ? { ...(spec.value ? { value: target } : {}), ...(spec.index ? { index } : {}) }
      : undefined;
  const result = buildExecution(id, arr, getAlgorithmDefinition, params);
  const executionError = 'error' in result ? result.error : null;
  if (executionError && import.meta.env.DEV) {
    console.error(
      `[AlgoFlow] ${executionError.kind} for "${id}": ${executionError.detail ?? executionError.message}`,
      executionError.cause ?? ''
    );
  }
  return {
    steps: result.steps,
    executionStatus: result.status as VisualizerStatus,
    executionError,
    inputIssue: null as InputIssue | null,
  };
}

/** a whole number from min to max, inclusive */
const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function randomArray(size: number, ascending: boolean): number[] {
  const arr = Array.from({ length: size }, () => Math.floor(Math.random() * 85) + 10);
  return ascending ? sortedCopy(arr) : arr;
}

const atEnd = (s: { steps: ExecutionStep[]; currentStepIndex: number }) =>
  s.steps.length > 0 && s.currentStepIndex >= s.steps.length - 1;

// ─── Store ────────────────────────────────────────────────────────────────────
export const useVisualizerStore = create<VisualizerState>((set, get) => {
  const defDef = getAlgorithmDefinition(DEFAULT_ALGORITHM)!;
  const initialArray = [...defDef.defaultInput];
  const initialRun = runExecution(DEFAULT_ALGORITHM, initialArray, null, null);

  /** Single commit point for every input change: regenerate, reset position, stop playback. */
  const commit = (
    id: AlgorithmId,
    array: number[],
    target: number | null,
    index: number | null,
    inputSource: InputSource,
    inputNotice: InputNotice | null
  ) => {
    const run = runExecution(id, array, target, index);
    set(s => ({
      selectedAlgorithm: id,
      array,
      arraySize: array.length,
      target,
      index,
      inputSource,
      inputNotice,
      inputRevision: s.inputRevision + 1,
      ...run,
      currentStepIndex: 0,
      isPlaying: false,
    }));
  };

  return {
    selectedAlgorithm: DEFAULT_ALGORITHM,
    selectedLanguage: DEFAULT_LANGUAGE,
    array: initialArray,
    target: null,
    index: null,
    inputSource: 'default',
    inputNotice: null,
    inputRevision: 0,
    ...initialRun,
    currentStepIndex: 0,
    isPlaying: false,
    speed: 700,
    arraySize: initialArray.length,

    /**
     * Resolves the current step's codeRef → line number using the selected language.
     * This is the ONLY place where language + codeRef → lineNumber resolution happens.
     */
    resolveCurrentLine: () => {
      const { selectedAlgorithm, selectedLanguage, steps, currentStepIndex } = get();
      const step = steps[currentStepIndex];
      if (!step?.codeRef) return null;
      const def = getAlgorithmDefinition(selectedAlgorithm);
      if (!def) return null;
      return resolveCodeRef(def, selectedLanguage, step.codeRef);
    },

    /** Same resolution as resolveCurrentLine, as the inclusive line range the statement occupies (see lineSpans). */
    resolveCurrentRange: () => {
      const { selectedAlgorithm, selectedLanguage, steps, currentStepIndex } = get();
      const step = steps[currentStepIndex];
      if (!step?.codeRef) return null;
      const def = getAlgorithmDefinition(selectedAlgorithm);
      if (!def) return null;
      return resolveCodeRange(def, selectedLanguage, step.codeRef);
    },

    /**
     * Switching algorithms resets all algorithm-specific state (steps, position, playback, errors).
     * A CUSTOM array/target the user entered is retained and re-validated against the new algorithm
     * (it may become 'invalid-input', never silently altered); default/random arrays are replaced by the
     * new algorithm's own default example.
     */
    setAlgorithm: (id: AlgorithmId) => {
      const s = get();
      const def = getAlgorithmDefinition(id);
      const spec = def?.inputSpec;
      // a search target and a linked-list value share the number field
      const numberSpec = spec?.target ?? spec?.value;
      // a number algorithm's values (n; a, b) and an array are different kinds of input: switching between them loads
      // the new algorithm's own example (array ↔ linked list keeps a custom input, as before)
      const fromKind = visualKindOf(getAlgorithmDefinition(s.selectedAlgorithm));
      const toKind = visualKindOf(def);
      const sameKindOfInput = fromKind === toKind || (fromKind !== 'numbers' && toKind !== 'numbers');
      if (s.inputSource === 'custom' && sameKindOfInput) {
        const target = numberSpec ? (s.target ?? numberSpec.defaultValue) : s.target;
        const index = spec?.index ? (s.index ?? defaultListIndex(spec.index, s.array.length)) : s.index;
        commit(id, s.array, target, index, 'custom', null);
      } else {
        const array = def ? [...def.defaultInput] : [];
        commit(id, array, numberSpec ? numberSpec.defaultValue : null, spec?.index ? defaultListIndex(spec.index, array.length) : null, 'default', null);
      }
    },

    /**
     * Language change does NOT regenerate steps.
     * The steps already contain codeRef strings.
     * The code panel will re-render using the new language's lineMap.
     */
    setLanguage: (lang: ProgrammingLanguage) => {
      set({ selectedLanguage: lang });
    },

    nextStep: () => {
      const { currentStepIndex, steps } = get();
      if (currentStepIndex < steps.length - 1) {
        set({ currentStepIndex: currentStepIndex + 1 });
      } else {
        set({ isPlaying: false });
      }
    },

    previousStep: () => {
      const { currentStepIndex } = get();
      if (currentStepIndex > 0) {
        set({ currentStepIndex: currentStepIndex - 1 });
      }
    },

    // Playing from the last step restarts from step 1 (predictable "replay"), instead of doing nothing.
    play: () =>
      set(s => {
        if (s.steps.length === 0) return {};
        return atEnd(s) ? { currentStepIndex: 0, isPlaying: true } : { isPlaying: true };
      }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () =>
      set(s => {
        if (s.isPlaying) return { isPlaying: false };
        if (s.steps.length === 0) return {};
        return atEnd(s) ? { currentStepIndex: 0, isPlaying: true } : { isPlaying: true };
      }),

    reset: () => set({ currentStepIndex: 0, isPlaying: false }),

    setSpeed: (speedMs: number) => set({ speed: speedMs }),

    /**
     * "Size" and "Randomize" generate a NEW random array (ascending for algorithms that require sorted
     * input — the field shows the actual values). If the user had entered a custom array it is replaced
     * and kept in `inputNotice` so the UI can say so and offer Restore. The target is left unchanged.
     */
    setArraySize: (size: number) => {
      const s = get();
      const def = getAlgorithmDefinition(s.selectedAlgorithm);
      if (!def) return;
      const spec = def.inputSpec;
      if (def.visual === 'numbers') {
        // Randomize: one value per field, from the field's own range (there is no size to choose)
        const values = (spec?.numbers ?? []).map(f => randomInt(...(f.random ?? [f.min, f.max])));
        const kept = s.inputSource === 'custom' ? { kind: 'replaced-custom' as const, original: s.array } : s.inputNotice?.kind === 'replaced-custom' ? s.inputNotice : null;
        commit(s.selectedAlgorithm, values, null, null, 'random', kept);
        return;
      }
      // deleting at a position needs at least one node
      const n = Math.max(spec?.index?.bound === 'delete' ? 1 : 0, Math.min(maxInputLength(def), Math.floor(size)));
      const numberSpec = spec?.target ?? spec?.value;
      const notice: InputNotice | null =
        s.inputSource === 'custom'
          ? { kind: 'replaced-custom', original: s.array, ...(spec?.index ? { originalIndex: s.index } : {}) }
          : s.inputNotice?.kind === 'replaced-custom'
            ? s.inputNotice
            : null;
      commit(
        s.selectedAlgorithm,
        randomArray(n, Boolean(spec?.sortedRequired)),
        numberSpec ? (s.target ?? numberSpec.defaultValue) : s.target,
        // a position is kept when the new list has it; otherwise it moves to the nearest valid one
        spec?.index ? Math.max(0, Math.min(s.index ?? spec.index.defaultValue, lastListIndex(spec.index.bound, n))) : s.index,
        'random',
        notice
      );
    },

    randomizeArray: () => {
      get().setArraySize(get().arraySize);
    },

    setCurrentStepIndex: (index: number) => {
      const maxIdx = get().steps.length - 1;
      set({ currentStepIndex: Math.max(0, Math.min(index, maxIdx)) });
    },

    applyInput: (array, target, index = null) => {
      const s = get();
      const def = getAlgorithmDefinition(s.selectedAlgorithm);
      if (!def) return { ok: false, message: 'This algorithm has no visualization yet.', canSortCopy: false };
      const spec = def.inputSpec;
      const nextTarget = spec?.target || spec?.value ? target : s.target;
      const nextIndex = spec?.index ? index : s.index;
      const v = validateAlgorithmInput(def, array, nextTarget, nextIndex);
      if (!v.ok) return v;
      commit(s.selectedAlgorithm, [...array], nextTarget, nextIndex, 'custom', null);
      return { ok: true };
    },

    sortInputCopy: (array, draftTarget) => {
      const s = get();
      const def = getAlgorithmDefinition(s.selectedAlgorithm);
      if (!def) return { ok: false, message: 'This algorithm has no visualization yet.', canSortCopy: false };
      const original = [...(array ?? s.array)];
      // the target the user has typed (if any) wins over the last applied one
      const target = def.inputSpec?.target ? (draftTarget ?? s.target ?? def.inputSpec.target.defaultValue) : s.target;
      const sorted = sortedCopy(original);
      const v = validateAlgorithmInput(def, sorted, target, s.index);
      if (!v.ok) return v;
      commit(s.selectedAlgorithm, sorted, target, s.index, 'custom', { kind: 'sorted-copy', original });
      return { ok: true };
    },

    restoreOriginalInput: () => {
      const s = get();
      if (!s.inputNotice) return;
      const index = s.inputNotice.originalIndex !== undefined ? s.inputNotice.originalIndex : s.index;
      commit(s.selectedAlgorithm, [...s.inputNotice.original], s.target, index, 'custom', null);
    },
  };
});
