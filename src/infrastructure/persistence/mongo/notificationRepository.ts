import type { Collection, Db, Document } from 'mongodb';
import { validate as isUuid } from 'uuid';
import type {
  DismissOutcome,
  INotificationRepository,
  NewOffer,
  NotificationItem,
} from '../../../application/features/notifications/common/ports.js';
import { OFFER_TYPE } from '../../../domain/notifications/offerMessages.js';

export const NOTIFICATIONS_COLLECTION = 'notifications';
const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const DUPLICATE_KEY = 11000;

/** Sets `readAt` only when it isn't set yet, so the first read time is kept. */
const readNow = (now: Date) => ({ $ifNull: ['$readAt', now] });

/**
 * Every user's inbox (feature 015). Offers carry their own reminder bookkeeping, and a unique
 * partial index keeps one offer per goalkeeper and request (research §5).
 */
export class MongoNotificationRepository implements INotificationRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(NOTIFICATIONS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ userId: 1, createdAt: -1 }, { name: 'user_created' });
    await this.collection.createIndex(
      { userId: 1, requestId: 1 },
      { name: 'offer_unique', unique: true, partialFilterExpression: { type: OFFER_TYPE } },
    );
    await this.collection.createIndex({ createdAt: 1 }, { name: 'created_ttl', expireAfterSeconds: RETENTION_SECONDS });
  }

  async createOfferIfAbsent(offer: NewOffer): Promise<boolean> {
    try {
      await this.collection.insertOne({
        _id: offer.id,
        userId: offer.userId,
        type: OFFER_TYPE,
        title: offer.title,
        body: offer.body,
        data: offer.data,
        requestId: offer.requestId,
        createdAt: offer.createdAt,
        readAt: null,
        dismissedAt: null,
        notifiedAt: null,
        reminderCount: 0,
        lastRemindedAt: null,
      } as Document);
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async listForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]> {
    const docs = await this.collection.find({ userId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(toItem);
  }

  async countForUser(userId: string): Promise<number> {
    return this.collection.countDocuments({ userId });
  }

  async countUnread(userId: string): Promise<number> {
    return this.collection.countDocuments({ userId, readAt: null });
  }

  async markRead(id: string, userId: string, now: Date): Promise<boolean> {
    if (!isUuid(id)) return false;
    const result = await this.collection.updateOne({ _id: id, userId } as Document, [{ $set: { readAt: readNow(now) } }]);
    return result.matchedCount === 1;
  }

  async markAllRead(userId: string, now: Date): Promise<void> {
    await this.collection.updateMany({ userId, readAt: null }, { $set: { readAt: now } });
  }

  async dismissOffer(id: string, userId: string, now: Date): Promise<DismissOutcome> {
    if (!isUuid(id)) return 'not_found';
    const doc = await this.collection.findOne({ _id: id, userId } as Document, { projection: { type: 1 } });
    if (!doc) return 'not_found';
    if (doc.type !== OFFER_TYPE) return 'not_an_offer';
    await this.collection.updateOne({ _id: id, userId } as Document, [
      { $set: { readAt: readNow(now), dismissedAt: { $ifNull: ['$dismissedAt', now] } } },
    ]);
    return 'dismissed';
  }

  async findOffers(userIds: readonly string[], requestIds: readonly string[]): Promise<NotificationItem[]> {
    if (userIds.length === 0 || requestIds.length === 0) return [];
    const docs = await this.collection
      .find({ userId: { $in: [...userIds] }, requestId: { $in: [...requestIds] }, type: OFFER_TYPE })
      .toArray();
    return docs.map(toItem);
  }

  async markNotified(ids: readonly string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.collection.updateMany({ _id: { $in: [...ids] }, notifiedAt: null } as Document, { $set: { notifiedAt: now } });
  }

  async markReminded(ids: readonly string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.collection.updateMany({ _id: { $in: [...ids] } } as Document, {
      $inc: { reminderCount: 1 },
      $set: { lastRemindedAt: now },
    });
  }
}

function toItem(doc: Document): NotificationItem {
  return {
    id: doc._id as string,
    userId: doc.userId as string,
    type: doc.type as string,
    title: doc.title as string,
    body: doc.body as string,
    data: (doc.data as Record<string, string> | undefined) ?? {},
    createdAt: doc.createdAt as Date,
    readAt: (doc.readAt as Date | null | undefined) ?? null,
    requestId: (doc.requestId as string | undefined) ?? null,
    dismissedAt: (doc.dismissedAt as Date | null | undefined) ?? null,
    notifiedAt: (doc.notifiedAt as Date | null | undefined) ?? null,
    reminderCount: (doc.reminderCount as number | undefined) ?? 0,
    lastRemindedAt: (doc.lastRemindedAt as Date | null | undefined) ?? null,
  };
}
