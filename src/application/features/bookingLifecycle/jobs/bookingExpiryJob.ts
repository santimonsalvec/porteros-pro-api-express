import { bookingExpired } from '../../../../domain/events/bookingEvents.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IEventRelay, IScheduledJob } from '../../events/common/ports.js';
import type { IBookingRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IBookingLifecycleStore, ILifecycleLogger } from '../common/ports.js';

export interface BookingExpiryDependencies {
  bookingRepository: IBookingRepository;
  store: IBookingLifecycleStore;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  logger: ILifecycleLogger;
  /** At most this many due bookings per run; the rest go to the next sweep. */
  cap?: number;
}

/**
 * Every pending booking whose search ended becomes expired, once (Story 1). One transaction per
 * request, so a request left with nothing pending or assigned stops being active in the same step.
 * Its events are published right away; the client's notice is their consumer.
 */
export class BookingExpiryJob implements IScheduledJob {
  readonly name = 'booking-expiry';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: BookingExpiryDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 500;
    const due = await this.deps.bookingRepository.findDueForExpiry(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'lifecycle_cap_reached', job: this.name, cap }, 'Expiry read its maximum of bookings');

    let requests = 0;
    let bookings = 0;
    let failed = 0;
    for (const requestId of new Set(due.map((booking) => booking.requestId))) {
      try {
        const result = await this.deps.store.expire(requestId, now, (expired) =>
          expired.map((booking) => bookingExpired(this.deps.idGenerator.newId(), booking, now)),
        );
        if (result.expired.length === 0) continue;
        requests += 1;
        bookings += result.expired.length;
        await this.deps.relay.relay(result.events);
      } catch (err) {
        failed += 1;
        this.deps.logger.warn({ outcome: 'lifecycle_item_failed', job: this.name, requestId, err }, 'Expiring a request failed; retried next sweep');
      }
    }
    if (bookings > 0 || failed > 0) {
      this.deps.logger.info({ outcome: 'bookings_expired', requests, bookings, failed }, 'Bookings expired');
    }
    return `${bookings} bookings expired in ${requests} requests, ${failed} failed`;
  }
}
