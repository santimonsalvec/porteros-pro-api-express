import type { Collection, Db, Document } from 'mongodb';
import type { IOfferPushState } from '../../../application/features/notifications/common/ports.js';

export const OFFER_PUSH_STATE_COLLECTION = 'offerPushState';
const DUPLICATE_KEY = 11000;

/**
 * When each goalkeeper was last pushed an offer (research §6). A round claims a goalkeeper with a
 * conditional upsert: when the last push is too recent the filter misses, the upsert collides on
 * `_id` and the claim fails — so two rounds never push the same goalkeeper twice.
 */
export class MongoOfferPushStateStore implements IOfferPushState {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(OFFER_PUSH_STATE_COLLECTION);
  }

  async tryClaim(goalkeeperId: string, now: Date, intervalMinutes: number): Promise<boolean> {
    const threshold = new Date(now.getTime() - intervalMinutes * 60_000);
    try {
      await this.collection.findOneAndUpdate(
        { _id: goalkeeperId, lastOfferPushAt: { $lte: threshold } } as Document,
        { $set: { lastOfferPushAt: now } },
        { upsert: true },
      );
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async markPushed(goalkeeperIds: readonly string[], now: Date): Promise<void> {
    for (const goalkeeperId of new Set(goalkeeperIds)) {
      await this.collection.updateOne({ _id: goalkeeperId } as Document, { $set: { lastOfferPushAt: now } }, { upsert: true });
    }
  }
}
