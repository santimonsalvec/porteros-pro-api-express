import type { ClientSession, Db, Document } from 'mongodb';
import type {
  CancelAllResult,
  ClientCancelResult,
  ExpireResult,
  IBookingLifecycleStore,
} from '../../../application/features/bookingLifecycle/common/ports.js';
import { commissionRefundDraft, type LedgerOwner } from '../../../application/features/wallet/common/walletLedger.js';
import type { Booking } from '../../../domain/bookings/booking.js';
import type { DomainEvent } from '../../../domain/events/domainEvent.js';
import type { CancellationDetails } from '../../../domain/wallet/walletMovement.js';
import { BOOKINGS_COLLECTION, bookingFromDocument, bookingToDocument } from './bookingRepository.js';
import { GOALKEEPER_REQUESTS_COLLECTION, requestFromDocument } from './goalkeeperRequestRepository.js';
import { appendEventsInSession } from './outboxStore.js';
import { WALLET_MOVEMENTS_COLLECTION } from './walletMovementRepository.js';
import { appendMovementInSession } from './walletStore.js';

const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
  readPreference: 'primary' as const,
};

/** Ends a transaction with a business outcome and no writes; `withTransaction` does not retry it. */
class LifecycleAbort<T> extends Error {
  constructor(readonly result: T) {
    super('lifecycle transaction aborted');
  }
}

/**
 * Gives back exactly what was charged for the booking, once: the cause key is shared by every
 * path that refunds (016's "cancel all", 017's client cancellation, 011's `refundCommission`).
 * Aborts with `missing_charge` when the booking has no charge to give back.
 */
export async function refundCommissionInSession(
  db: Db,
  session: ClientSession,
  booking: Booking,
  args: { requestId: string; owner: LedgerOwner; cancellation: CancellationDetails; newId: () => string; now: Date },
): Promise<{ amount: number; currency: string }> {
  const movements = db.collection(WALLET_MOVEMENTS_COLLECTION);
  const charge = await movements.findOne({ causeKey: `commission:${booking.id}` } as Document, { session });
  if (!charge) throw new LifecycleAbort({ kind: 'missing_charge' as const, bookingId: booking.id });
  const amount = -(charge.amount as number);
  const currency = charge.currency as string;

  const refunded = await movements.findOne({ causeKey: `commission_refund:${booking.id}` } as Document, { session });
  if (refunded) return { amount: refunded.amount as number, currency };

  const draft = commissionRefundDraft(
    args.owner,
    { bookingId: booking.id, requestId: args.requestId, amount, cancellation: args.cancellation },
    args.newId(),
    args.now,
  );
  await appendMovementInSession(db, session, draft, args.now);
  return { amount, currency };
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
        // Bookings the client cancelled themselves no longer count (017, clarification 3).
        const wanted = (await bookings.find({ requestId } as Document, { session }).toArray())
          .map(bookingFromDocument)
          .filter((booking) => booking.cancelledBy !== 'client');
        if (wanted.every((booking) => booking.status === 'assigned')) return { kind: 'kept' };

        const toCancel = wanted.filter((booking) => booking.status === 'pending_assignment' || booking.status === 'assigned');
        const events: DomainEvent[] = [];
        let refunds = 0;
        for (const booking of toCancel) {
          const refund =
            booking.status === 'assigned'
              ? await refundCommissionInSession(this.db, session, booking, {
                  requestId,
                  owner: this.ownerOf(args.owners, booking),
                  cancellation: { by: 'system', at: now, reason: 'cancel_all' },
                  newId: args.newId,
                  now,
                })
              : null;
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
      if (error instanceof LifecycleAbort) return error.result as CancelAllResult;
      throw error;
    }
  }

  async cancelByClient(args: {
    requestId: string;
    clientId: string;
    bookingId: string | null;
    now: Date;
    note: string | null;
    owners: ReadonlyMap<string, LedgerOwner>;
    newId: () => string;
    buildEvent: (booking: Booking, refund: { amount: number; currency: string } | null) => DomainEvent;
  }): Promise<ClientCancelResult> {
    const { requestId, now } = args;
    const abort = (result: ClientCancelResult): never => {
      throw new LifecycleAbort(result);
    };
    try {
      return await this.inTransaction(async (session): Promise<ClientCancelResult> => {
        const requestDoc = await this.db
          .collection(GOALKEEPER_REQUESTS_COLLECTION)
          .findOne({ _id: requestId, clientId: args.clientId } as Document, { session });
        if (!requestDoc) return { kind: 'not_found', what: 'request' };
        const request = requestFromDocument(requestDoc);

        const bookings = this.db.collection(BOOKINGS_COLLECTION);
        const all = (await bookings.find({ requestId } as Document, { session }).toArray()).map(bookingFromDocument);
        const live = (booking: Booking) => booking.status === 'pending_assignment' || booking.status === 'assigned';

        let targets: Booking[];
        if (args.bookingId !== null) {
          const booking = all.find((item) => item.id === args.bookingId);
          if (!booking) return { kind: 'not_found', what: 'booking' };
          if (booking.cancelledBy === 'client') return { kind: 'replayed' };
          if (!live(booking)) return { kind: 'already_final', status: booking.status };
          targets = [booking];
        } else {
          targets = all.filter(live);
          if (targets.length === 0) {
            return all.some((booking) => booking.cancelledBy === 'client')
              ? { kind: 'replayed' }
              : { kind: 'already_final', status: all[0]?.status ?? 'closed' };
          }
        }

        // Decide every refusal before the first write, so a refusal changes nothing (clarification 1).
        const late = targets.find((booking) => booking.status === 'assigned' && !request.canCancelFreeAt(now));
        if (late) abort({ kind: 'window_closed', bookingId: late.id, freeCancellationUntil: request.freeCancellationUntil() });
        const unowned = targets.find((booking) => booking.status === 'assigned' && !args.owners.has(booking.goalkeeperId!));
        if (unowned) abort({ kind: 'owner_required', goalkeeperId: unowned.goalkeeperId! });

        const events: DomainEvent[] = [];
        let refunds = 0;
        const ended = { status: 'cancelled', endedAt: now, endReason: 'client_cancelled', cancelledBy: 'client', cancellationNote: args.note };
        for (const booking of targets) {
          const refund =
            booking.status === 'assigned'
              ? await refundCommissionInSession(this.db, session, booking, {
                  requestId,
                  owner: args.owners.get(booking.goalkeeperId!)!,
                  cancellation: { by: 'client', at: now, reason: args.note ?? 'client_cancelled' },
                  newId: args.newId,
                  now,
                })
              : null;
          if (refund) refunds += 1;
          await bookings.updateOne({ _id: booking.id, status: booking.status } as Document, { $set: ended }, { session });
          events.push(args.buildEvent(booking, refund));
        }
        await appendEventsInSession(this.db, session, events, now);
        await this.deactivateIfEnded(session, requestId);

        const cancelled = targets.map((booking) => bookingFromDocument({ ...bookingToDocument(booking), ...ended }));
        return { kind: 'cancelled', cancelled, refunds, events };
      });
    } catch (error) {
      if (error instanceof LifecycleAbort) return error.result as ClientCancelResult;
      throw error;
    }
  }

  private ownerOf(owners: ReadonlyMap<string, LedgerOwner>, booking: Booking): LedgerOwner {
    const owner = owners.get(booking.goalkeeperId!);
    if (!owner) throw new Error(`No ledger owner resolved for goalkeeper ${booking.goalkeeperId}`);
    return owner;
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
