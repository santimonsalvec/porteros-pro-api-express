import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { BookingCancelledPayload } from '../../../../domain/events/bookingEvents.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import { bookingCancelledMessage } from '../../../../domain/notifications/outcomeMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import type { IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ILifecycleLogger } from '../common/ports.js';

export const GOALKEEPER_CANCELLATION_EVENT_TYPES = ['booking.cancelled'] as const;

export interface GoalkeeperCancellationNoticeDependencies {
  requestRepository: IGoalkeeperRequestRepository;
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
 * Tells a goalkeeper that a match they had taken was cancelled and how much came back
 * (feature 016). One notice per booking, whatever the deliveries.
 */
export class GoalkeeperCancellationNoticeHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'goalkeeper-cancellation-notices';

  constructor(private readonly deps: GoalkeeperCancellationNoticeDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as BookingCancelledPayload;
    if (!payload.goalkeeperId) return;
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event, payload));
  }

  private async notify(event: DomainEvent, payload: BookingCancelledPayload): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([event.requestId]);
    if (!request) return;
    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const message = bookingCancelledMessage(
      { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone },
      event.requestId,
      event.bookingId,
      payload.refundedAmount === null ? null : { amount: payload.refundedAmount, currency: payload.currency },
      payload.by,
    );
    const created = await this.deps.notifications.createIfAbsent({
      id: this.deps.idGenerator.newId(),
      userId: payload.goalkeeperId!,
      type: message.data.type!,
      title: message.title,
      body: message.body,
      data: message.data,
      createdAt: this.deps.clock.now(),
      dedupeKey: `booking-cancelled:${event.bookingId}`,
    });
    if (!created) return;
    const result = await this.deps.pushNotifier.sendToUsers([payload.goalkeeperId!], message);
    this.deps.logger.info(
      { outcome: 'outcome_notice_sent', type: message.data.type, bookingId: event.bookingId, reached: result.totals.reached },
      'Goalkeeper told their match was cancelled',
    );
  }
}
