import type { Collection, Db, Document } from 'mongodb';
import type { CheckInNoticeField, IBookingRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { Booking, type BookingEndedBy, type BookingEndReason, type BookingStatus, type CheckIn, type BookingAttendance } from '../../../domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../../domain/bookings/goalkeeperPrice.js';

export const BOOKINGS_COLLECTION = 'bookings';

/** The check-in watch covers the configurable window maximums (120 min before, 60 after). */
const CHECK_IN_WATCH_BEFORE_MS = 60 * 60_000;
const CHECK_IN_WATCH_AHEAD_MS = 120 * 60_000;
/** Ratings stay due for 7 days after the end (feature 021). */
const RATING_WINDOW_MS = 7 * 86_400_000;
/** The smallest configurable no-show grace period: the query's lower bound (feature 021). */
const MIN_NO_SHOW_GRACE_MS = 15 * 60_000;

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
    endsAt: booking.endsAt,
    status: booking.status,
    price: {
      unitRate: booking.price.unitRate,
      unitSurcharge: booking.price.unitSurcharge,
      total: booking.price.total,
      currency: booking.price.currency,
    },
    commission: booking.commission,
    travelBufferMinutes: booking.travelBufferMinutes,
    searchEndsAt: booking.searchEndsAt,
    goalkeeperId: booking.goalkeeperId,
    assignedAt: booking.assignedAt,
    createdAt: booking.createdAt,
    endedAt: booking.endedAt,
    endReason: booking.endReason,
    cancelledBy: booking.cancelledBy,
    cancellationNote: booking.cancellationNote,
    replacesBookingId: booking.replacesBookingId,
    excludedGoalkeeperIds: [...booking.excludedGoalkeeperIds],
    checkIn: booking.checkIn,
    checkInOpenNoticeAt: booking.checkInOpenNoticeAt,
    checkInLastCallAt: booking.checkInLastCallAt,
    checkInMissedAt: booking.checkInMissedAt,
    completedAt: booking.completedAt,
    attendance: booking.attendance,
    noShowAt: booking.noShowAt,
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
    endsAt: doc.endsAt as Date,
    status: doc.status as BookingStatus,
    price: new GoalkeeperPrice({
      unitRate: price.unitRate as number,
      unitSurcharge: price.unitSurcharge as number,
      total: price.total as number,
      currency: price.currency as string,
    }),
    commission: doc.commission as number,
    travelBufferMinutes: doc.travelBufferMinutes as number,
    searchEndsAt: doc.searchEndsAt as Date,
    goalkeeperId: (doc.goalkeeperId as string | null | undefined) ?? null,
    assignedAt: (doc.assignedAt as Date | null | undefined) ?? null,
    createdAt: doc.createdAt as Date,
    endedAt: (doc.endedAt as Date | null | undefined) ?? null,
    endReason: (doc.endReason as BookingEndReason | null | undefined) ?? null,
    cancelledBy: (doc.cancelledBy as BookingEndedBy | null | undefined) ?? null,
    cancellationNote: (doc.cancellationNote as string | null | undefined) ?? null,
    replacesBookingId: (doc.replacesBookingId as string | null | undefined) ?? null,
    excludedGoalkeeperIds: (doc.excludedGoalkeeperIds as string[] | undefined) ?? [],
    checkIn: (doc.checkIn as CheckIn | null | undefined) ?? null,
    checkInOpenNoticeAt: (doc.checkInOpenNoticeAt as Date | null | undefined) ?? null,
    checkInLastCallAt: (doc.checkInLastCallAt as Date | null | undefined) ?? null,
    checkInMissedAt: (doc.checkInMissedAt as Date | null | undefined) ?? null,
    completedAt: (doc.completedAt as Date | null | undefined) ?? null,
    attendance: (doc.attendance as BookingAttendance | null | undefined) ?? null,
    noShowAt: (doc.noShowAt as Date | null | undefined) ?? null,
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
    await this.collection.createIndex({ status: 1, zoneId: 1, startsAt: 1, _id: 1 }, { name: 'status_zone_start' });
    await this.collection.createIndex({ goalkeeperId: 1, startsAt: 1, _id: 1 }, { name: 'goalkeeper_start' });
    await this.collection.createIndex({ status: 1, searchEndsAt: 1 }, { name: 'status_searchEnds' });
    await this.collection.createIndex({ status: 1, startsAt: 1 }, { name: 'status_startsAt' });
    await this.collection.createIndex({ status: 1, endsAt: 1 }, { name: 'status_endsAt' });
    await this.collection.createIndex({ clientId: 1, endsAt: -1 }, { name: 'client_endsAt' });
  }

  async findById(id: string): Promise<Booking | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? bookingFromDocument(doc) : null;
  }

  async findAvailableCandidates(query: {
    zoneIds: string[];
    excludeClientId: string;
    maxCommission: number;
    now: Date;
    cap: number;
  }): Promise<Booking[]> {
    if (query.zoneIds.length === 0) return [];
    const docs = await this.collection
      .find({
        status: 'pending_assignment',
        zoneId: { $in: query.zoneIds },
        searchEndsAt: { $gt: query.now },
        clientId: { $ne: query.excludeClientId },
        commission: { $lte: query.maxCommission },
      })
      .sort({ startsAt: 1, _id: 1 })
      .limit(query.cap)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async findDueForExpiry(now: Date, cap: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ status: 'pending_assignment', searchEndsAt: { $lte: now } })
      .sort({ searchEndsAt: 1, _id: 1 })
      .limit(cap)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async findAssignedToGoalkeepers(goalkeeperIds: readonly string[]): Promise<Booking[]> {
    if (goalkeeperIds.length === 0) return [];
    const docs = await this.collection.find({ goalkeeperId: { $in: [...goalkeeperIds] }, status: 'assigned' }).toArray();
    return docs.map(bookingFromDocument);
  }

  async findOpenPending(now: Date, cap: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ status: 'pending_assignment', searchEndsAt: { $gt: now } })
      .sort({ startsAt: 1, _id: 1 })
      .limit(cap)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async findForCheckInWatch(now: Date, cap: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({
        status: 'assigned',
        startsAt: { $gt: new Date(now.getTime() - CHECK_IN_WATCH_BEFORE_MS), $lte: new Date(now.getTime() + CHECK_IN_WATCH_AHEAD_MS) },
      })
      .sort({ startsAt: 1, _id: 1 })
      .limit(cap)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async findDueForCompletion(now: Date, cap: number): Promise<Booking[]> {
    const docs = await this.collection.find({ status: 'assigned', endsAt: { $lte: now } }).sort({ endsAt: 1, _id: 1 }).limit(cap).toArray();
    return docs.map(bookingFromDocument);
  }

  async findRateable(userId: string, now: Date): Promise<{ asClient: Booking[]; asGoalkeeper: Booking[] }> {
    const since = new Date(now.getTime() - RATING_WINDOW_MS);
    const [asClient, asGoalkeeper] = await Promise.all([
      this.collection
        .find({
          clientId: userId,
          endsAt: { $gte: since },
          $or: [{ status: 'completed' }, { status: 'assigned', checkIn: { $ne: null } }],
        } as Document)
        .toArray(),
      this.collection.find({ goalkeeperId: userId, status: 'completed', endsAt: { $gte: since } }).toArray(),
    ]);
    return { asClient: asClient.map(bookingFromDocument), asGoalkeeper: asGoalkeeper.map(bookingFromDocument) };
  }

  async findDueForAttendance(now: Date, cap: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ status: 'completed', attendance: null, endsAt: { $lte: new Date(now.getTime() - MIN_NO_SHOW_GRACE_MS) } })
      .sort({ endsAt: 1, _id: 1 })
      .limit(cap)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async markCheckInNotice(bookingId: string, field: CheckInNoticeField, now: Date): Promise<boolean> {
    const result = await this.collection.updateOne({ _id: bookingId, [field]: null } as Document, { $set: { [field]: now } });
    return result.modifiedCount === 1;
  }

  async findAssignedToGoalkeeper(goalkeeperId: string): Promise<Booking[]> {
    const docs = await this.collection.find({ goalkeeperId, status: 'assigned' }).toArray();
    return docs.map(bookingFromDocument);
  }

  async countForGoalkeeper(goalkeeperId: string, now: Date): Promise<{ upcoming: number; past: number }> {
    const [upcoming, past] = await Promise.all([
      this.collection.countDocuments({ goalkeeperId, startsAt: { $gte: now } }),
      this.collection.countDocuments({ goalkeeperId, startsAt: { $lt: now } }),
    ]);
    return { upcoming, past };
  }

  async findUpcomingForGoalkeeper(goalkeeperId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ goalkeeperId, startsAt: { $gte: now } })
      .sort({ startsAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(bookingFromDocument);
  }

  async findPastForGoalkeeper(goalkeeperId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    const docs = await this.collection
      .find({ goalkeeperId, startsAt: { $lt: now } })
      .sort({ startsAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(bookingFromDocument);
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
