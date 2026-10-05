import type { Collection, Db, Document } from 'mongodb';
import { FREE_CANCELLATION_MINUTES_DEFAULT } from '../../../application/features/goalkeeperRequests/common/bookingLimits.js';
import type { IQuoteRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { MatchDetails } from '../../../domain/bookings/matchDetails.js';
import { MatchFormat } from '../../../domain/bookings/matchFormat.js';
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
    format: match.format
      ? {
          modality: match.format.modality,
          level: match.format.level,
          surfaceId: match.format.surfaceId,
          surfaceName: match.format.surfaceName,
        }
      : null,
  };
}

/** Feature 024; documents written before it have no `format`. */
function formatFromDocument(doc: Document | null | undefined): MatchFormat | null {
  if (!doc) return null;
  return new MatchFormat({
    modality: doc.modality as string,
    level: doc.level as string,
    surfaceId: doc.surfaceId as string,
    surfaceName: doc.surfaceName as string,
  });
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
    format: formatFromDocument(doc.format as Document | null | undefined),
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
    freeCancellationMinutes: quote.freeCancellationMinutes,
    commission: quote.commission,
    travelBufferMinutes: quote.travelBufferMinutes,
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
    // Quotes issued before the field existed read as the default (research.md §5).
    freeCancellationMinutes: (doc.freeCancellationMinutes as number | undefined) ?? FREE_CANCELLATION_MINUTES_DEFAULT,
    commission: doc.commission as number,
    travelBufferMinutes: doc.travelBufferMinutes as number,
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
