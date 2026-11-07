/**
 * The Revision List's vocabulary. Shared by the server (which validates against it) and the client (which shows it), so
 * neither keeps its own copy. A reason is stored by id, so its wording can change without touching stored records.
 */
export const REVISION_REASONS = [
  { id: 'concept-not-clear', label: 'Concept not clear' },
  { id: 'forgot-the-logic', label: 'Forgot the logic' },
  { id: 'need-more-practice', label: 'Need more practice' },
  { id: 'interview-preparation', label: 'Interview preparation' },
] as const;

export type RevisionReasonId = (typeof REVISION_REASONS)[number]['id'];

export const REVISION_REASON_IDS = REVISION_REASONS.map(r => r.id) as [RevisionReasonId, ...RevisionReasonId[]];

export const REVISION_STATUSES = ['pending', 'revised'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const isRevisionReason = (value: unknown): value is RevisionReasonId => REVISION_REASON_IDS.includes(value as RevisionReasonId);

export const revisionReasonLabel = (id: RevisionReasonId | undefined): string | null => REVISION_REASONS.find(r => r.id === id)?.label ?? null;
