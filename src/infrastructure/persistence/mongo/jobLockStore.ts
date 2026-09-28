import type { Collection, Db, Document } from 'mongodb';
import type { IJobLockStore } from '../../../application/features/events/common/ports.js';

export const JOB_LOCKS_COLLECTION = 'jobLocks';

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

/**
 * One lease per scheduled job (research §11). Acquiring matches only an expired lease; when the
 * lease is still held, the upsert tries to insert a second document with the same `_id` and the
 * duplicate-key error means "someone else has it".
 */
export class MongoJobLockStore implements IJobLockStore {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(JOB_LOCKS_COLLECTION);
  }

  async tryAcquire(name: string, now: Date, leaseSeconds: number): Promise<boolean> {
    try {
      await this.collection.findOneAndUpdate(
        { _id: name, lockedUntil: { $lte: now } } as Document,
        { $set: { lockedUntil: new Date(now.getTime() + leaseSeconds * 1000), lockedAt: now } },
        { upsert: true },
      );
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async release(name: string, now: Date): Promise<void> {
    await this.collection.updateOne({ _id: name } as Document, { $set: { lockedUntil: now } });
  }
}
