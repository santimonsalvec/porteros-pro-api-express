import type { ClientSession, Db, Document } from 'mongodb';
import type {
  CancelAllResult,
  ExpireResult,
  IBookingLifecycleStore,
} from '../../../application/features/bookingLifecycle/common/ports.js';
import { commissionRefundDraft, type LedgerOwner } from '../../../application/features/wallet/common/walletLedger.js';
import type { Booking } from '../../../domain/bookings/booking.js';
import type { DomainEvent } from '../../../domain/events/domainEvent.js';
import { BOOKINGS_COLLECTION, bookingFromDocument, bookingToDocument } from './bookingRepository.js';
import { GOALKEEPER_REQUESTS_COLLECTION } from './goalkeeperRequestRepository.js';
import { appendEventsInSession } from './outboxStore.js';
import { WALLET_MOVEMENTS_COLLECTION } from './walletMovementRepository.js';
import { appendMovementInSession } from './walletStore.js';

const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
  readPreference: 'primary' as const,
};

/** Ends a "cancel all" transaction with a business outcome; `withTransaction` does not retry it. */
class LifecycleAbort extends Error {
  constructor(readonly result: Extract<CancelAllResult, { kind: 'missing_charge' }>) {
    super(`cancel all aborted: ${result.kind}`);
  }
}

/**
 * The time-driven transitions (feature 016, research §2–§3). Each call is one transaction whose
 * writes are conditioned on the current state, so a second sweep finds nothing to do and a
 * concurrent acceptance (012) conflicts on the booking document: the driver retries the loser,
 * which then sees the winner's outcome.
 */
export class MongoBookingLifecycleStore implements IBookingLifecycleStore {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
  ) {}

  expire(requestId: string, now: Date, buildEvents: (expired: readonly Booking[]) => DomainEvent[]): Promise<ExpireResult> {
    return this.inTransaction(async (session) => {
      const bookings = this.db.collection(BOOKINGS_COLLECTION);
      const due = await bookings
        .find({ requestId, status: 'pending_assignment', searchEndsAt: { $lte: now } } as Document, { session })
        .toArray();
      if (due.length === 0) return { expired: [], events: [], deactivated: false };

      const ended = { status: 'expired', endedAt: now, endReason: 'search_ended' };
      await bookings.updateMany(
        { _id: { $in: due.map((doc) => doc._id) }, status: 'pending_assignment' } as Document,
        { $set: ended },
        { session },
      );
      const expired = due.map((doc) => bookingFromDocument({ ...doc, ...ended }));
      const events = buildEvents(expired);
      await appendEventsInSession(this.db, session, events, now);
      const deactivated = await this.deactivateIfEnded(session, requestId);
      return { expired, events, deactivated };
    });
  }

  async cancelAll(args: {
    requestId: string;
    now: Date;
    owners: ReadonlyMap<string, LedgerOwner>;
    newId: () => string;
    buildEvent: (booking: Booking, refund: { amount: number; currency: string } | null) => DomainEvent;
  }): Promise<CancelAllResult> {
    const { requestId, now } = args;
    try {
      return await this.inTransaction(async (session): Promise<CancelAllResult> => {
        // The exactly-once gate: only one evaluation ever passes it.
        const gate = await this.db
          .collection(GOALKEEPER_REQUESTS_COLLECTION)
          .findOneAndUpdate(
            { _id: requestId, cancelAllEvaluatedAt: null } as Document,
            { $set: { cancelAllEvaluatedAt: now } },
            { session },
          );
        if (!gate) return { kind: 'already_evaluated' };

        const bookings = this.db.collection(BOOKINGS_COLLECTION);
        const all = (await bookings.find({ requestId } as Document, { session }).toArray()).map(bookingFromDocument);
        if (all.length > 0 && all.every((booking) => booking.status === 'assigned')) return { kind: 'kept' };

        const toCancel = all.filter((booking) => booking.status === 'pending_assignment' || booking.status === 'assigned');
        const events: DomainEvent[] = [];
        let refunds = 0;
        for (const booking of toCancel) {
          const refund = booking.status === 'assigned' ? await this.refund(session, booking, args) : null;
          if (refund) refunds += 1;
          await bookings.updateOne(
            { _id: booking.id, status: booking.status } as Document,
            { $set: { status: 'cancelled', endedAt: now, endReason: 'cancel_all', cancelledBy: 'system' } },
            { session },
          );
          events.push(args.buildEvent(booking, refund));
        }
        await appendEventsInSession(this.db, session, events, now);
        await this.deactivateIfEnded(session, requestId);

        const cancelled = toCancel.map((booking) =>
          bookingFromDocument({
            ...bookingToDocument(booking),
            status: 'cancelled',
            endedAt: now,
            endReason: 'cancel_all',
            cancelledBy: 'system',
          }),
        );
        return { kind: 'cancelled', cancelled, refunds, events };
      });
    } catch (error) {
      if (error instanceof LifecycleAbort) return error.result;
      throw error;
    }
  }

  /** Gives back exactly what was charged for the booking, once (the cause key is shared with 017). */
  private async refund(
    session: ClientSession,
    booking: Booking,
    args: { requestId: string; now: Date; owners: ReadonlyMap<string, LedgerOwner>; newId: () => string },
  ): Promise<{ amount: number; currency: string }> {
    const movements = this.db.collection(WALLET_MOVEMENTS_COLLECTION);
    const charge = await movements.findOne({ causeKey: `commission:${booking.id}` } as Document, { session });
    if (!charge) throw new LifecycleAbort({ kind: 'missing_charge', bookingId: booking.id });
    const amount = -(charge.amount as number);
    const currency = charge.currency as string;

    const refunded = await movements.findOne({ causeKey: `commission_refund:${booking.id}` } as Document, { session });
    if (refunded) return { amount: refunded.amount as number, currency };

    const owner = args.owners.get(booking.goalkeeperId!);
    if (!owner) throw new Error(`No ledger owner resolved for goalkeeper ${booking.goalkeeperId}`);
    const draft = commissionRefundDraft(
      owner,
      { bookingId: booking.id, requestId: args.requestId, amount, cancellation: { by: 'system', at: args.now, reason: 'cancel_all' } },
      args.newId(),
      args.now,
    );
    await appendMovementInSession(this.db, session, draft, args.now);
    return { amount, currency };
  }

  /** A request with nothing pending or assigned left no longer blocks a new one for the match. */
  private async deactivateIfEnded(session: ClientSession, requestId: string): Promise<boolean> {
    const live = await this.db
      .collection(BOOKINGS_COLLECTION)
      .countDocuments({ requestId, status: { $in: ['pending_assignment', 'assigned'] } } as Document, { session });
    if (live > 0) return false;
    await this.db.collection(GOALKEEPER_REQUESTS_COLLECTION).updateOne({ _id: requestId } as Document, { $set: { active: false } }, { session });
    return true;
  }

  private async inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.startSession();
    try {
      return await session.withTransaction(() => work(session), TRANSACTION_OPTIONS);
    } finally {
      await session.endSession();
    }
  }
}
