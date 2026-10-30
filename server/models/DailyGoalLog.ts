import { Schema, model, Document } from 'mongoose';

/**
 * The daily checklist goals a user ticked themselves on one UTC day (src/data/dailyGoals.ts). Verified goals are never
 * stored: they are derived from the activity log and submissions. One record per user and day; past days are kept.
 * Not activity: a tick here never counts towards the streak or the weekly chart.
 */
export interface IDailyGoalLog extends Document {
  userId: Schema.Types.ObjectId;
  date: string; // YYYY-MM-DD (UTC)
  completed: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DailyGoalLogSchema = new Schema<IDailyGoalLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    completed: [{ type: String, trim: true, maxlength: 40 }],
  },
  { timestamps: true }
);

DailyGoalLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyGoalLog = model<IDailyGoalLog>('DailyGoalLog', DailyGoalLogSchema);
