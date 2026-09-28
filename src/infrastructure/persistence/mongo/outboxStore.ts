import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { IOutboxStore } from '../../../application/features/events/common/ports.js';
import type { DomainEvent } from '../../../domain/events/domainEvent.js';

export const OUTBOX_COLLECTION = 'outbox';

/** Lease the in-request relay holds on a new event before the sweep may take it (research §2). */
const RELAY_LEASE_MS = 30_000;
/** Published events are kept this long, then removed by MongoDB's TTL monitor (FR-010). */
const PUBLISHED_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export function eventToDocument(event: DomainEvent): Document {
  return {
    _id: event.id,
    type: event.type,
    version: event.version,
    occurredAt: event.occurredAt,
    bookingId: event.bookingId,
    requestId: event.requestId,
    payload: event.payload,
  };
}

export function eventFromDocument(doc: Document): DomainEvent {
  return {
    id: doc._id as string,
    type: doc.type,
    version: doc.version,
    occurredAt: doc.occurredAt as Date,
    bookingId: doc.bookingId as string,
    requestId: doc.requestId as string,
    payload: doc.payload,
  };
}

/**
 * Records events inside the caller's transaction, so the change and its events commit or abort
 * together (FR-002). Pending, never published, with the relay's short lease.
 */
export async function appendEventsInSession(
  db: Db,
  session: ClientSession,
  events: readonly DomainEvent[],
  now: Date,
): Promise<void> {
  if (events.length === 0) return;
  await db.collection(OUTBOX_COLLECTION).insertMany(
    events.map((event) => ({
      ...eventToDocument(event),
      status: 'pending',
      attempts: 0,
      claimedUntil: new Date(now.getTime() + RELAY_LEASE_MS),
      createdAt: now,
    })),
    { session },
  );
}

export class MongoOutboxStore implements IOutboxStore {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(OUTBOX_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ status: 1, claimedUntil: 1, createdAt: 1 }, { name: 'status_claimed_created' });
    // Pending events have no `publishedAt`, which the TTL monitor ignores: they are never removed.
    await this.collection.createIndex(
      { publishedAt: 1 },
      { name: 'published_ttl', expireAfterSeconds: PUBLISHED_RETENTION_SECONDS },
    );
  }

  async markPublished(ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.collection.updateMany(
      { _id: { $in: [...ids] } } as Document,
      { $set: { status: 'published', publishedAt: at } },
    );
  }

  /** One atomic claim per event: two sweeps never lease the same one (research §11). */
  async claimNext(now: Date, leaseSeconds: number, limit: number): Promise<DomainEvent[]> {
    const claimed: DomainEvent[] = [];
    while (claimed.length < limit) {
      const doc = await this.collection.findOneAndUpdate(
        { status: 'pending', claimedUntil: { $lte: now } },
        { $set: { claimedUntil: new Date(now.getTime() + leaseSeconds * 1000) }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      if (!doc) break;
      claimed.push(eventFromDocument(doc));
    }
    return claimed;
  }

  async pendingStats(): Promise<{ count: number; oldestCreatedAt: Date | null }> {
    const [count, oldest] = await Promise.all([
      this.collection.countDocuments({ status: 'pending' }),
      this.collection.findOne({ status: 'pending' }, { sort: { createdAt: 1 }, projection: { createdAt: 1 } }),
    ]);
    return { count, oldestCreatedAt: (oldest?.createdAt as Date | undefined) ?? null };
  }
}
