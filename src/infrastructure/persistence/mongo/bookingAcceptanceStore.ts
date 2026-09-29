import type { ClientSession, Db, Document } from 'mongodb';
import type {
  AcceptanceResult,
  IBookingAcceptanceStore,
} from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { MovementDraft } from '../../../application/features/wallet/common/ports.js';
import type { Booking } from '../../../domain/bookings/booking.js';
import type { DomainEvent } from '../../../domain/events/domainEvent.js';
import type { WalletMovement } from '../../../domain/wallet/walletMovement.js';
import { firstConflict, holdsSameRequest } from '../../../domain/bookings/schedulePolicy.js';
import { BOOKINGS_COLLECTION, bookingFromDocument } from './bookingRepository.js';
import { appendEventsInSession } from './outboxStore.js';
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
 *   3. charge its commission, and its VAT (feature 023), through the wallet (011) — which always writes the goalkeeper's
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
    chargeDrafts: (booking: Booking) => MovementDraft[];
    events: (booking: Booking, charged: readonly WalletMovement[]) => DomainEvent[];
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

          const charged: WalletMovement[] = [];
          for (const draft of args.chargeDrafts(booking)) {
            const charge = await appendMovementInSession(this.db, session, draft, now);
            if (charge.kind === 'insufficient_funds') {
              // Report the balance before this acceptance: add back what it already debited.
              const debited = charged.reduce((sum, movement) => sum - movement.amount, 0);
              throw new AcceptanceAbort({ kind: 'insufficient_funds', balance: charge.balance + debited });
            }
            if (charge.kind !== 'recorded') throw new Error(`Acceptance of ${booking.id}: ${draft.type} was a duplicate`);
            charged.push(charge.movement);
          }

          const events = args.events(booking, charged);
          await appendEventsInSession(this.db, session, events, now);
          return { kind: 'accepted', booking, events };
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
