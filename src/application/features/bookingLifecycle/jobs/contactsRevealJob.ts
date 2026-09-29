import type { IClock } from '../../../common/clock.js';
import { contactsVisibleFrom } from '../../../../domain/bookings/contactVisibility.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { clientContactVisibleMessage, contactsVisibleMessage } from '../../../../domain/notifications/assignmentMessages.js';
import type { IIdGenerator, IUserRepository } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IScheduledJob } from '../../events/common/ports.js';
import { loadContacts } from '../../goalkeeperRequests/common/contacts.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import { notifyOnce } from '../common/notifyOnce.js';
import type { ILifecycleLogger } from '../common/ports.js';

export interface ContactsRevealDependencies {
  requestRepository: IGoalkeeperRequestRepository;
  bookingRepository: IBookingRepository;
  userRepository: IUserRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  notifications: INotificationRepository;
  pushNotifier: IPushNotifier;
  idGenerator: IIdGenerator;
  clock: IClock;
  logger: ILifecycleLogger;
  /** At most this many requests per run; the rest go to the next sweep. */
  cap?: number;
}

/**
 * One hour before the match (feature 019, Story 4): tells the client who their goalkeepers are
 * and each goalkeeper who the client is. Only bookings taken before that moment: later ones are
 * named in the assignment notice itself. The notices are idempotent and written before the
 * request is marked, so a crash in between only repeats a no-op.
 */
export class ContactsRevealJob implements IScheduledJob {
  readonly name = 'contacts-reveal';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: ContactsRevealDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 500;
    const due = await this.deps.requestRepository.findDueForContactsReveal(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'lifecycle_cap_reached', job: this.name, cap }, 'Contacts reveal read its maximum of requests');

    const counts = { revealed: 0, empty: 0, notices: 0, failed: 0 };
    for (const request of due) {
      try {
        const sent = await this.reveal(request);
        if (sent === null) counts.empty += 1;
        else counts.revealed += 1;
        counts.notices += sent ?? 0;
        await this.deps.requestRepository.markContactsRevealed(request.id, now);
      } catch (err) {
        counts.failed += 1;
        this.deps.logger.warn({ outcome: 'lifecycle_item_failed', job: this.name, requestId: request.id, err }, 'Contacts reveal failed; retried next sweep');
      }
    }
    if (due.length > 0) this.deps.logger.info({ outcome: 'contacts_revealed', ...counts }, 'Contacts revealed one hour before the match');
    return `${counts.revealed} revealed, ${counts.empty} without goalkeepers, ${counts.notices} notices, ${counts.failed} failed`;
  }

  /** The notices of one request: how many were written now, or null when nobody held a booking. */
  private async reveal(request: GoalkeeperRequest): Promise<number | null> {
    const visibleFrom = contactsVisibleFrom(request).getTime();
    const held = (await this.deps.bookingRepository.findByRequestIds([request.id])).filter(
      (booking) => booking.status === 'assigned' && booking.assignedAt !== null && booking.assignedAt.getTime() < visibleFrom,
    );
    if (held.length === 0) return null;

    const [contacts, zones, cities] = await Promise.all([
      loadContacts(this.deps.userRepository, [request.clientId, ...held.map((booking) => booking.goalkeeperId!)]),
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    const match = { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone };
    const none = { firstName: null, lastName: null, whatsApp: null };

    let written = 0;
    const toClient = contactsVisibleMessage(match, request.id, held.map((booking) => contacts.get(booking.goalkeeperId!) ?? none));
    if ((await notifyOnce(this.deps, { userId: request.clientId, message: toClient, dedupeKey: `contacts-visible:${request.id}` })) !== null) written += 1;
    const client = contacts.get(request.clientId) ?? none;
    for (const booking of held) {
      const message = clientContactVisibleMessage(match, request.id, booking.id, client);
      if ((await notifyOnce(this.deps, { userId: booking.goalkeeperId!, message, dedupeKey: `client-contact-visible:${booking.id}` })) !== null) written += 1;
    }
    return written;
  }
}
