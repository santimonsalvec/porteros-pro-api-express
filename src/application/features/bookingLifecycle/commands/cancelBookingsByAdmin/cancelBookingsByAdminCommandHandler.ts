import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { normalizeAdminCancellationReason } from '../../../../../domain/bookings/booking.js';
import { bookingCancelled } from '../../../../../domain/events/bookingEvents.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IEventRelay } from '../../../events/common/ports.js';
import type { IBookingAuditLogger, IBookingRepository } from '../../../goalkeeperRequests/common/ports.js';
import { assignedGoalkeeperIds } from '../../../goalkeeperRequests/common/requestResponse.js';
import type { GoalkeeperOperatingBalanceContextDependencies } from '../../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type { LedgerOwner } from '../../../operatingBalance/common/operatingBalanceLedger.js';
import type { AdminCancelResult, IBookingLifecycleStore, ILifecycleLogger } from '../../common/ports.js';
import { addLedgerOwner } from '../../common/resolveOwners.js';
import { CancelBookingsByAdminCommand, type CancelBookingsByAdminResult } from './cancelBookingsByAdminCommand.js';

export interface CancelBookingsByAdminDependencies {
  bookingRepository: Pick<IBookingRepository, 'findByRequestIds'>;
  store: IBookingLifecycleStore;
  operatingBalanceContext: GoalkeeperOperatingBalanceContextDependencies;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IBookingAuditLogger;
  logger: ILifecycleLogger;
}

/**
 * An administrator cancels (admin spec 006, research §1): the client's transaction with the
 * administrator's policy — no deadline, the whole commission back, no incident. A goalkeeper
 * assigned between our look and the transaction just needs their ledger owner: resolved and retried once.
 */
export class CancelBookingsByAdminCommandHandler implements ICommandHandler<CancelBookingsByAdminCommand, CancelBookingsByAdminResult> {
  constructor(private readonly deps: CancelBookingsByAdminDependencies) {}

  async handle(command: CancelBookingsByAdminCommand): Promise<CancelBookingsByAdminResult> {
    const result = await this.cancel(command);
    // Ids and outcome only: the reason is internal and never goes to the logs (FR-017).
    this.deps.audit.logAdminCancellation({
      outcome: result.outcome,
      staffUserId: command.staffUserId,
      requestId: command.requestId,
      ...(command.bookingId ? { bookingId: command.bookingId } : {}),
    });
    return result;
  }

  private async cancel(command: CancelBookingsByAdminCommand): Promise<CancelBookingsByAdminResult> {
    let reason: string;
    try {
      reason = normalizeAdminCancellationReason(command.reason);
    } catch {
      return { outcome: 'invalid_reason' };
    }
    const now = this.deps.clock.now();
    const bookings = await this.deps.bookingRepository.findByRequestIds([command.requestId]);
    const owners = new Map<string, LedgerOwner>();
    for (const goalkeeperId of assignedGoalkeeperIds(bookings.filter((booking) => booking.status === 'assigned'))) {
      if (!(await this.addOwner(owners, goalkeeperId))) return { outcome: 'temporarily_unavailable' };
    }

    const attempt = () =>
      this.deps.store.cancelByAdmin({
        requestId: command.requestId,
        bookingId: command.bookingId,
        now,
        staffUserId: command.staffUserId,
        reason,
        owners,
        newId: () => this.deps.idGenerator.newId(),
        buildEvent: (booking, refund) =>
          bookingCancelled(this.deps.idGenerator.newId(), booking, now, refund, { reason: 'admin_cancelled', by: 'admin' }),
      });
    let result: AdminCancelResult = await attempt();
    if (result.kind === 'owner_required') {
      if (!(await this.addOwner(owners, result.goalkeeperId))) return { outcome: 'temporarily_unavailable' };
      result = await attempt();
    }

    switch (result.kind) {
      case 'cancelled':
        await this.deps.relay.relay(result.events);
        return { outcome: 'cancelled', cancelled: result.cancelled.map((booking) => booking.id), refunds: result.refunds };
      case 'replayed':
        return { outcome: 'replayed' };
      case 'not_found':
        return { outcome: result.what === 'request' ? 'request_not_found' : 'booking_not_found' };
      case 'already_final':
        return { outcome: 'not_cancellable', status: result.status };
      case 'owner_required':
        return { outcome: 'temporarily_unavailable' };
      case 'missing_charge':
        this.deps.logger.warn(
          { outcome: 'admin_cancel_missing_charge', requestId: command.requestId, bookingId: result.bookingId },
          'An assigned booking has no commission charge to refund',
        );
        return { outcome: 'temporarily_unavailable' };
    }
  }

  private addOwner(owners: Map<string, LedgerOwner>, goalkeeperId: string): Promise<boolean> {
    return addLedgerOwner(this.deps, owners, goalkeeperId, 'admin_cancel_owner_unresolved');
  }
}
