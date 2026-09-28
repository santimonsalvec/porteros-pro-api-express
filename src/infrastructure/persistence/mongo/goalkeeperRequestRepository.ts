import type { Collection, Db, Document } from 'mongodb';
import type { IGoalkeeperRequestRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { GoalkeeperRequest, type PartialFulfillment } from '../../../domain/bookings/goalkeeperRequest.js';
import { matchFromDocument, matchToDocument, pricingFromDocument, pricingToDocument } from './quoteRepository.js';

export const GOALKEEPER_REQUESTS_COLLECTION = 'goalkeeperRequests';

/** `zoneId` and `startsAt` are repeated at the top level so the indexes are plain ones. */
export function requestToDocument(request: GoalkeeperRequest): Document {
  return {
    _id: request.id,
    clientId: request.clientId,
    quoteId: request.quoteId,
    zoneId: request.zoneId,
    startsAt: request.startsAt,
    match: matchToDocument(request.match),
    pricing: pricingToDocument(request.pricing),
    goalkeeperCount: request.goalkeeperCount,
    partialFulfillment: request.partialFulfillment,
    freeCancellationMinutes: request.freeCancellationMinutes,
    commission: request.commission,
    travelBufferMinutes: request.travelBufferMinutes,
    active: request.active,
    quoteIssuedAt: request.quoteIssuedAt,
    createdAt: request.createdAt,
  };
}

export function requestFromDocument(doc: Document): GoalkeeperRequest {
  const match = matchFromDocument(doc.match as Document);
  return GoalkeeperRequest.rehydrate({
    id: String(doc._id),
    clientId: doc.clientId as string,
    quoteId: doc.quoteId as string,
    match,
    pricing: pricingFromDocument(doc.pricing as Document, match.goalkeeperCount),
    partialFulfillment: doc.partialFulfillment as PartialFulfillment,
    freeCancellationMinutes: doc.freeCancellationMinutes as number,
    commission: doc.commission as number,
    travelBufferMinutes: doc.travelBufferMinutes as number,
    active: doc.active as boolean,
    quoteIssuedAt: doc.quoteIssuedAt as Date,
    createdAt: doc.createdAt as Date,
  });
}

/**
 * Requests are written only inside the confirmation transaction (`MongoQuoteConfirmationStore`);
 * this repository reads them. `quoteId_unique` guarantees one request per quote; the partial
 * `client_zone_start_active_unique` guarantees one ACTIVE request per client, zone and start
 * (research.md §3); `client_startsAt` serves the client's list (a forward scan for upcoming
 * matches, a backward scan for past ones).
 */
export class GoalkeeperRequestRepository implements IGoalkeeperRequestRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(GOALKEEPER_REQUESTS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ quoteId: 1 }, { name: 'quoteId_unique', unique: true });
    await this.collection.createIndex(
      { clientId: 1, zoneId: 1, startsAt: 1 },
      { name: 'client_zone_start_active_unique', unique: true, partialFilterExpression: { active: true } },
    );
    await this.collection.createIndex({ clientId: 1, startsAt: 1, _id: 1 }, { name: 'client_startsAt' });
  }

  async findByQuoteForClient(quoteId: string, clientId: string): Promise<GoalkeeperRequest | null> {
    const doc = await this.collection.findOne({ quoteId, clientId });
    return doc ? requestFromDocument(doc) : null;
  }

  async findByIds(ids: string[]): Promise<GoalkeeperRequest[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map(requestFromDocument);
  }

  async findActiveByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<GoalkeeperRequest | null> {
    const doc = await this.collection.findOne({ clientId, zoneId, startsAt, active: true });
    return doc ? requestFromDocument(doc) : null;
  }

  async countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }> {
    const [upcoming, past] = await Promise.all([
      this.collection.countDocuments({ clientId, startsAt: { $gte: now } }),
      this.collection.countDocuments({ clientId, startsAt: { $lt: now } }),
    ]);
    return { upcoming, past };
  }

  async findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]> {
    const docs = await this.collection
      .find({ clientId, startsAt: { $gte: now } })
      .sort({ startsAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(requestFromDocument);
  }

  async findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]> {
    const docs = await this.collection
      .find({ clientId, startsAt: { $lt: now } })
      .sort({ startsAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(requestFromDocument);
  }
}
