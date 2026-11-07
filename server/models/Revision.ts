import { Schema, model, Document } from 'mongoose';
import { REVISION_REASON_IDS, REVISION_STATUSES, type RevisionReasonId, type RevisionStatus } from '../../src/data/revisions';

export interface IRevision extends Document {
  userId: Schema.Types.ObjectId;
  algorithmId: string;
  status: RevisionStatus;
  reason?: RevisionReasonId;
  /** when it was last marked as revised; absent while pending */
  revisedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RevisionSchema = new Schema<IRevision>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    algorithmId: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: REVISION_STATUSES, default: 'pending', required: true },
    reason: { type: String, enum: REVISION_REASON_IDS },
    revisedAt: { type: Date },
  },
  { timestamps: true }
);

// One record per user per algorithm; also serves the user's list (its prefix is userId)
RevisionSchema.index({ userId: 1, algorithmId: 1 }, { unique: true });

export const Revision = model<IRevision>('Revision', RevisionSchema);
