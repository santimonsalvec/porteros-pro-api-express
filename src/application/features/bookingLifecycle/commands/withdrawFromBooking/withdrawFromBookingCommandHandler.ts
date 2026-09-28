import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { normalizeCancellationNote, type Booking } from '../../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../../domain/bookings/goalkeeperRequest.js';
import type { DomainEvent } from '../../../../../domain/events/domainEvent.js';
import { bookingCreated, goalkeeperWithdrew } from '../../../../../domain/events/bookingEvents.js';
import type { GoalkeeperIncident } from '../../../../../domain/goalkeepers/goalkeeperIncident.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IEventRelay } from '../../../events/common/ports.js';
import { loadBookingItemContext, toAgendaItem } from '../../../goalkeeperRequests/common/goalkeeperBookingResponse.js';
import type {
  IBookingAuditLogger,
  IBookingRepository,
  IBookingSettingsRepository,
  IGoalkeeperRequestRepository,
} from '../../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { GoalkeeperWalletContextDependencies } from '../../../wallet/common/goalkeeperWalletContext.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { resolvePenaltyConfig } from '../../common/penaltyConfig.js';
import type { IBookingLifecycleStore, ILifecycleLogger } from '../../common/ports.js';
import { toWithdrawalSummary } from '../../common/withdrawalResponses.js';
import { WithdrawFromBookingCommand, type WithdrawFromBookingResult } from './withdrawFromBookingCommand.js';

export interface WithdrawFromBookingDependencies {
  walletContext: GoalkeeperWalletContextDependencies;
  bookingSettingsRepository: IBookingSettingsRepository;
  store: IBookingLifecycleStore;
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IBookingAuditLogger;
  logger: ILifecycleLogger;
}

/**
 * The goalkeeper withdraws (feature 018). Everything happens in one transaction (the store): the
 * booking ends without a refund, a replacement is created while the search is open, the penalty
 * policy runs with the country's values and the suspension end is recomputed. The recorded events
 * are relayed before answering, so the client's notice and the replacement's offers leave at once.
 */
export class WithdrawFromBookingCommandHandler implements ICommandHandler<WithdrawFromBookingCommand, WithdrawFromBookingResult> {
  constructor(private readonly deps: WithdrawFromBookingDependencies) {}

  async handle(command: WithdrawFromBookingCommand): Promise<WithdrawFromBookingResult> {
    const result = await this.withdraw(command);
    this.deps.audit.logWithdrawal({
      outcome: result.outcome,
      goalkeeperId: command.goalkeeperId,
      bookingId: command.bookingId,
      ...('booking' in result ? { requestId: result.booking.requestId } : {}),
    });
    return result;
  }

  private async withdraw(command: WithdrawFromBookingCommand): Promise<WithdrawFromBookingResult> {
    const { goalkeeperId, bookingId } = command;
    let note: string | null;
    try {
      note = normalizeCancellationNote(command.reason);
    } catch {
      return { outcome: 'invalid_reason' };
    }
    if (!(await this.deps.walletContext.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };
    // A first look for the request (its goalkeeper count, for the replacement's event); the
    // transaction decides everything else again.
    const seen = await this.deps.bookingRepository.findById(bookingId);
    if (!seen || seen.goalkeeperId !== goalkeeperId) return { outcome: 'booking_not_found' };
    const [request] = await this.deps.requestRepository.findByIds([seen.requestId]);
    if (!request) return { outcome: 'booking_not_found' };

    const now = this.deps.clock.now();
    const config = await resolvePenaltyConfig(this.deps, goalkeeperId);
    const result = await this.deps.store.withdraw({
      bookingId,
      goalkeeperId,
      now,
      note,
      config,
      newId: () => this.deps.idGenerator.newId(),
      buildEvents: (withdrawn, incident, replacement, suspendedUntil) => this.events(request, withdrawn, incident, replacement, suspendedUntil, now),
    });

    switch (result.kind) {
      case 'withdrawn':
        await this.deps.relay.relay(result.events);
        return this.answer('withdrawn', result.booking, result.incident, result.suspendedUntil);
      case 'replayed':
        return this.answer('replayed', result.booking, result.incident, result.suspendedUntil);
      case 'not_found':
        return { outcome: 'booking_not_found' };
      case 'not_withdrawable':
        return { outcome: 'not_withdrawable', status: result.status };
      case 'match_started':
        return { outcome: 'match_started', startsAt: result.startsAt.toISOString() };
    }
  }

  /** "Goalkeeper withdrew", then "booking created" for the replacement so 015 offers it. */
  private events(
    request: GoalkeeperRequest,
    withdrawn: Booking,
    incident: GoalkeeperIncident,
    replacement: Booking | null,
    suspendedUntil: Date | null,
    now: Date,
  ): DomainEvent[] {
    const events: DomainEvent[] = [goalkeeperWithdrew(this.deps.idGenerator.newId(), withdrawn, incident, suspendedUntil, now)];
    if (replacement) events.push(bookingCreated(this.deps.idGenerator.newId(), replacement, request, now));
    return events;
  }

  private async answer(outcome: 'withdrawn' | 'replayed', booking: Booking, incident: GoalkeeperIncident, suspendedUntil: Date | null): Promise<WithdrawFromBookingResult> {
    const context = await loadBookingItemContext(this.deps, [booking]);
    // The goalkeeper no longer covers the match: the client's contact isn't shown any more.
    return { outcome, booking: toAgendaItem(booking, context, null), withdrawal: toWithdrawalSummary(incident, suspendedUntil) };
  }
}
