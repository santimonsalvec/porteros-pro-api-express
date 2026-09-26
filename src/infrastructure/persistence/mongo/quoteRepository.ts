import type { Collection, Db, Document } from 'mongodb';
import type { IQuoteRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { MatchDetails } from '../../../domain/bookings/matchDetails.js';
import { PricingSnapshot } from '../../../domain/bookings/pricingSnapshot.js';
import { Quote } from '../../../domain/bookings/quote.js';

export const QUOTES_COLLECTION = 'quotes';

export function matchToDocument(match: MatchDetails): Document {
  return {
    latitude: match.latitude,
    longitude: match.longitude,
    zoneId: match.zoneId,
    cityId: match.cityId,
    startsAt: match.startsAt,
    startsAtLocal: match.startsAtLocal,
    timeZone: match.timeZone,
    goalkeeperCount: match.goalkeeperCount,
    durationMinutes: match.durationMinutes,
  };
}

export function matchFromDocument(doc: Document): MatchDetails {
  return new MatchDetails({
    latitude: doc.latitude as number,
    longitude: doc.longitude as number,
    zoneId: doc.zoneId as string,
    cityId: doc.cityId as string,
    startsAt: doc.startsAt as Date,
    startsAtLocal: doc.startsAtLocal as string,
    timeZone: doc.timeZone as string,
    goalkeeperCount: doc.goalkeeperCount as number,
    durationMinutes: doc.durationMinutes as number,
  });
}

export function pricingToDocument(pricing: PricingSnapshot): Document {
  return {
    unitRate: pricing.unitRate,
    subtotal: pricing.subtotal,
    unitSurcharge: pricing.unitSurcharge,
    surcharge: pricing.surcharge,
    total: pricing.total,
    currency: pricing.currency,
  };
}

export function pricingFromDocument(doc: Document, goalkeeperCount: number): PricingSnapshot {
  return new PricingSnapshot(
    {
      unitRate: doc.unitRate as number,
      subtotal: doc.subtotal as number,
      unitSurcharge: doc.unitSurcharge as number,
      surcharge: doc.surcharge as number,
      total: doc.total as number,
      currency: doc.currency as string,
    },
    goalkeeperCount,
  );
}

/** Dates stay BSON `Date`s: the TTL index on `expiresAt` ignores any other type. */
export function quoteToDocument(quote: Quote): Document {
  return {
    _id: quote.id,
    clientId: quote.clientId,
    status: quote.status,
    match: matchToDocument(quote.match),
    pricing: pricingToDocument(quote.pricing),
    issuedAt: quote.issuedAt,
    expiresAt: quote.expiresAt,
  };
}

export function quoteFromDocument(doc: Document): Quote {
  const match = matchFromDocument(doc.match as Document);
  return Quote.rehydrate({
    id: String(doc._id),
    clientId: doc.clientId as string,
    match,
    pricing: pricingFromDocument(doc.pricing as Document, match.goalkeeperCount),
    issuedAt: doc.issuedAt as Date,
    expiresAt: doc.expiresAt as Date,
  });
}

/**
 * Short-lived quotes. A quote is deleted by the confirmation that books it (see
 * `MongoQuoteConfirmationStore`); an unconfirmed one is removed by MongoDB's TTL monitor once
 * `expiresAt` has passed — this system never deletes expired quotes itself (FR-023).
 */
export class QuoteRepository implements IQuoteRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(QUOTES_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    // `expireAfterSeconds: 0` = remove at the instant stored in the field; the 3-minute validity
    // lives only in the application. The monitor runs about once a minute, so removal lags.
    await this.collection.createIndex(
      { expiresAt: 1 },
      { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
    );
  }

  async add(quote: Quote): Promise<void> {
    await this.collection.insertOne(quoteToDocument(quote));
  }

  async findByIdForClient(quoteId: string, clientId: string): Promise<Quote | null> {
    const doc = await this.collection.findOne({ _id: quoteId, clientId } as Document);
    return doc ? quoteFromDocument(doc) : null;
  }
}
