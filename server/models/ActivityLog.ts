import { Schema, model, Document } from 'mongoose';

export type ActivityType =
  | 'visualizer_step'
  | 'algorithm_completed'
  | 'problem_submitted'
  | 'problem_solved';

export interface IActivityLog extends Document {
  userId: Schema.Types.ObjectId;
  date: string; // ISO format: YYYY-MM-DD
  activityType: ActivityType;
  targetId: string;
  minutes: number;
  steps: number;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    activityType: {
      type: String,
      enum: ['visualizer_step', 'algorithm_completed', 'problem_submitted', 'problem_solved'],
      required: true,
      index: true,
    },
    targetId: { type: String, required: true, trim: true },
    minutes: { type: Number, default: 0, min: 0 },
    steps: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Indexes for activity analytics & streak calculation
ActivityLogSchema.index({ userId: 1, date: -1 });
// Deduplication compound index: prevents identical events on the same calendar day from inflating counts
ActivityLogSchema.index({ userId: 1, date: 1, activityType: 1, targetId: 1 }, { unique: true });

export const ActivityLog = model<IActivityLog>('ActivityLog', ActivityLogSchema);
