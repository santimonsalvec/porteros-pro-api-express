import type { ClientSession, Db, Document } from 'mongodb';
import type {
  AcceptanceResult,
  IBookingAcceptanceStore,
} from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { MovementDraft } from '../../../application/features/operatingBalance/common/ports.js';
import { Booking } from '../../../domain/bookings/booking.js';
import type { DomainEvent } from '../../../domain/events/domainEvent.js';
import type { VettingTier } from '../../../domain/goalkeepers/vetting.js';
import type { BalanceMovement } from '../../../domain/operatingBalance/balanceMovement.js';
import { firstConflict, holdsSameRequest } from '../../../domain/bookings/schedulePolicy.js';
import { BOOKINGS_COLLECTION, bookingFromDocument, priceToDocument } from './bookingRepository.js';
import { appendEventsInSession } from './outboxStore.js';
import { appendMovementInSession } from './operatingBalanceStore.js';

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
 *   3. charge its commission, and its VAT (feature 023), through the operating balance (011) — which always writes the goalkeeper's
 *      operating balance document, so two acceptances by the same goalkeeper conflict there: the driver
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
    tier: VettingTier;
    chargeDrafts: (booking: Booking) => MovementDraft[];
    events: (booking: Booking, charged: readonly BalanceMovement[]) => DomainEvent[];
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
              ...openToTierFilter(args.tier, now),
            } as Document,
            { $set: { status: 'assigned', goalkeeperId, assignedAt: now } },
            { returnDocument: 'after', session },
          );
          if (!claimed) return { kind: 'not_claimed' };
          // Admin spec 030: the price of whoever took it, and whether they had the seal.
          const claimedBooking = bookingFromDocument(claimed);
          const booking = Booking.rehydrate({ ...claimedBooking, status: 'pending_assignment', goalkeeperId: null, assignedAt: null }).assign(goalkeeperId, now, args.tier);
          await bookings.updateOne(
            { _id: bookingId } as Document,
            { $set: { price: priceToDocument(booking.price), goalkeeperVerified: booking.goalkeeperVerified } },
            { session },
          );

          const heldDocs = await bookings.find({ goalkeeperId, status: 'assigned', _id: { $ne: bookingId } } as Document, { session }).toArray();
          const held = heldDocs.map(bookingFromDocument);
          if (holdsSameRequest(booking, held)) throw new AcceptanceAbort({ kind: 'same_request' });
          const conflict = firstConflict(booking, held);
          if (conflict) throw new AcceptanceAbort({ kind: 'schedule_conflict', conflictingBookingId: conflict.id });

          const charged: BalanceMovement[] = [];
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

/**
 * The claim's half of `isOpenToTier` (admin spec 030): a validated goalkeeper without the seal only
 * claims a booking the client opened to them whose verified-only window has ended. An absent
 * `verifiedOnlyUntil` means it equals the creation, which is always in the past.
 */
export function openToTierFilter(tier: VettingTier, now: Date): Document {
  if (tier === 'verified') return {};
  if (tier === 'unvalidated') return { _id: { $exists: false } };
  return { acceptsUnverified: true, $or: [{ verifiedOnlyUntil: { $lte: now } }, { verifiedOnlyUntil: { $exists: false } }] };
}
