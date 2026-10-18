import { Schema, model, Document } from 'mongoose';

export interface IUserPreferences {
  theme: 'dark' | 'system';
  preferredLanguage: 'cpp' | 'c' | 'java' | 'python';
  dailyGoalMinutes: number;
}

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  accountStatus: 'active' | 'suspended';
  preferences: IUserPreferences;
  avatarUrl?: string;
  streakDays: number;
  solvedCount: number;
  algorithmsLearned: number;
  // Incremented to revoke every outstanding session token (logout, suspension, role change). See sessionService.
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], default: 'USER' },
    accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    preferences: {
      theme: { type: String, enum: ['dark', 'system'], default: 'dark' },
      preferredLanguage: { type: String, enum: ['cpp', 'c', 'java', 'python'], default: 'cpp' },
      dailyGoalMinutes: { type: Number, default: 30, min: 5, max: 300 },
    },
    avatarUrl: { type: String },
    streakDays: { type: Number, default: 0 },
    solvedCount: { type: Number, default: 0 },
    algorithmsLearned: { type: Number, default: 0 },
    tokenVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export const User = model<IUser>('User', UserSchema);

