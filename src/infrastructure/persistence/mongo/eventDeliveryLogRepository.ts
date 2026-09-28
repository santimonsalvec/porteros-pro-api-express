import type { Collection, Db, Document } from 'mongodb';
import type { IEventDeliveryLog } from '../../../application/features/events/common/ports.js';
import type { DomainEvent } from '../../../domain/events/domainEvent.js';

export const EVENT_DELIVERY_LOG_COLLECTION = 'eventDeliveryLog';

/** Diagnostic only: entries expire after 30 days. */
const RETENTION_SECONDS = 30 * 24 * 60 * 60;

export class MongoEventDeliveryLog implements IEventDeliveryLog {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(EVENT_DELIVERY_LOG_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ receivedAt: 1 }, { name: 'received_ttl', expireAfterSeconds: RETENTION_SECONDS });
  }

  async record(event: DomainEvent, at: Date): Promise<'recorded' | 'duplicate'> {
    try {
      await this.collection.insertOne({
        _id: event.id,
        type: event.type,
        bookingId: event.bookingId,
        requestId: event.requestId,
        receivedAt: at,
      } as Document);
      return 'recorded';
    } catch (error) {
      if ((error as { code?: unknown }).code === 11000) return 'duplicate';
      throw error;
    }
  }
}
