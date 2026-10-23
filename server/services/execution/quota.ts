import { ExecutionQuota } from '../../models/ExecutionQuota';

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const isDuplicateKey = (err: unknown) => (err as { code?: number } | null)?.code === 11000;

/**
 * Takes `amount` executions (one per program run: a practice submission runs one per test) from key's allowance for
 * today, all or none. Atomic: the increment only matches while enough is left, so concurrent requests can never
 * exceed the limit. Returns the new count, or null when not enough is left.
 */
export async function consumeQuota(key: string, limit: number, date = utcDay(), amount = 1): Promise<number | null> {
  if (amount > limit) return null;
  const op = (upsert: boolean) =>
    ExecutionQuota.findOneAndUpdate(
      { key, date, count: { $lte: limit - amount } },
      { $inc: { count: amount } },
      { upsert, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  try {
    const doc = await op(true);
    return doc ? doc.count : null;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    // the day's document exists but is at the limit (the upsert tried to insert a second one), or a concurrent
    // first request created it: one more conditional increment without inserting decides which
    const doc = await op(false);
    return doc ? doc.count : null;
  }
}

/** gives back executions taken by consumeQuota that were not used (the provider never accepted the program) */
export async function refundQuota(key: string, date = utcDay(), amount = 1): Promise<void> {
  if (amount <= 0) return;
  await ExecutionQuota.updateOne({ key, date, count: { $gte: amount } }, { $inc: { count: -amount } });
}

export async function quotaUsed(key: string, date = utcDay()): Promise<number> {
  const doc = await ExecutionQuota.findOne({ key, date }).lean();
  return doc?.count ?? 0;
}
