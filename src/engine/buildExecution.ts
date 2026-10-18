/**
 * buildExecution — turns (algorithm id, input) into an explicit execution result.
 *
 * Four outcomes are kept distinct so a defect in one algorithm can never be
 * disguised as "coming soon":
 *   ok                 — steps generated from the registered definition
 *   unimplemented      — the id is known and explicitly marked implemented:false in the nav data
 *   invalid-algorithm  — the id is unknown, or marked implemented but not registered
 *   generator-error    — the registered generator threw
 *
 * `error.message` is safe to show to end users. `error.detail` / `error.cause`
 * are for development only; callers must not render them in production.
 */
import type { AlgorithmDefinition, AlgorithmId, ExecutionStep } from '../types/algorithm';
import { getAlgorithmDefinition } from './AlgorithmRegistry';
import { ALGORITHM_NAV } from '../data/algorithmMetadata';

export type ExecutionFailureKind = 'invalid-algorithm' | 'generator-error';

export interface ExecutionFailure {
  kind: ExecutionFailureKind;
  message: string;
  detail?: string;
  cause?: unknown;
}

export type ExecutionBuild =
  | { status: 'ok'; steps: ExecutionStep[] }
  | { status: 'unimplemented'; steps: ExecutionStep[] }
  | { status: 'invalid-algorithm'; steps: ExecutionStep[]; error: ExecutionFailure }
  | { status: 'generator-error'; steps: ExecutionStep[]; error: ExecutionFailure };

export type DefinitionLookup = (id: AlgorithmId) => AlgorithmDefinition | undefined;

function unimplementedSteps(name: string): ExecutionStep[] {
  return [
    {
      id: 0,
      type: 'init',
      codeRef: undefined,
      state: [],
      message: `"${name}" visualization is not implemented yet.`,
      explanation:
        'This algorithm visualization is coming soon. Select a fully implemented algorithm from the sidebar.',
      actionLabel: 'Not Implemented',
    },
  ];
}

export function buildExecution(
  id: AlgorithmId,
  input: number[],
  lookup: DefinitionLookup = getAlgorithmDefinition,
  params?: Record<string, unknown>
): ExecutionBuild {
  const nav = ALGORITHM_NAV.find(a => a.id === id);
  const def = lookup(id);

  if (!def) {
    if (nav && !nav.implemented) {
      return { status: 'unimplemented', steps: unimplementedSteps(nav.name) };
    }
    return {
      status: 'invalid-algorithm',
      steps: [],
      error: {
        kind: 'invalid-algorithm',
        message: 'This algorithm could not be loaded.',
        detail: nav
          ? `"${id}" is marked implemented in the navigation data but is not registered.`
          : `"${String(id)}" is not a known algorithm id.`,
      },
    };
  }

  try {
    return { status: 'ok', steps: def.generateSteps([...input], params) };
  } catch (cause) {
    return {
      status: 'generator-error',
      steps: [],
      error: {
        kind: 'generator-error',
        message: 'The visualization for this algorithm failed to run.',
        detail: cause instanceof Error ? cause.message : String(cause),
        cause,
      },
    };
  }
}
