import type { VerificationMethod } from '../../../domain/goalkeepers/vetting.js';
import type { BackgroundCheckAlert } from '../../../application/features/goalkeepers/common/adminPorts.js';
import type { Collection, Db, Document } from 'mongodb';
import type { GoalkeeperListFilter, GoalkeeperListRecord, IGoalkeeperAdminReader } from '../../../application/features/goalkeepers/common/adminPorts.js';
import type { RatingSummary } from '../../../application/features/goalkeepers/common/adminViews.js';
import type { ScheduledRecord } from '../../../application/features/users/common/ports.js';
import { BOOKINGS_COLLECTION } from './bookingRepository.js';
import { GOALKEEPER_INCIDENTS_COLLECTION } from './goalkeeperIncidentRepository.js';
import { RATINGS_COLLECTION } from './ratingRepository.js';
import { goalkeepersListPipeline, ratingsPipeline } from './goalkeeperAdminPipelines.js';

/** The admin's reads of goalkeepers that need a join or a count (admin spec 005, research §5–§6). */
export class GoalkeeperAdminReader implements IGoalkeeperAdminReader {
  private readonly profiles: Collection<Document>;
  private readonly ratings: Collection<Document>;
  private readonly incidents: Collection<Document>;
  private readonly bookings: Collection<Document>;

  constructor(db: Db) {
    this.profiles = db.collection('goalkeeperProfiles');
    this.ratings = db.collection(RATINGS_COLLECTION);
    this.incidents = db.collection(GOALKEEPER_INCIDENTS_COLLECTION);
    this.bookings = db.collection(BOOKINGS_COLLECTION);
  }

  async list(filter: GoalkeeperListFilter): Promise<{ items: GoalkeeperListRecord[]; totalItems: number }> {
    if (filter.userIds !== undefined && filter.userIds.length === 0) return { items: [], totalItems: 0 };
    const [result] = await this.profiles.aggregate<{ items: Document[]; total: { count: number }[] }>(goalkeepersListPipeline(filter)).toArray();
    return { items: (result?.items ?? []).map(toRecord), totalItems: result?.total[0]?.count ?? 0 };
  }

  async ratingsFor(userIds: readonly string[]): Promise<Map<string, RatingSummary>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.ratings.aggregate<{ _id: string; average: number; count: number }>(ratingsPipeline(userIds)).toArray();
    return new Map(rows.map((row) => [row._id, { average: Math.round(row.average * 10) / 10, count: row.count }]));
  }

  async incidentCounts(userId: string): Promise<{ withdrawal: number; no_show: number }> {
    const rows = await this.incidents
      .aggregate<{ _id: string; count: number }>([{ $match: { goalkeeperId: userId } }, { $group: { _id: '$kind', count: { $sum: 1 } } }])
      .toArray();
    const count = (kind: string) => rows.find((row) => row._id === kind)?.count ?? 0;
    return { withdrawal: count('withdrawal'), no_show: count('no_show') };
  }

  async upcomingBookings(userId: string, now: Date, limit: number): Promise<{ total: number; items: ScheduledRecord[] }> {
    const filter = { goalkeeperId: userId, status: 'assigned', startsAt: { $gt: now } };
    const [docs, total] = await Promise.all([
      this.bookings.find(filter, { projection: { _id: 1, requestId: 1, startsAt: 1, zoneId: 1 } }).sort({ startsAt: 1 }).limit(limit).toArray(),
      this.bookings.countDocuments(filter),
    ]);
    return {
      total,
      items: docs.map((doc) => ({ id: String(doc._id), requestId: doc.requestId as string, startsAt: new Date(doc.startsAt as Date), zoneId: (doc.zoneId as string | undefined) ?? null })),
    };
  }
}

function toRecord(doc: Document): GoalkeeperListRecord {
  return {
    userId: doc.userId as string,
    cityId: (doc.cityId as string | undefined) ?? null,
    zoneCount: (doc.zoneCount as number | undefined) ?? 0,
    availableForOffers: doc.availableForOffers !== false,
    suspendedUntil: doc.suspendedUntil ? new Date(doc.suspendedUntil as Date) : null,
    balance: (doc.balance as number | undefined) ?? 0,
    currency: (doc.currency as string | undefined) ?? null,
    activatedAt: new Date(doc.activatedAt as Date),
    vetting: {
      tier: doc.vettingValidation === 'validated' ? (doc.verificationMethod ? 'verified' : 'validated') : 'unvalidated',
      verificationMethod: (doc.verificationMethod as VerificationMethod | undefined) ?? null,
      backgroundCheckAlert: (doc.backgroundCheckAlert as BackgroundCheckAlert | null | undefined) ?? null,
    },
  };
}
