import type { Collection, Db, Document } from 'mongodb';
import type { IDurableRateLimiter, RateLimitDecision } from '../../../application/common/rateLimit.js';

export const RATE_LIMIT_WINDOWS_COLLECTION = 'rateLimitWindows';

const DUPLICATE_KEY = 11000;

/**
 * Fixed windows in `rateLimitWindows` (admin spec 009, research §6): one atomic upsert per call
 * counts it, restarting the window when it is over; the TTL index drops finished windows. Two first
 * calls at once may race on the upsert: the loser retries once against the winner's document.
 */
export class MongoRateLimiter implements IDurableRateLimiter {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(RATE_LIMIT_WINDOWS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });
  }

  async tryConsume(key: string, limit: number, windowSeconds: number, now: Date): Promise<RateLimitDecision> {
    const windowMs = windowSeconds * 1000;
    const expired = { $lte: [{ $ifNull: ['$windowStart', new Date(0)] }, new Date(now.getTime() - windowMs)] };
    const count = () =>
      this.collection.findOneAndUpdate(
        { _id: key } as Document,
        [
          { $set: { count: { $cond: [expired, 1, { $add: ['$count', 1] }] }, windowStart: { $cond: [expired, now, '$windowStart'] } } },
          { $set: { expiresAt: { $add: ['$windowStart', windowMs] } } },
        ],
        { upsert: true, returnDocument: 'after' },
      );

    let doc: Document | null;
    try {
      doc = await count();
    } catch (error) {
      if ((error as { code?: unknown }).code !== DUPLICATE_KEY) throw error;
      doc = await count();
    }
    if (!doc || (doc.count as number) <= limit) return { allowed: true };
    const endsAt = new Date(doc.windowStart as Date).getTime() + windowMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000)) };
  }
}
