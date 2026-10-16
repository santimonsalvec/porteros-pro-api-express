import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import { leftTheRequest, type Booking } from '../../../../domain/bookings/booking.js';
import { completionRound } from '../../../../domain/bookings/contactVisibility.js';
import type { BookingCancelledPayload } from '../../../../domain/events/bookingEvents.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import {
  adminCancelledMessage,
  requestCancelledMessage,
  requestExpiredMessage,
  requestPartiallyExpiredMessage,
} from '../../../../domain/notifications/outcomeMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ILifecycleLogger } from '../common/ports.js';

export const CLIENT_OUTCOME_EVENT_TYPES = ['booking.expired', 'booking.cancelled'] as const;

export interface ClientOutcomeNoticeDependencies {
  requestRepository: IGoalkeeperRequestRepository;
  bookingRepository: IBookingRepository;
  zoneRepository: IZoneRepository;
  marketRepository: IMarketRepository;
  notifications: INotificationRepository;
  pushNotifier: IPushNotifier;
  processed: IProcessedEventStore;
  idGenerator: IIdGenerator;
  clock: IClock;
  logger: ILifecycleLogger;
}

/**
 * Tells the client how their request ended (feature 016): no goalkeeper found, only some, or
 * cancelled by "cancel all". One notice per request whatever the number of events — the inbox
 * key makes the second event (or a redelivery) a no-op, and only the writer pushes.
 */
export class ClientOutcomeNoticeHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'client-outcome-notices';

  constructor(private readonly deps: ClientOutcomeNoticeDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    if (event.type === 'booking.cancelled') {
      const by = (event.payload as BookingCancelledPayload).by;
      // The client is never told about a cancellation they made themselves (feature 017).
      if (by === 'client') return;
      // An administrator's cancellation has its own notice, right away (admin spec 006, FR-024).
      if (by === 'admin') {
        await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notifyAdminCancellation(event));
        return;
      }
    }
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event.requestId));
  }

  private async notify(requestId: string): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([requestId]);
    if (!request) return;
    const all = await this.deps.bookingRepository.findByRequestIds([requestId]);
    // Bookings the client (017) or an administrator (admin 006) cancelled are not part of the outcome, nor are
    // the ones a goalkeeper withdrew from: their replacement stands in their place (feature 018).
    const bookings = all.filter((booking) => !leftTheRequest(booking) && booking.status !== 'goalkeeper_withdrew');
    if (bookings.length === 0) return;
    // Not final while a booking is still searching: the notice waits for the outcome.
    if (bookings.some((booking) => booking.status === 'pending_assignment')) return;

    const [zones, markets] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.marketRepository.getByIds([request.match.marketId]),
    ]);
    const match = {
      zoneName: zones[0]?.name ?? null,
      marketName: markets[0]?.name ?? null,
      startsAt: request.match.startsAt,
      timeZone: request.match.timeZone,
    };
    const assigned = bookings.filter((booking) => booking.status === 'assigned').length;
    const message = bookings.some((booking) => booking.status === 'cancelled')
      ? requestCancelledMessage(match, requestId)
      : assigned === 0
        ? requestExpiredMessage(match, requestId)
        : requestPartiallyExpiredMessage(match, requestId, assigned, bookings.length);

    const created = await this.deps.notifications.createIfAbsent({
      id: this.deps.idGenerator.newId(),
      userId: request.clientId,
      type: message.data.type!,
      title: message.title,
      body: message.body,
      data: message.data,
      createdAt: this.deps.clock.now(),
      dedupeKey: outcomeKey(requestId, all),
    });
    if (!created) return;
    const result = await this.deps.pushNotifier.sendToUsers([request.clientId], message);
    this.deps.logger.info(
      { outcome: 'outcome_notice_sent', type: message.data.type, requestId, reached: result.totals.reached },
      'Client told how their request ended',
    );
  }

  /**
   * One notice per administrator cancellation, however many bookings it ended: they share the
   * instant, which keys the notice. Never the internal reason.
   */
  private async notifyAdminCancellation(event: DomainEvent): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([event.requestId]);
    if (!request) return;
    const all = await this.deps.bookingRepository.findByRequestIds([event.requestId]);
    const remaining = all.filter((booking) => booking.status === 'pending_assignment' || booking.status === 'assigned').length;
    const [zones, markets] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.marketRepository.getByIds([request.match.marketId]),
    ]);
    const message = adminCancelledMessage(
      { zoneName: zones[0]?.name ?? null, marketName: markets[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone },
      event.requestId,
      event.bookingId,
      { remaining },
    );
    const created = await this.deps.notifications.createIfAbsent({
      id: this.deps.idGenerator.newId(),
      userId: request.clientId,
      type: message.data.type!,
      title: message.title,
      body: message.body,
      data: message.data,
      createdAt: this.deps.clock.now(),
      dedupeKey: `admin-cancel:${event.requestId}:${new Date(event.occurredAt).getTime()}`,
    });
    if (!created) return;
    const result = await this.deps.pushNotifier.sendToUsers([request.clientId], message);
    this.deps.logger.info(
      { outcome: 'outcome_notice_sent', type: message.data.type, requestId: event.requestId, reached: result.totals.reached },
      'Client told an administrator cancelled',
    );
  }
}

/**
 * One outcome notice per request, and one more per round of replacements (feature 018): a
 * replacement that expires after an earlier outcome still gets its own final notice.
 */
function outcomeKey(requestId: string, bookings: readonly Booking[]): string {
  const round = completionRound(bookings);
  return round ? `request-outcome:${requestId}:${round}` : `request-outcome:${requestId}`;
}
