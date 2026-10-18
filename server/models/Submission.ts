import { Schema, model, Document } from 'mongoose';

export type SubmissionStatus = 'SUBMITTED' | 'PENDING' | 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR';

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
      enum: ['SUBMITTED', 'PENDING', 'ACCEPTED', 'WRONG_ANSWER', 'RUNTIME_ERROR'],
      default: 'SUBMITTED',
      index: true,
    },
    passed: { type: Boolean, default: false },
    runtimeMs: { type: Number, default: 0 },
    memoryMb: { type: Number, default: 0 },
    message: { type: String, default: 'Solution submitted for practice evaluation.' },
  },
  { timestamps: true }
);

SubmissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
SubmissionSchema.index({ userId: 1, status: 1 });

export const Submission = model<ISubmission>('Submission', SubmissionSchema);

