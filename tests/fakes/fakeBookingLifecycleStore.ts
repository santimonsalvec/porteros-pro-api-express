import type {
  CancelAllResult,
  ExpireResult,
  IBookingLifecycleStore,
} from '../../src/application/features/bookingLifecycle/common/ports.js';
import { commissionRefundDraft, type LedgerOwner } from '../../src/application/features/wallet/common/walletLedger.js';
import { Booking } from '../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../src/domain/bookings/goalkeeperRequest.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import type { FakeGoalkeeperRequestRepository } from './fakeGoalkeeperRequestRepository.js';
import type { FakeOutboxStore } from './fakeOutboxStore.js';
import type { FakeWalletStore } from './fakeWalletStore.js';

/**
 * `MongoBookingLifecycleStore` over the in-memory fakes. Every check and write of one call happens
 * synchronously (no `await` in between), so two concurrent calls behave like two transactions
 * where the second sees the first's outcome.
 */
export class FakeBookingLifecycleStore implements IBookingLifecycleStore {
  constructor(
    private readonly bookings: FakeBookingRepository,
    private readonly requests: FakeGoalkeeperRequestRepository,
    private readonly wallet: FakeWalletStore,
    private readonly outbox: FakeOutboxStore,
  ) {}

  async expire(requestId: string, now: Date, buildEvents: (expired: readonly Booking[]) => DomainEvent[]): Promise<ExpireResult> {
    const due = this.bookings
      .all()
      .filter((booking) => booking.requestId === requestId && booking.status === 'pending_assignment' && !booking.isSearchOpenAt(now));
    if (due.length === 0) return { expired: [], events: [], deactivated: false };

    const expired = due.map((booking) => Booking.rehydrate({ ...booking, status: 'expired', endedAt: now, endReason: 'search_ended' }));
    expired.forEach((booking) => this.bookings.seed(booking));
    const events = buildEvents(expired);
    this.outbox.append(events, now);
    return { expired, events, deactivated: this.deactivateIfEnded(requestId) };
  }

  async cancelAll(args: {
    requestId: string;
    now: Date;
    owners: ReadonlyMap<string, LedgerOwner>;
    newId: () => string;
    buildEvent: (booking: Booking, refund: { amount: number; currency: string } | null) => DomainEvent;
  }): Promise<CancelAllResult> {
    const { requestId, now } = args;
    const request = this.requests.all().find((item) => item.id === requestId);
    if (!request || request.cancelAllEvaluatedAt !== null) return { kind: 'already_evaluated' };

    const all = this.bookings.all().filter((booking) => booking.requestId === requestId);
    const toCancel = all.filter((booking) => booking.status === 'pending_assignment' || booking.status === 'assigned');
    const allAssigned = all.length > 0 && all.every((booking) => booking.status === 'assigned');
    const movements = this.wallet.movements();
    const missing = toCancel.find(
      (booking) => booking.status === 'assigned' && !movements.some((movement) => movement.causeKey === `commission:${booking.id}`),
    );
    if (!allAssigned && missing) return { kind: 'missing_charge', bookingId: missing.id };

    this.requests.seed(GoalkeeperRequest.rehydrate({ ...request, cancelAllEvaluatedAt: now }));
    if (allAssigned) return { kind: 'kept' };

    const events: DomainEvent[] = [];
    let refunds = 0;
    for (const booking of toCancel) {
      let refund: { amount: number; currency: string } | null = null;
      if (booking.status === 'assigned') {
        const charge = movements.find((movement) => movement.causeKey === `commission:${booking.id}`)!;
        refund = { amount: -charge.amount, currency: charge.currency };
        const owner = args.owners.get(booking.goalkeeperId!);
        if (!owner) throw new Error(`No ledger owner resolved for goalkeeper ${booking.goalkeeperId}`);
        // The fake wallet store records synchronously and ignores a known cause key.
        void this.wallet.append(
          commissionRefundDraft(
            owner,
            { bookingId: booking.id, requestId, amount: refund.amount, cancellation: { by: 'system', at: now, reason: 'cancel_all' } },
            args.newId(),
            now,
          ),
        );
        refunds += 1;
      }
      this.bookings.seed(Booking.rehydrate({ ...booking, status: 'cancelled', endedAt: now, endReason: 'cancel_all', cancelledBy: 'system' }));
      events.push(args.buildEvent(booking, refund));
    }
    this.outbox.append(events, now);
    this.deactivateIfEnded(requestId);
    const cancelled = toCancel.map((booking) => this.bookings.all().find((item) => item.id === booking.id)!);
    return { kind: 'cancelled', cancelled, refunds, events };
  }

  private deactivateIfEnded(requestId: string): boolean {
    const live = this.bookings
      .all()
      .some((booking) => booking.requestId === requestId && (booking.status === 'pending_assignment' || booking.status === 'assigned'));
    if (live) return false;
    const request = this.requests.all().find((item) => item.id === requestId);
    if (request) this.requests.seed(GoalkeeperRequest.rehydrate({ ...request, active: false }));
    return true;
  }
}
