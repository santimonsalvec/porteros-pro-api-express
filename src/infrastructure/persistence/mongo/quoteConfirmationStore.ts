import type { ClientSession, Db, Document } from 'mongodb';
import type {
  ClaimResult,
  IQuoteConfirmationStore,
} from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { Booking } from '../../../domain/bookings/booking.js';
import type { Quote } from '../../../domain/bookings/quote.js';
import { BOOKINGS_COLLECTION, bookingToDocument } from './bookingRepository.js';
import { QUOTES_COLLECTION, quoteFromDocument } from './quoteRepository.js';

const DUPLICATE_KEY = 11000;

function duplicateKeyPattern(error: unknown): Record<string, unknown> | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, keyPattern } = error as { code?: unknown; keyPattern?: unknown };
  if (code !== DUPLICATE_KEY) return null;
  return typeof keyPattern === 'object' && keyPattern !== null
    ? (keyPattern as Record<string, unknown>)
    : {};
}

/**
 * Turns a quote into a booking in ONE multi-document transaction (research.md §1): the
 * conditional `findOneAndDelete` is the claim — its filter carries every confirmability rule, so
 * checking and removing are a single server-side operation — and the booking insert commits with
 * it or not at all (FR-010, FR-011).
 *
 * Concurrency: two confirmations of the same quote make the loser hit a write conflict, which the
 * driver labels `TransientTransactionError` and `withTransaction` retries by itself; on the retry
 * the quote is gone (`not_claimed`). A unique-index violation is not transient: it aborts the
 * transaction — so the quote is NOT deleted — and is classified by the index it hit (§2).
 */
export class MongoQuoteConfirmationStore implements IQuoteConfirmationStore {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
  ) {}

  async claimAndBook(
    quoteId: string,
    clientId: string,
    now: Date,
    newBooking: (quote: Quote) => Booking,
  ): Promise<ClaimResult> {
    const quotes = this.db.collection(QUOTES_COLLECTION);
    const bookings = this.db.collection(BOOKINGS_COLLECTION);
    const session = this.startSession();
    // The booking being inserted, so a duplicate-match violation can report its zone and start.
    const attempt: { booking: Booking | null } = { booking: null };
    try {
      return await session.withTransaction(
        async (): Promise<ClaimResult> => {
          const doc = await quotes.findOneAndDelete(
            { _id: quoteId, clientId, expiresAt: { $gt: now } } as Document,
            { session },
          );
          if (!doc) return { kind: 'not_claimed' };

          const booking = newBooking(quoteFromDocument(doc));
          attempt.booking = booking;
          await bookings.insertOne(bookingToDocument(booking), { session });
          return { kind: 'booked', booking };
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        },
      );
    } catch (error) {
      const keyPattern = duplicateKeyPattern(error);
      if (keyPattern && 'quoteId' in keyPattern) return { kind: 'already_booked' };
      if (keyPattern && attempt.booking && 'zoneId' in keyPattern) {
        return {
          kind: 'duplicate_booking',
          zoneId: attempt.booking.zoneId,
          startsAt: attempt.booking.startsAt,
        };
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
