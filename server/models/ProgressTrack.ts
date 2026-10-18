import { Schema, model, Document } from 'mongoose';

export interface IProgressTrack extends Document {
  userId: Schema.Types.ObjectId;
  algorithmId: string;
  topic?: string;
  status: 'not_started' | 'in_progress' | 'completed';
  stepsCompleted: number;
  totalSteps: number;
  lastStepIndex: number;
  executionCount: number;
  completedAt?: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProgressTrackSchema = new Schema<IProgressTrack>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    algorithmId: { type: String, required: true, trim: true },
    topic: { type: String, trim: true },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
      index: true,
    },
    stepsCompleted: { type: Number, default: 0 },
    totalSteps: { type: Number, default: 0 },
    lastStepIndex: { type: Number, default: 0 },
    executionCount: { type: Number, default: 0 },
    completedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One progress record per user per algorithm
ProgressTrackSchema.index({ userId: 1, algorithmId: 1 }, { unique: true });
ProgressTrackSchema.index({ userId: 1, status: 1 });
ProgressTrackSchema.index({ userId: 1, lastActivityAt: -1 });

export const ProgressTrack = model<IProgressTrack>('ProgressTrack', ProgressTrackSchema);

