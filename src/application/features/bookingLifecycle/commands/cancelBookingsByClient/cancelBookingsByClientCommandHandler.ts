import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { normalizeCancellationNote } from '../../../../../domain/bookings/booking.js';
import { bookingCancelled } from '../../../../../domain/events/bookingEvents.js';
import type { IIdGenerator, IUserRepository } from '../../../auth/common/ports.js';
import type { IEventRelay } from '../../../events/common/ports.js';
import { loadContacts } from '../../../goalkeeperRequests/common/contacts.js';
import type { IBookingAuditLogger, IBookingRepository, IGoalkeeperRequestRepository } from '../../../goalkeeperRequests/common/ports.js';
import { assignedGoalkeeperIds, toRequestResponse } from '../../../goalkeeperRequests/common/requestResponse.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../../wallet/common/goalkeeperWalletContext.js';
import type { LedgerOwner } from '../../../wallet/common/walletLedger.js';
import type { ClientCancelResult, IBookingLifecycleStore, ILifecycleLogger } from '../../common/ports.js';
import { CancelBookingsByClientCommand, type CancelBookingsByClientResult } from './cancelBookingsByClientCommand.js';

export interface CancelBookingsByClientDependencies {
  requestRepository: IGoalkeeperRequestRepository;
  bookingRepository: IBookingRepository;
  userRepository: IUserRepository;
  store: IBookingLifecycleStore;
  walletContext: GoalkeeperWalletContextDependencies;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IBookingAuditLogger;
  logger: ILifecycleLogger;
}

/**
 * The client cancels one booking or their whole request (feature 017). The rules are decided in
 * one transaction (the store): free while searching, refunded while assigned and in time, refused
 * — changing nothing — once an assigned booking is inside the last period. A goalkeeper assigned
 * between our look and the transaction just needs their ledger owner: resolved and retried once.
 */
export class CancelBookingsByClientCommandHandler
  implements ICommandHandler<CancelBookingsByClientCommand, CancelBookingsByClientResult>
{
  constructor(private readonly deps: CancelBookingsByClientDependencies) {}

  async handle(command: CancelBookingsByClientCommand): Promise<CancelBookingsByClientResult> {
    return this.finish(command, await this.cancel(command));
  }

  private async cancel(command: CancelBookingsByClientCommand): Promise<CancelBookingsByClientResult> {
    const { clientId, requestId, bookingId } = command;
    let note: string | null;
    try {
      note = normalizeCancellationNote(command.reason);
    } catch {
      return { outcome: 'invalid_reason' };
    }
    // An unknown or malformed id simply isn't found; another client's request answers the same.
    const [request] = await this.deps.requestRepository.findByIds([requestId]);
    if (!request || request.clientId !== clientId) return { outcome: 'request_not_found' };

    const now = this.deps.clock.now();
    const bookings = await this.deps.bookingRepository.findByRequestIds([requestId]);
    const owners = new Map<string, LedgerOwner>();
    for (const goalkeeperId of assignedGoalkeeperIds(bookings.filter((booking) => booking.status === 'assigned'))) {
      if (!(await this.addOwner(owners, goalkeeperId))) return { outcome: 'temporarily_unavailable' };
    }

    const attempt = () =>
      this.deps.store.cancelByClient({
        requestId,
        clientId,
        bookingId,
        now,
        note,
        owners,
        newId: () => this.deps.idGenerator.newId(),
        buildEvent: (booking, refund) =>
          bookingCancelled(this.deps.idGenerator.newId(), booking, now, refund, { reason: 'client_cancelled', by: 'client' }),
      });
    let result: ClientCancelResult = await attempt();
    if (result.kind === 'owner_required') {
      if (!(await this.addOwner(owners, result.goalkeeperId))) return { outcome: 'temporarily_unavailable' };
      result = await attempt();
    }

    switch (result.kind) {
      case 'cancelled':
        await this.deps.relay.relay(result.events);
        return { outcome: 'cancelled', request: await this.requestNow(requestId, now) };
      case 'replayed':
        return { outcome: 'replayed', request: await this.requestNow(requestId, now) };
      case 'not_found':
        return { outcome: result.what === 'request' ? 'request_not_found' : 'booking_not_found' };
      case 'already_final':
        return { outcome: 'not_cancellable', status: result.status };
      case 'window_closed':
        return { outcome: 'window_closed', bookingId: result.bookingId, freeCancellationUntil: result.freeCancellationUntil.toISOString() };
      case 'owner_required':
        return { outcome: 'temporarily_unavailable' };
      case 'missing_charge':
        this.deps.logger.warn(
          { outcome: 'client_cancel_missing_charge', requestId, bookingId: result.bookingId },
          'An assigned booking has no commission charge to refund',
        );
        return { outcome: 'temporarily_unavailable' };
    }
  }

  /** False when the goalkeeper's wallet can't be resolved (a configuration gap). */
  private async addOwner(owners: Map<string, LedgerOwner>, goalkeeperId: string): Promise<boolean> {
    const context = await resolveGoalkeeperWalletContext(this.deps.walletContext, goalkeeperId);
    if (context.kind !== 'ok') {
      this.deps.logger.warn({ outcome: 'client_cancel_owner_unresolved', goalkeeperId, reason: context.kind }, 'Refund owner unresolved');
      return false;
    }
    owners.set(goalkeeperId, { goalkeeperId, currency: context.currency, invoicing: context.invoicing });
    return true;
  }

  /** The request with its bookings as they are now, and the contacts of whoever still holds one. */
  private async requestNow(requestId: string, now: Date) {
    const [request] = await this.deps.requestRepository.findByIds([requestId]);
    const bookings = await this.deps.bookingRepository.findByRequestIds([requestId]);
    const contacts = await loadContacts(this.deps.userRepository, assignedGoalkeeperIds(bookings.filter((booking) => booking.status === 'assigned')));
    return toRequestResponse(request!, bookings, now, contacts);
  }

  private finish(command: CancelBookingsByClientCommand, result: CancelBookingsByClientResult): CancelBookingsByClientResult {
    this.deps.audit.logClientCancellation({
      outcome: result.outcome,
      clientId: command.clientId,
      requestId: command.requestId,
      ...(command.bookingId ? { bookingId: command.bookingId } : {}),
    });
    return result;
  }
}
