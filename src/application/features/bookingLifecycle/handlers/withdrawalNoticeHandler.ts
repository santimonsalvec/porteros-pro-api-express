import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import type { GoalkeeperWithdrewPayload } from '../../../../domain/events/bookingEvents.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import { goalkeeperSuspendedMessage, goalkeeperWithdrewMessage } from '../../../../domain/notifications/withdrawalMessages.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import type { IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ILifecycleLogger } from '../common/ports.js';

export const WITHDRAWAL_NOTICE_EVENT_TYPES = ['goalkeeper.withdrew'] as const;

export interface WithdrawalNoticeDependencies {
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
 * The notices of a withdrawal (feature 018): the client learns their goalkeeper withdrew and
 * whether another one is being searched (FR-005), and the goalkeeper learns until when they're
 * suspended, when the withdrawal suspended them (FR-014). One of each per booking, whatever the
 * deliveries: the inbox keys make a repeat a no-op, and only the writer pushes.
 */
export class WithdrawalNoticeHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'withdrawal-notices';

  constructor(private readonly deps: WithdrawalNoticeDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event, event.payload as GoalkeeperWithdrewPayload));
  }

  private async notify(event: DomainEvent, payload: GoalkeeperWithdrewPayload): Promise<void> {
    const [request] = await this.deps.requestRepository.findByIds([event.requestId]);
    if (!request) return;
    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const match = { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone };

    const toClient = goalkeeperWithdrewMessage(match, event.requestId, event.bookingId, payload.replacementBookingId !== null);
    await this.send(payload.clientId, toClient, `withdrawal-client:${event.bookingId}`, event.bookingId);
    if (payload.suspendedUntil) {
      const toGoalkeeper = goalkeeperSuspendedMessage(payload.suspendedUntil, request.match.timeZone, event.requestId, event.bookingId);
      await this.send(payload.goalkeeperId, toGoalkeeper, `withdrawal-suspension:${event.bookingId}`, event.bookingId);
    }
  }

  private async send(userId: string, message: PushMessage, dedupeKey: string, bookingId: string): Promise<void> {
    const created = await this.deps.notifications.createIfAbsent({
      id: this.deps.idGenerator.newId(),
      userId,
      type: message.data.type!,
      title: message.title,
      body: message.body,
      data: message.data,
      createdAt: this.deps.clock.now(),
      dedupeKey,
    });
    if (!created) return;
    const result = await this.deps.pushNotifier.sendToUsers([userId], message);
    this.deps.logger.info(
      { outcome: 'withdrawal_notice_sent', type: message.data.type, bookingId, reached: result.totals.reached },
      'Withdrawal notice sent',
    );
  }
}
