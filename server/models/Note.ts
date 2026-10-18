import { Schema, model, Document } from 'mongoose';

export interface INote extends Document {
  userId: Schema.Types.ObjectId;
  title: string;
  content: string;
  algorithmId?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<INote>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    content: { type: String, required: true, maxlength: 10000 },
    algorithmId: { type: String, trim: true, index: true },
    tags: [{ type: String, trim: true, maxlength: 30 }],
  },
  { timestamps: true }
);

// Compound index for user note queries sorted by update date
NoteSchema.index({ userId: 1, updatedAt: -1 });
NoteSchema.index({ userId: 1, tags: 1 });
NoteSchema.index({ userId: 1, algorithmId: 1 });

NoteSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  return obj;
};

export const Note = model<INote>('Note', NoteSchema);

