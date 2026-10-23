import { Schema, model, Document } from 'mongoose';

/**
 * SUBMITTED: recorded without a verdict (a problem that is not judged automatically, and every attempt made before
 * judging existed). PENDING is a legacy value. The rest are verdicts; JUDGING_ERROR means the judge could not finish
 * (the execution service failed), not that the program was wrong.
 */
export type SubmissionStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'RUNTIME_ERROR'
  | 'COMPILATION_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'JUDGING_ERROR';
export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'SUBMITTED', 'PENDING', 'ACCEPTED', 'WRONG_ANSWER', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'TIME_LIMIT_EXCEEDED', 'JUDGING_ERROR',
];

export interface ISubmission extends Document {
  userId: Schema.Types.ObjectId;
  problemId: string;
  language: 'cpp' | 'c' | 'java' | 'python';
  code: string;
  status: SubmissionStatus;
  passed: boolean;
  runtimeMs: number;
  memoryMb: number;
  message?: string;
  /** judged submissions: tests passed and run (absent on unjudged and legacy records) */
  testsPassed?: number;
  testsTotal?: number;
  /** the first failing test (1-based) and whether it is hidden */
  failedTestNumber?: number;
  failedTestHidden?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubmissionSchema = new Schema<ISubmission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    problemId: { type: String, required: true, index: true, lowercase: true, trim: true },
    language: { type: String, enum: ['cpp', 'c', 'java', 'python'], required: true },
    code: { type: String, required: true, maxlength: 50000 },
    status: {
      type: String,
      enum: SUBMISSION_STATUSES,
      default: 'SUBMITTED',
      index: true,
    },
    passed: { type: Boolean, default: false },
    runtimeMs: { type: Number, default: 0 },
    memoryMb: { type: Number, default: 0 },
    message: { type: String, default: 'Solution submitted for practice evaluation.' },
    testsPassed: { type: Number, min: 0 },
    testsTotal: { type: Number, min: 0 },
    failedTestNumber: { type: Number, min: 1 },
    failedTestHidden: { type: Boolean },
  },
  { timestamps: true }
);

SubmissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
SubmissionSchema.index({ userId: 1, status: 1 });

export const Submission = model<ISubmission>('Submission', SubmissionSchema);

