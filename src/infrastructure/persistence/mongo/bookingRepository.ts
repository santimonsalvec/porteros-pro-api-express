import type { Collection, Db, Document } from 'mongodb';
import type { IBookingRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { Booking, type BookingStatus } from '../../../domain/bookings/booking.js';
import {
  matchFromDocument,
  matchToDocument,
  pricingFromDocument,
  pricingToDocument,
} from './quoteRepository.js';

export const BOOKINGS_COLLECTION = 'bookings';

/** `zoneId` and `startsAt` are repeated at the top level so the duplicate-match index is a plain one. */
export function bookingToDocument(booking: Booking): Document {
  return {
    _id: booking.id,
    clientId: booking.clientId,
    quoteId: booking.quoteId,
    status: booking.status,
    zoneId: booking.zoneId,
    startsAt: booking.startsAt,
    match: matchToDocument(booking.match),
    pricing: pricingToDocument(booking.pricing),
    quoteIssuedAt: booking.quoteIssuedAt,
    createdAt: booking.createdAt,
  };
}

export function bookingFromDocument(doc: Document): Booking {
  const match = matchFromDocument(doc.match as Document);
  return Booking.rehydrate({
    id: String(doc._id),
    clientId: doc.clientId as string,
    quoteId: doc.quoteId as string,
    status: doc.status as BookingStatus,
    match,
    pricing: pricingFromDocument(doc.pricing as Document, match.goalkeeperCount),
    quoteIssuedAt: doc.quoteIssuedAt as Date,
    createdAt: doc.createdAt as Date,
  });
}

/**
 * Bookings are written only inside the confirmation transaction (`MongoQuoteConfirmationStore`);
 * this repository reads them. The two unique indexes are the database-level guarantees that a
 * quote never yields two bookings (FR-012) and a client never books the same match twice (FR-022).
 * `client_startsAt` serves the client's list (feature 009): both segment counts, and each segment's
 * sort as a forward (upcoming) or backward (past) scan of the index.
 */
export class BookingRepository implements IBookingRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(BOOKINGS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ quoteId: 1 }, { name: 'quoteId_unique', unique: true });
    await this.collection.createIndex(
      { clientId: 1, zoneId: 1, startsAt: 1 },
      { name: 'client_zone_start_unique', unique: true },
    );
    await this.collection.createIndex({ clientId: 1, startsAt: 1, _id: 1 }, { name: 'client_startsAt' });
  }

  async findByQuoteForClient(quoteId: string, clientId: string): Promise<Booking | null> {
    const doc = await this.collection.findOne({ quoteId, clientId });
    return doc ? bookingFromDocument(doc) : null;
  }

  async findByMatchForClient(
    clientId: string,
    zoneId: string,
    startsAt: Date,
  ): Promise<Booking | null> {
    const doc = await this.collection.findOne({ clientId, zoneId, startsAt });
    return doc ? bookingFromDocument(doc) : null;
  }

  async countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }> {
    const [upcoming, past] = await Promise.all([
      this.collection.countDocuments({ clientId, startsAt: { $gte: now } }),
      this.collection.countDocuments({ clientId, startsAt: { $lt: now } }),
    ]);
    return { upcoming, past };
  }

  async findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ clientId, startsAt: { $gte: now } })
      .sort({ startsAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ clientId, startsAt: { $lt: now } })
      .sort({ startsAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(bookingFromDocument);
  }
}
