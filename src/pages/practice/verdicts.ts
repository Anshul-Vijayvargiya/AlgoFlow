import type { SubmissionStatus } from '../../api';

export type VerdictTone = 'success' | 'error' | 'warning' | 'neutral';

/** how each stored status is named and coloured; SUBMITTED and PENDING are attempts recorded without a verdict */
export const VERDICTS: Record<SubmissionStatus, { label: string; tone: VerdictTone }> = {
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  WRONG_ANSWER: { label: 'Wrong Answer', tone: 'error' },
  COMPILATION_ERROR: { label: 'Compilation Error', tone: 'error' },
  RUNTIME_ERROR: { label: 'Runtime Error', tone: 'error' },
  TIME_LIMIT_EXCEEDED: { label: 'Time Limit Exceeded', tone: 'warning' },
  JUDGING_ERROR: { label: 'Judging Error', tone: 'warning' },
  SUBMITTED: { label: 'Recorded (not judged)', tone: 'neutral' },
  PENDING: { label: 'Pending (not judged)', tone: 'neutral' },
};

/** an unknown status from an older or newer server is shown as it is, never as a verdict */
export const verdictOf = (status: string) => VERDICTS[status as SubmissionStatus] ?? { label: status, tone: 'neutral' as const };

export const TONE_TEXT: Record<VerdictTone, string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  warning: 'text-amber-400',
  neutral: 'text-slate-400',
};

export const TONE_PANEL: Record<VerdictTone, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/30',
  error: 'bg-rose-500/10 border-rose-500/30',
  warning: 'bg-amber-500/10 border-amber-500/30',
  neutral: 'bg-cyan-500/10 border-cyan-500/30',
};
