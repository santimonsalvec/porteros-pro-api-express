import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { GoalkeeperNoShowPayload } from '../../../../domain/events/bookingEvents.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import { noShowMessage } from '../../../../domain/notifications/noShowMessages.js';
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

export const NO_SHOW_NOTICE_EVENT_TYPES = ['goalkeeper.no_show'] as const;

export interface NoShowNoticeDependencies {
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

/** Tells the goalkeeper a no-show was recorded, and until when they're suspended (feature 021). */
export class NoShowNoticeHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'no-show-notices';

  constructor(private readonly deps: NoShowNoticeDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event, event.payload as GoalkeeperNoShowPayload));
  }

  private async notify(event: DomainEvent, payload: GoalkeeperNoShowPayload): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([event.requestId]);
    if (!request) return;
    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const match = { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone };
    const message = noShowMessage(match, event.requestId, event.bookingId, payload.suspendedUntil);
    const reached = await notifyOnce(this.deps, { userId: payload.goalkeeperId, message, dedupeKey: `no-show:${event.bookingId}` });
    if (reached === null) return;
    this.deps.logger.info({ outcome: 'no_show_notice_sent', bookingId: event.bookingId, reached }, 'Goalkeeper told about the no-show');
  }
}
