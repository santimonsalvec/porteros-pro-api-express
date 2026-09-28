import { bookingCancelled } from '../../../../domain/events/bookingEvents.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IEventRelay, IScheduledJob } from '../../events/common/ports.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../wallet/common/goalkeeperWalletContext.js';
import type { LedgerOwner } from '../../wallet/common/walletLedger.js';
import type { IBookingLifecycleStore, ILifecycleLogger } from '../common/ports.js';

export interface CancelAllDependencies {
  requestRepository: IGoalkeeperRequestRepository;
  bookingRepository: IBookingRepository;
  store: IBookingLifecycleStore;
  walletContext: GoalkeeperWalletContextDependencies;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  logger: ILifecycleLogger;
  /** At most this many requests per run; the rest go to the next sweep. */
  cap?: number;
}

/**
 * Applies the client's "cancel all" preference at the end of the free-cancellation period
 * (Story 2): a request not fully assigned by then is cancelled as a whole, and the goalkeepers
 * who had paid get their commission back; a full one is left firm. Each request is evaluated
 * once — the store's gate — and a request whose goalkeepers' wallets can't be resolved is left
 * for the next sweep rather than half-cancelled.
 */
export class CancelAllJob implements IScheduledJob {
  readonly name = 'cancel-all';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: CancelAllDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 500;
    const due = await this.deps.requestRepository.findDueForCancelAll(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'lifecycle_cap_reached', job: this.name, cap }, '"Cancel all" read its maximum of requests');

    const counts = { kept: 0, cancelled: 0, refunds: 0, skipped: 0, failed: 0 };
    for (const request of due) {
      try {
        const owners = await this.owners(request.id);
        if (!owners) {
          counts.skipped += 1;
          continue;
        }
        const result = await this.deps.store.cancelAll({
          requestId: request.id,
          now,
          owners,
          newId: () => this.deps.idGenerator.newId(),
          buildEvent: (booking, refund) => bookingCancelled(this.deps.idGenerator.newId(), booking, now, refund),
        });
        switch (result.kind) {
          case 'already_evaluated':
            break;
          case 'kept':
            counts.kept += 1;
            break;
          case 'missing_charge':
            counts.skipped += 1;
            this.deps.logger.warn(
              { outcome: 'cancel_all_skipped', requestId: request.id, reason: 'missing_charge', bookingId: result.bookingId },
              '"Cancel all" found an assigned booking without its commission charge',
            );
            break;
          case 'cancelled':
            counts.cancelled += 1;
            counts.refunds += result.refunds;
            await this.deps.relay.relay(result.events);
            break;
        }
      } catch (err) {
        counts.failed += 1;
        this.deps.logger.warn({ outcome: 'lifecycle_item_failed', job: this.name, requestId: request.id, err }, '"Cancel all" failed; retried next sweep');
      }
    }
    if (due.length > 0) this.deps.logger.info({ outcome: 'cancel_all_evaluated', ...counts }, '"Cancel all" requests evaluated');
    return `${counts.cancelled} cancelled, ${counts.kept} kept, ${counts.refunds} refunds, ${counts.skipped} skipped, ${counts.failed} failed`;
  }

  /** The ledger owner of every assigned goalkeeper of the request, or null when one can't be resolved. */
  private async owners(requestId: string): Promise<Map<string, LedgerOwner> | null> {
    const bookings = await this.deps.bookingRepository.findByRequestIds([requestId]);
    const owners = new Map<string, LedgerOwner>();
    for (const goalkeeperId of new Set(bookings.flatMap((booking) => (booking.status === 'assigned' && booking.goalkeeperId ? [booking.goalkeeperId] : [])))) {
      const context = await resolveGoalkeeperWalletContext(this.deps.walletContext, goalkeeperId);
      if (context.kind !== 'ok') {
        this.deps.logger.warn({ outcome: 'cancel_all_skipped', requestId, reason: context.kind, goalkeeperId }, '"Cancel all" skipped a request');
        return null;
      }
      owners.set(goalkeeperId, { goalkeeperId, currency: context.currency, invoicing: context.invoicing });
    }
    return owners;
  }
}
