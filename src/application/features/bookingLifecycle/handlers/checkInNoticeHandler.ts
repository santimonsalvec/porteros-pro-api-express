import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import type { GoalkeeperCheckedInPayload } from '../../../../domain/events/bookingEvents.js';
import { goalkeeperArrivedMessage } from '../../../../domain/notifications/checkInMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import type { IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import { notifyOnce } from '../common/notifyOnce.js';
import type { ILifecycleLogger } from '../common/ports.js';

export const CHECK_IN_NOTICE_EVENT_TYPES = ['goalkeeper.checked_in'] as const;

export interface CheckInNoticeDependencies {
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

/** Tells the client their goalkeeper checked in at the pitch (feature 020), once per booking. */
export class CheckInNoticeHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'check-in-notices';

  constructor(private readonly deps: CheckInNoticeDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event, event.payload as GoalkeeperCheckedInPayload));
  }

  private async notify(event: DomainEvent, payload: GoalkeeperCheckedInPayload): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([event.requestId]);
    if (!request) return;
    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const match = { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone };
    const message = goalkeeperArrivedMessage(match, event.requestId, event.bookingId);
    const reached = await notifyOnce(this.deps, { userId: payload.clientId, message, dedupeKey: `goalkeeper-arrived:${event.bookingId}` });
    if (reached === null) return;
    this.deps.logger.info({ outcome: 'arrival_notice_sent', bookingId: event.bookingId, reached }, 'Client told their goalkeeper arrived');
  }
}
