import { Schema, model, Document, Types } from 'mongoose';

export interface IAdminAuditLog extends Document {
  // A document value is a Types.ObjectId; Schema.Types.ObjectId is the schema type and only belongs in the schema below
  adminId: Types.ObjectId;
  action: string;
  targetType: 'USER' | 'PROBLEM' | 'SETTINGS' | 'SYSTEM';
  targetId: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: ['USER', 'PROBLEM', 'SETTINGS', 'SYSTEM'],
      required: true,
      index: true,
    },
    targetId: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AdminAuditLogSchema.index({ createdAt: -1 });

export const AdminAuditLog = model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);
