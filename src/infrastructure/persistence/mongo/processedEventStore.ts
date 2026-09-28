import type { Collection, Db, Document } from 'mongodb';
import type { IProcessedEventStore } from '../../../application/features/events/common/ports.js';

export const PROCESSED_EVENTS_COLLECTION = 'processedEvents';

/** Longer than Pub/Sub's 7-day maximum retention, so no redelivery outlives its marker. */
const RETENTION_SECONDS = 30 * 24 * 60 * 60;

export class MongoProcessedEventStore implements IProcessedEventStore {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(PROCESSED_EVENTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ processedAt: 1 }, { name: 'processed_ttl', expireAfterSeconds: RETENTION_SECONDS });
  }

  async has(key: string): Promise<boolean> {
    return (await this.collection.findOne({ _id: key } as Document, { projection: { _id: 1 } })) !== null;
  }

  async markProcessed(key: string, at: Date): Promise<void> {
    const separator = key.indexOf(':');
    try {
      await this.collection.insertOne({
        _id: key,
        consumer: key.slice(0, separator),
        eventId: key.slice(separator + 1),
        processedAt: at,
      } as Document);
    } catch (error) {
      // A concurrent delivery already marked it: same outcome.
      if ((error as { code?: unknown }).code !== 11000) throw error;
    }
  }
}
