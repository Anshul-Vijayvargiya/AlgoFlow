import { Schema, model } from 'mongoose';

/**
 * One document per one-time system operation, keyed by a fixed string `_id`. MongoDB guarantees `_id` uniqueness on
 * every deployment (standalone, replica set or sharded), so inserting the same key twice fails with a duplicate-key
 * error (code 11000) no matter how many processes race. Used by adminBootstrap; documents are never deleted after a
 * successful operation.
 */
export interface ISystemLock {
  _id: string;
  operator: string;
  acquiredAt: Date;
}

const SystemLockSchema = new Schema<ISystemLock>(
  {
    _id: { type: String, required: true },
    operator: { type: String, required: true },
    acquiredAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false }
);

export const SystemLock = model<ISystemLock>('SystemLock', SystemLockSchema);
