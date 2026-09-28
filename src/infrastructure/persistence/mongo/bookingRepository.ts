import type { Collection, Db, Document } from 'mongodb';
import type { IBookingRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { Booking, type BookingStatus } from '../../../domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../../domain/bookings/goalkeeperPrice.js';

export const BOOKINGS_COLLECTION = 'bookings';

/**
 * Indexes of the pre-010 shape (one booking per match). Their rules moved to the request, and
 * `quoteId_unique` would even reject the second booking of a request (no `quoteId` any more).
 */
const OBSOLETE_INDEXES = ['quoteId_unique', 'client_zone_start_unique', 'client_startsAt'];
const INDEX_NOT_FOUND = 27;

export function bookingToDocument(booking: Booking): Document {
  return {
    _id: booking.id,
    requestId: booking.requestId,
    clientId: booking.clientId,
    zoneId: booking.zoneId,
    startsAt: booking.startsAt,
    status: booking.status,
    price: {
      unitRate: booking.price.unitRate,
      unitSurcharge: booking.price.unitSurcharge,
      total: booking.price.total,
      currency: booking.price.currency,
    },
    createdAt: booking.createdAt,
  };
}

export function bookingFromDocument(doc: Document): Booking {
  const price = doc.price as Document;
  return Booking.rehydrate({
    id: String(doc._id),
    requestId: doc.requestId as string,
    clientId: doc.clientId as string,
    zoneId: doc.zoneId as string,
    startsAt: doc.startsAt as Date,
    status: doc.status as BookingStatus,
    price: new GoalkeeperPrice({
      unitRate: price.unitRate as number,
      unitSurcharge: price.unitSurcharge as number,
      total: price.total as number,
      currency: price.currency as string,
    }),
    createdAt: doc.createdAt as Date,
  });
}

/**
 * One booking per goalkeeper. Bookings are written only inside the confirmation transaction
 * (`MongoQuoteConfirmationStore`); this repository reads them.
 */
export class BookingRepository implements IBookingRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(BOOKINGS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    for (const name of OBSOLETE_INDEXES) {
      try {
        await this.collection.dropIndex(name);
      } catch (error) {
        if ((error as { code?: unknown }).code !== INDEX_NOT_FOUND) throw error;
      }
    }
    await this.collection.createIndex({ requestId: 1, _id: 1 }, { name: 'requestId' });
  }

  async findByRequestIds(requestIds: string[]): Promise<Booking[]> {
    if (requestIds.length === 0) return [];
    const docs = await this.collection
      .find({ requestId: { $in: requestIds } })
      .sort({ requestId: 1, _id: 1 })
      .toArray();
    return docs.map(bookingFromDocument);
  }
}
