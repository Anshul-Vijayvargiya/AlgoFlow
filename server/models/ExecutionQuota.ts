import { Schema, model, Document } from 'mongoose';

/**
 * Code executions counted per key and UTC day: `user:<id>` for each user's daily quota and `global` for everyone
 * together (the cap that keeps usage inside the provider plan). One document per key and day.
 */
export interface IExecutionQuota extends Document {
  key: string;
  date: string;
  count: number;
}

const ExecutionQuotaSchema = new Schema<IExecutionQuota>(
  {
    key: { type: String, required: true },
    date: { type: String, required: true },
    count: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

ExecutionQuotaSchema.index({ key: 1, date: 1 }, { unique: true });

export const ExecutionQuota = model<IExecutionQuota>('ExecutionQuota', ExecutionQuotaSchema);
