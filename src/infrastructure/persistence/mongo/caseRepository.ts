import type { Collection, Db, Document } from 'mongodb';
import type { CaseListFilter, ICaseRepository } from '../../../application/features/cases/common/ports.js';
import type { CheckIn } from '../../../domain/bookings/booking.js';
import { SupportCase, type CaseResolution, type CaseStatus, type CaseType } from '../../../domain/cases/case.js';

export const CASES_COLLECTION = 'cases';

export function caseToDocument(item: SupportCase): Document {
  return {
    _id: item.id,
    type: item.type,
    bookingId: item.bookingId,
    requestId: item.requestId,
    clientId: item.clientId,
    goalkeeperId: item.goalkeeperId,
    ratingId: item.ratingId,
    checkIn: item.checkIn,
    noShowIncidentId: item.noShowIncidentId,
    status: item.status,
    resolution: item.resolution,
    createdAt: item.createdAt,
  };
}

export function caseFromDocument(doc: Document): SupportCase {
  const resolution = doc.resolution as Document | null | undefined;
  return SupportCase.rehydrate({
    id: String(doc._id),
    type: doc.type as CaseType,
    bookingId: doc.bookingId as string,
    requestId: doc.requestId as string,
    clientId: doc.clientId as string,
    goalkeeperId: doc.goalkeeperId as string,
    ratingId: doc.ratingId as string,
    checkIn: (doc.checkIn as CheckIn | null | undefined) ?? null,
    noShowIncidentId: (doc.noShowIncidentId as string | null | undefined) ?? null,
    status: doc.status as CaseStatus,
    resolution: resolution ? { by: resolution.by as string, at: new Date(resolution.at as Date), note: resolution.note as string } : null,
    createdAt: new Date(doc.createdAt as Date),
  });
}

/** Cases for manual review (feature 021): one per booking and type (`booking_type_unique`). */
export class CaseRepository implements ICaseRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(CASES_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ bookingId: 1, type: 1 }, { name: 'booking_type_unique', unique: true });
    await this.collection.createIndex({ status: 1, createdAt: -1 }, { name: 'status_created' });
  }

  async list(status: CaseStatus | null, skip: number, limit: number): Promise<SupportCase[]> {
    // 'open' < 'resolved', so ascending status puts open cases first.
    const docs = await this.collection
      .find(status ? { status } : {})
      .sort({ status: 1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(caseFromDocument);
  }

  count(status: CaseStatus | null): Promise<number> {
    return this.collection.countDocuments(status ? { status } : {});
  }

  async search(filter: CaseListFilter, skip: number, limit: number): Promise<SupportCase[]> {
    const order = filter.order === 'oldest' ? { createdAt: 1, _id: 1 } : { status: 1, createdAt: -1, _id: -1 };
    const docs = await this.collection
      .find(caseMatch(filter))
      .sort(order as Document)
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(caseFromDocument);
  }

  countMatching(filter: CaseListFilter): Promise<number> {
    return this.collection.countDocuments(caseMatch(filter));
  }

  async requestIdsMatching(filter: CaseListFilter): Promise<string[]> {
    return (await this.collection.distinct('requestId', caseMatch(filter))).map(String);
  }

  async getById(id: string): Promise<SupportCase | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? caseFromDocument(doc) : null;
  }

  async resolve(id: string, resolution: CaseResolution): Promise<'resolved' | 'already_resolved' | 'not_found'> {
    const result = await this.collection.updateOne({ _id: id, status: 'open' } as Document, { $set: { status: 'resolved', resolution } });
    if (result.modifiedCount === 1) return 'resolved';
    return (await this.collection.countDocuments({ _id: id } as Document)) > 0 ? 'already_resolved' : 'not_found';
  }
}

/** The `find` filter of the admin's case search (admin spec 006). */
function caseMatch(filter: CaseListFilter): Document {
  const match: Document = {};
  if (filter.status) match.status = filter.status;
  if (filter.type) match.type = filter.type;
  if (filter.from || filter.to) {
    match.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
  }
  if (filter.requestIds) match.requestId = { $in: [...filter.requestIds] };
  return match;
}
