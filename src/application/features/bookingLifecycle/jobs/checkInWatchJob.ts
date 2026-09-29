import type { IClock } from '../../../common/clock.js';
import type { Booking } from '../../../../domain/bookings/booking.js';
import { checkInWindow, isCheckInOpen } from '../../../../domain/bookings/checkInWindow.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import type { PushMessage } from '../../../../domain/devices/deviceRules.js';
import { checkInLastCallMessage, checkInMissedMessage, checkInOpenMessage } from '../../../../domain/notifications/checkInMessages.js';
import type { OutcomeMatch } from '../../../../domain/notifications/outcomeMessages.js';
import type { IIdGenerator, IUserRepository } from '../../auth/common/ports.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IScheduledJob } from '../../events/common/ports.js';
import { loadContacts } from '../../goalkeeperRequests/common/contacts.js';
import type { CheckInNoticeField, IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { INotificationRepository } from '../../notifications/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { CheckInWindowResolver } from '../common/checkInWindowResolver.js';
import { notifyOnce } from '../common/notifyOnce.js';
import type { ILifecycleLogger } from '../common/ports.js';

export interface CheckInWatchDependencies {
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  userRepository: IUserRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  notifications: INotificationRepository;
  pushNotifier: IPushNotifier;
  idGenerator: IIdGenerator;
  clock: IClock;
  logger: ILifecycleLogger;
  /** A fresh resolver per run (it caches per city). */
  windowResolver: () => CheckInWindowResolver;
  cap?: number;
}

/**
 * The check-in timeline of each assigned booking (feature 020), every minute:
 * - the window opens → the goalkeeper is reminded (clarification 2);
 * - 10 minutes before it closes, still no check-in → reminded again;
 * - it closed without a check-in → the client is told, with the goalkeeper's WhatsApp, and the
 *   booking is marked `checkInMissedAt` — the fact 021 reads.
 * Each notice is idempotent and written before its mark, so a crash only repeats a no-op.
 */
export class CheckInWatchJob implements IScheduledJob {
  readonly name = 'check-in-watch';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: CheckInWatchDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 500;
    const bookings = await this.deps.bookingRepository.findForCheckInWatch(now, cap);
    if (bookings.length === cap) this.deps.logger.warn({ outcome: 'lifecycle_cap_reached', job: this.name, cap }, 'Check-in watch read its maximum of bookings');

    const resolve = this.deps.windowResolver();
    const requests = new Map((await this.deps.requestRepository.findByIds([...new Set(bookings.map((b) => b.requestId))])).map((r) => [r.id, r]));
    const counts = { opened: 0, lastCalls: 0, missed: 0, failed: 0 };
    for (const booking of bookings) {
      const request = requests.get(booking.requestId);
      if (!request) continue;
      try {
        const window = checkInWindow(request.startsAt, await resolve(request));
        const t = now.getTime();
        if (isCheckInOpen(window, now) && !booking.checkInOpenNoticeAt) {
          if (await this.send(booking, request, 'checkInOpenNoticeAt', now, (match) => ({ userId: booking.goalkeeperId!, message: checkInOpenMessage(match, request.id, booking.id), key: `check-in-open:${booking.id}` }))) counts.opened += 1;
        }
        if (t >= window.lastCallAt.getTime() && t <= window.closesAt.getTime() && !booking.checkIn && !booking.checkInLastCallAt) {
          if (await this.send(booking, request, 'checkInLastCallAt', now, (match) => ({ userId: booking.goalkeeperId!, message: checkInLastCallMessage(match, request.id, booking.id), key: `check-in-last-call:${booking.id}` }))) counts.lastCalls += 1;
        }
        if (t > window.closesAt.getTime() && t < booking.endsAt.getTime() && !booking.checkIn && !booking.checkInMissedAt) {
          const contact = (await loadContacts(this.deps.userRepository, [booking.goalkeeperId!])).get(booking.goalkeeperId!) ?? null;
          if (await this.send(booking, request, 'checkInMissedAt', now, (match) => ({ userId: request.clientId, message: checkInMissedMessage(match, request.id, booking.id, contact), key: `check-in-missed:${booking.id}` }))) counts.missed += 1;
        }
      } catch (err) {
        counts.failed += 1;
        this.deps.logger.warn({ outcome: 'lifecycle_item_failed', job: this.name, bookingId: booking.id, err }, 'Check-in watch failed; retried next sweep');
      }
    }
    if (counts.opened + counts.lastCalls + counts.missed + counts.failed > 0) {
      this.deps.logger.info({ outcome: 'check_in_watch', ...counts }, 'Check-in notices sent');
    }
    return `${counts.opened} opened, ${counts.lastCalls} last calls, ${counts.missed} missed, ${counts.failed} failed`;
  }

  /** The notice, then its mark; true when this run wrote the notice. */
  private async send(
    booking: Booking,
    request: GoalkeeperRequest,
    field: CheckInNoticeField,
    now: Date,
    build: (match: OutcomeMatch) => { userId: string; message: PushMessage; key: string },
  ): Promise<boolean> {
    const { userId, message, key } = build(await this.matchOf(request));
    const reached = await notifyOnce(this.deps, { userId, message, dedupeKey: key });
    await this.deps.bookingRepository.markCheckInNotice(booking.id, field, now);
    return reached !== null;
  }

  private async matchOf(request: GoalkeeperRequest): Promise<OutcomeMatch> {
    const [zones, cities] = await Promise.all([
      this.deps.zoneRepository.getManyByIds([request.match.zoneId]),
      this.deps.cityRepository.getByIds([request.match.cityId]),
    ]);
    return { zoneName: zones[0]?.name ?? null, cityName: cities[0]?.name ?? null, startsAt: request.match.startsAt, timeZone: request.match.timeZone };
  }
}
