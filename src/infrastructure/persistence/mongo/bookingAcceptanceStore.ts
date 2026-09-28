import type { ClientSession, Db, Document } from 'mongodb';
import type {
  AcceptanceResult,
  IBookingAcceptanceStore,
} from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { MovementDraft } from '../../../application/features/wallet/common/ports.js';
import type { Booking } from '../../../domain/bookings/booking.js';
import { firstConflict, holdsSameRequest } from '../../../domain/bookings/schedulePolicy.js';
import { BOOKINGS_COLLECTION, bookingFromDocument } from './bookingRepository.js';
import { appendMovementInSession } from './walletStore.js';

/** Aborts the acceptance transaction with a business outcome; `withTransaction` does not retry it. */
class AcceptanceAbort extends Error {
  constructor(readonly result: Exclude<AcceptanceResult, { kind: 'accepted' } | { kind: 'not_claimed' }>) {
    super(`acceptance aborted: ${result.kind}`);
  }
}

/**
 * Accepting a booking is ONE transaction (research.md §3):
 *   1. claim it — a conditional update that only matches while it is pending, its search is open
 *      and it is not the goalkeeper's own request (so two goalkeepers can never both get it);
 *   2. check it against the bookings the goalkeeper already holds (clash, same request);
 *   3. charge its commission through the wallet (011) — which always writes the goalkeeper's
 *      wallet document, so two acceptances by the same goalkeeper conflict there: the driver
 *      retries the loser, whose snapshot then includes the winner's assignment, and step 2
 *      refuses it. Concurrent clashes are therefore impossible.
 * Any refusal aborts the transaction: nothing is assigned and nothing is charged.
 */
export class MongoBookingAcceptanceStore implements IBookingAcceptanceStore {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
  ) {}

  async accept(args: {
    bookingId: string;
    goalkeeperId: string;
    now: Date;
    commissionDraft: (booking: Booking) => MovementDraft;
  }): Promise<AcceptanceResult> {
    const { bookingId, goalkeeperId, now } = args;
    const bookings = this.db.collection(BOOKINGS_COLLECTION);
    const session = this.startSession();
    try {
      return await session.withTransaction(
        async (): Promise<AcceptanceResult> => {
          const claimed = await bookings.findOneAndUpdate(
            {
              _id: bookingId,
              status: 'pending_assignment',
              searchEndsAt: { $gt: now },
              clientId: { $ne: goalkeeperId },
            } as Document,
            { $set: { status: 'assigned', goalkeeperId, assignedAt: now } },
            { returnDocument: 'after', session },
          );
          if (!claimed) return { kind: 'not_claimed' };
          const booking = bookingFromDocument(claimed);

          const heldDocs = await bookings.find({ goalkeeperId, status: 'assigned', _id: { $ne: bookingId } } as Document, { session }).toArray();
          const held = heldDocs.map(bookingFromDocument);
          if (holdsSameRequest(booking, held)) throw new AcceptanceAbort({ kind: 'same_request' });
          const conflict = firstConflict(booking, held);
          if (conflict) throw new AcceptanceAbort({ kind: 'schedule_conflict', conflictingBookingId: conflict.id });

          const charge = await appendMovementInSession(this.db, session, args.commissionDraft(booking), now);
          if (charge.kind === 'insufficient_funds') throw new AcceptanceAbort({ kind: 'insufficient_funds', balance: charge.balance });

          return { kind: 'accepted', booking };
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
      );
    } catch (error) {
      if (error instanceof AcceptanceAbort) return error.result;
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
