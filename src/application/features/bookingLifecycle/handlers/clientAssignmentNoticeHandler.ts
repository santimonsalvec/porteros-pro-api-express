import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import { completionRound, contactsVisibleFrom, isRequestComplete } from '../../../../domain/bookings/contactVisibility.js';
import type { GoalkeeperAssignedPayload } from '../../../../domain/events/bookingEvents.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import { goalkeeperAssignedMessage, requestCompleteMessage } from '../../../../domain/notifications/assignmentMessages.js';
import type { IIdGenerator, IUserRepository } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import { loadContacts } from '../../goalkeeperRequests/common/contacts.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import { notifyOnce } from '../common/notifyOnce.js';
import type { ILifecycleLogger } from '../common/ports.js';

export const CLIENT_ASSIGNMENT_EVENT_TYPES = ['goalkeeper.assigned'] as const;

export interface ClientAssignmentNoticeDependencies {
  requestRepository: IGoalkeeperRequestRepository;
  bookingRepository: IBookingRepository;
  userRepository: IUserRepository;
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
 * Tells the client a goalkeeper took one of their bookings (feature 019): "complete" when that
 * leaves nothing searching — instead of "assigned", so one push per acceptance (clarification 2) —
 * else "assigned". The goalkeepers' names and WhatsApp only go in for bookings taken in the last
 * hour, where they're already visible; earlier ones are revealed by the contacts-reveal job.
 */
export class ClientAssignmentNoticeHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'client-assignment-notices';

  constructor(private readonly deps: ClientAssignmentNoticeDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event, event.payload as GoalkeeperAssignedPayload));
  }

  private async notify(event: DomainEvent, payload: GoalkeeperAssignedPayload): Promise<void> {
    const now = this.deps.clock.now();
    const [[request], bookings] = await Promise.all([
      this.deps.requestRepository.findByIds([event.requestId]),
      this.deps.bookingRepository.findByRequestIds([event.requestId]),
    ]);
    const booking = bookings.find((item) => item.id === event.bookingId);
    // Stale: cancelled or withdrawn since, or the match is over (FR-008).
    if (!request || !booking || booking.status !== 'assigned' || booking.goalkeeperId !== payload.goalkeeperId) return;
    if (now.getTime() >= booking.endsAt.getTime()) return;

    const visibleFrom = contactsVisibleFrom(request).getTime();
    const takenLate = (item: typeof booking) => item.status === 'assigned' && item.assignedAt !== null && item.assignedAt.getTime() >= visibleFrom;
    const complete = isRequestComplete(bookings);
    const revealed = complete ? bookings.filter(takenLate) : takenLate(booking) ? [booking] : [];
    const contacts = await loadContacts(this.deps.userRepository, revealed.map((item) => item.goalkeeperId!));
    const revealedContacts = revealed.flatMap((item) => contacts.get(item.goalkeeperId!) ?? []);

    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const match = { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone };

    let message;
    let dedupeKey: string;
    if (complete) {
      const round = completionRound(bookings);
      // The goalkeepers the client ends up with (one may have been cancelled by the client, 017).
      const assignedCount = bookings.filter((item) => item.status === 'assigned').length;
      message = requestCompleteMessage(match, request.id, booking.id, assignedCount, revealedContacts.length > 0 ? revealedContacts : null);
      dedupeKey = round ? `request-complete:${request.id}:${round}` : `request-complete:${request.id}`;
    } else {
      message = goalkeeperAssignedMessage(match, request.id, booking.id, {
        replacement: booking.replacesBookingId !== null,
        contact: revealedContacts[0] ?? null,
      });
      dedupeKey = `goalkeeper-assigned:${booking.id}`;
    }

    const reached = await notifyOnce(this.deps, { userId: request.clientId, message, dedupeKey });
    if (reached === null) return;
    this.deps.logger.info(
      { outcome: 'assignment_notice_sent', type: message.data.type, requestId: request.id, bookingId: booking.id, reached },
      'Client told a goalkeeper took their match',
    );
  }
}
