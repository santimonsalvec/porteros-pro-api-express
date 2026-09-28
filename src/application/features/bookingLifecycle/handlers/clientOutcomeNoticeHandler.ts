import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import {
  requestCancelledMessage,
  requestExpiredMessage,
  requestPartiallyExpiredMessage,
} from '../../../../domain/notifications/outcomeMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ILifecycleLogger } from '../common/ports.js';

export const CLIENT_OUTCOME_EVENT_TYPES = ['booking.expired', 'booking.cancelled'] as const;

export interface ClientOutcomeNoticeDependencies {
  requestRepository: IGoalkeeperRequestRepository;
  bookingRepository: IBookingRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
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
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event.requestId));
  }

  private async notify(requestId: string): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([requestId]);
    if (!request) return;
    const bookings = await this.deps.bookingRepository.findByRequestIds([requestId]);
    // Not final while a booking is still searching: the notice waits for the outcome.
    if (bookings.some((booking) => booking.status === 'pending_assignment')) return;

    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const match = {
      zoneName: zones[0]?.name ?? null,
      cityName: cities[0]?.name ?? null,
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
      dedupeKey: `request-outcome:${requestId}`,
    });
    if (!created) return;
    const result = await this.deps.pushNotifier.sendToUsers([request.clientId], message);
    this.deps.logger.info(
      { outcome: 'outcome_notice_sent', type: message.data.type, requestId, reached: result.totals.reached },
      'Client told how their request ended',
    );
  }
}
