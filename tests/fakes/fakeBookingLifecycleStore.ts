import type {
  CancelAllResult,
  ClientCancelResult,
  ExpireResult,
  IBookingLifecycleStore,
  ReversalOutcome,
  WithdrawResult,
} from '../../src/application/features/bookingLifecycle/common/ports.js';
import type { CancellationDetails } from '../../src/domain/wallet/walletMovement.js';
import { commissionRefundDraft, type LedgerOwner } from '../../src/application/features/wallet/common/walletLedger.js';
import { Booking } from '../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../src/domain/bookings/goalkeeperRequest.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';
import { GoalkeeperIncident, suspensionEndOf } from '../../src/domain/goalkeepers/goalkeeperIncident.js';
import { isLate, penaltiesFor, windowStart, type GoalkeeperPenaltyConfig } from '../../src/domain/goalkeepers/penaltyPolicy.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
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
  /** The `goalkeeperIncidents` collection (feature 018). */
  private readonly incidentList: GoalkeeperIncident[] = [];

  constructor(
    private readonly bookings: FakeBookingRepository,
    private readonly requests: FakeGoalkeeperRequestRepository,
    private readonly wallet: FakeWalletStore,
    private readonly outbox: FakeOutboxStore,
    private readonly profiles?: FakeGoalkeeperProfileRepository,
  ) {}

  incidents(): GoalkeeperIncident[] {
    return [...this.incidentList];
  }

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

    // Bookings the client cancelled themselves no longer count (017, clarification 3).
    // Nor do the ones a goalkeeper withdrew from: their replacement stands in their place (018).
    const all = this.bookings
      .all()
      .filter((booking) => booking.requestId === requestId && booking.cancelledBy !== 'client' && booking.status !== 'goalkeeper_withdrew');
    const toCancel = all.filter((booking) => booking.status === 'pending_assignment' || booking.status === 'assigned');
    const allAssigned = all.every((booking) => booking.status === 'assigned');
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
    const request = this.requests.all().find((item) => item.id === requestId && item.clientId === args.clientId);
    if (!request) return { kind: 'not_found', what: 'request' };
    const all = this.bookings.all().filter((booking) => booking.requestId === requestId);
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
        return all.some((booking) => booking.cancelledBy === 'client') ? { kind: 'replayed' } : { kind: 'already_final', status: all[0]?.status ?? 'closed' };
      }
    }
    const late = targets.find((booking) => booking.status === 'assigned' && !request.canCancelFreeAt(now));
    if (late) return { kind: 'window_closed', bookingId: late.id, freeCancellationUntil: request.freeCancellationUntil() };
    const unowned = targets.find((booking) => booking.status === 'assigned' && !args.owners.has(booking.goalkeeperId!));
    if (unowned) return { kind: 'owner_required', goalkeeperId: unowned.goalkeeperId! };
    const movements = this.wallet.movements();
    const missing = targets.find(
      (booking) => booking.status === 'assigned' && !movements.some((movement) => movement.causeKey === `commission:${booking.id}`),
    );
    if (missing) return { kind: 'missing_charge', bookingId: missing.id };

    const events: DomainEvent[] = [];
    let refunds = 0;
    const cancellation: CancellationDetails = { by: 'client', at: now, reason: args.note ?? 'client_cancelled' };
    for (const booking of targets) {
      let refund: { amount: number; currency: string } | null = null;
      if (booking.status === 'assigned') {
        refund = this.refund(booking, requestId, args.owners.get(booking.goalkeeperId!)!, cancellation, args.newId, now);
        refunds += 1;
      }
      this.bookings.seed(
        Booking.rehydrate({ ...booking, status: 'cancelled', endedAt: now, endReason: 'client_cancelled', cancelledBy: 'client', cancellationNote: args.note }),
      );
      events.push(args.buildEvent(booking, refund));
    }
    this.outbox.append(events, now);
    this.deactivateIfEnded(requestId);
    const cancelled = targets.map((booking) => this.bookings.all().find((item) => item.id === booking.id)!);
    return { kind: 'cancelled', cancelled, refunds, events };
  }

  async withdraw(args: {
    bookingId: string;
    goalkeeperId: string;
    now: Date;
    note: string | null;
    config: GoalkeeperPenaltyConfig;
    newId: () => string;
    buildEvents: (withdrawn: Booking, incident: GoalkeeperIncident, replacement: Booking | null, suspendedUntil: Date | null) => DomainEvent[];
  }): Promise<WithdrawResult> {
    const { bookingId, goalkeeperId, now, config } = args;
    const booking = this.bookings.all().find((item) => item.id === bookingId);
    if (!booking || booking.goalkeeperId !== goalkeeperId) return { kind: 'not_found' };
    if (booking.status === 'goalkeeper_withdrew') {
      const existing = this.incidentList.find((incident) => incident.bookingId === bookingId);
      if (existing) return { kind: 'replayed', booking, incident: existing, suspendedUntil: this.profiles?.suspendedUntilOf(goalkeeperId) ?? null };
    }
    if (booking.status !== 'assigned') return { kind: 'not_withdrawable', status: booking.status };
    if (now.getTime() >= booking.startsAt.getTime()) return { kind: 'match_started', startsAt: booking.startsAt };

    const withdrawn = Booking.rehydrate({
      ...booking,
      status: 'goalkeeper_withdrew',
      endedAt: now,
      endReason: 'goalkeeper_withdrew',
      cancelledBy: 'goalkeeper',
      cancellationNote: args.note,
    });
    this.bookings.seed(withdrawn);
    const replacement = booking.isSearchOpenAt(now) ? Booking.replacementFor(booking, args.newId(), goalkeeperId, now) : null;
    if (replacement) this.bookings.seed(replacement);

    const since = windowStart(now, config).getTime();
    const recentCount = this.incidentList.filter(
      (incident) => incident.goalkeeperId === goalkeeperId && incident.countsTowardLimit() && incident.occurredAt.getTime() > since,
    ).length;
    const noticeMinutes = booking.withdrawalNoticeMinutes(now);
    const late = isLate(noticeMinutes, config);
    const incident = GoalkeeperIncident.rehydrate({
      id: args.newId(),
      kind: 'withdrawal',
      goalkeeperId,
      bookingId,
      requestId: booking.requestId,
      startsAt: booking.startsAt,
      occurredAt: now,
      noticeMinutes,
      late,
      reason: args.note,
      replacementBookingId: replacement?.id ?? null,
      penalties: penaltiesFor({ occurredAt: now, late, recentCount, config, newId: args.newId }).map((penalty) => ({ ...penalty, reversal: null })),
      moneyReversal: null,
      forgivenAt: null,
    });
    this.incidentList.push(incident);
    const suspendedUntil = this.writeSuspension(goalkeeperId, now);

    const events = args.buildEvents(withdrawn, incident, replacement, suspendedUntil);
    this.outbox.append(events, now);
    this.deactivateIfEnded(booking.requestId);
    return { kind: 'withdrawn', booking: withdrawn, incident, replacement, suspendedUntil, events };
  }

  async reverseWithdrawal(args: {
    goalkeeperId: string;
    withdrawalId: string;
    adminId: string;
    refund: boolean;
    liftSuspension: boolean;
    reason: string;
    now: Date;
    owner: LedgerOwner | null;
    newId: () => string;
  }): Promise<ReversalOutcome> {
    const { goalkeeperId, now } = args;
    const index = this.incidentList.findIndex((item) => item.id === args.withdrawalId && item.goalkeeperId === goalkeeperId);
    if (index < 0) return { kind: 'not_found' };
    const incident = this.incidentList[index]!;

    let refund: { amount: number; currency: string } | null = null;
    if (args.refund && incident.moneyReversal === null) {
      if (!args.owner) throw new Error(`No ledger owner resolved for goalkeeper ${goalkeeperId}`);
      const movements = this.wallet.movements();
      const charge = movements.find((movement) => movement.causeKey === `commission:${incident.bookingId}`);
      if (!charge) return { kind: 'missing_charge', bookingId: incident.bookingId };
      const known = movements.find((movement) => movement.causeKey === `commission_refund:${incident.bookingId}`);
      refund = { amount: -charge.amount, currency: charge.currency };
      if (!known) {
        void this.wallet.append(
          commissionRefundDraft(
            args.owner,
            {
              bookingId: incident.bookingId,
              requestId: incident.requestId,
              amount: refund.amount,
              cancellation: { by: 'admin', at: now, reason: args.reason },
            },
            args.newId(),
            now,
            { kind: 'admin', userId: args.adminId },
          ),
        );
      }
    }

    const { incident: reversed, changed } = incident.reverse({ by: args.adminId, at: now, reason: args.reason }, { refund, liftSuspension: args.liftSuspension });
    if (!changed) return { kind: 'replayed', incident, suspendedUntil: this.profiles?.suspendedUntilOf(goalkeeperId) ?? null };
    this.incidentList[index] = reversed;
    return { kind: 'reversed', incident: reversed, suspendedUntil: this.writeSuspension(goalkeeperId, now) };
  }

  private writeSuspension(goalkeeperId: string, now: Date): Date | null {
    const suspendedUntil = suspensionEndOf(
      this.incidentList.filter((incident) => incident.goalkeeperId === goalkeeperId),
      now,
    );
    this.profiles?.setSuspendedUntilNow(goalkeeperId, suspendedUntil);
    return suspendedUntil;
  }

  /** Records the refund synchronously (the fake wallet ignores a known cause key). */
  private refund(
    booking: Booking,
    requestId: string,
    owner: LedgerOwner,
    cancellation: CancellationDetails,
    newId: () => string,
    now: Date,
  ): { amount: number; currency: string } {
    const charge = this.wallet.movements().find((movement) => movement.causeKey === `commission:${booking.id}`)!;
    const amount = -charge.amount;
    void this.wallet.append(commissionRefundDraft(owner, { bookingId: booking.id, requestId, amount, cancellation }, newId(), now));
    return { amount, currency: charge.currency };
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
