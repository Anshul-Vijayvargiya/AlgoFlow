import { Schema, model, Types } from 'mongoose';

/**
 * One signed-in device (a "session" or refresh-token family). The refresh token itself is never stored: only the
 * SHA-256 of the current one, and of the few it replaced, so a replayed old token is recognised as reuse.
 *
 * Authorization never relies on this collection's TTL deletion: every check compares `expiresAt` and `revokedAt`
 * itself. The TTL index only removes documents a week after they expired, to keep the collection small.
 */
export type SessionRevokedReason = 'logout' | 'logout_all' | 'reuse_detected' | 'account_inactive' | 'token_version';

export interface IAuthSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** SHA-256 (hex) of the current refresh token */
  tokenHash: string;
  /** hashes of the most recent tokens this session rotated away from (reuse detection) */
  previousTokenHashes: string[];
  /** the token rotated away from last, and when: a request still carrying it moments later is a race, not reuse */
  rotatedFromHash?: string;
  rotatedAt?: Date;
  /** the user's tokenVersion when the session began: a later logout-all, suspension or role change ends it */
  tokenVersion: number;
  createdAt: Date;
  lastUsedAt: Date;
  /** the current refresh token's expiry (it moves forward on each rotation) */
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: SessionRevokedReason;
}

/** how many previous token hashes are kept per session for reuse detection */
export const PREVIOUS_TOKEN_HASHES_KEPT = 10;

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    previousTokenHashes: { type: [String], default: [], index: true },
    rotatedFromHash: { type: String },
    rotatedAt: { type: Date },
    tokenVersion: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String, enum: ['logout', 'logout_all', 'reuse_detected', 'account_inactive', 'token_version'] },
  },
  { versionKey: false }
);

// clean-up only (a week after expiry); never an authorization decision
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const AuthSession = model<IAuthSession>('AuthSession', AuthSessionSchema);
