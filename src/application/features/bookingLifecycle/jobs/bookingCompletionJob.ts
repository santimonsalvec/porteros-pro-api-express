import { bookingCompleted } from '../../../../domain/events/bookingEvents.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IEventRelay, IScheduledJob } from '../../events/common/ports.js';
import type { IBookingRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IBookingLifecycleStore, ILifecycleLogger } from '../common/ports.js';

export interface BookingCompletionDependencies {
  bookingRepository: IBookingRepository;
  store: IBookingLifecycleStore;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  logger: ILifecycleLogger;
  cap?: number;
}

/**
 * Closes matches (feature 021, Story 1): at start + duration every assigned booking becomes
 * completed, once per booking — the store's update is conditional on `assigned`, so a second run
 * finds nothing. Completion opens the rating and the no-show check.
 */
export class BookingCompletionJob implements IScheduledJob {
  readonly name = 'booking-completion';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: BookingCompletionDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 500;
    const due = await this.deps.bookingRepository.findDueForCompletion(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'lifecycle_cap_reached', job: this.name, cap }, 'Completion read its maximum of bookings');

    let completed = 0;
    let requests = 0;
    let failed = 0;
    for (const requestId of new Set(due.map((booking) => booking.requestId))) {
      try {
        const result = await this.deps.store.complete(requestId, now, (bookings) =>
          bookings.map((booking) => bookingCompleted(this.deps.idGenerator.newId(), booking, now)),
        );
        if (result.completed.length > 0) {
          completed += result.completed.length;
          requests += 1;
          await this.deps.relay.relay(result.events);
        }
      } catch (err) {
        failed += 1;
        this.deps.logger.warn({ outcome: 'lifecycle_item_failed', job: this.name, requestId, err }, 'Completion failed; retried next sweep');
      }
    }
    if (completed + failed > 0) this.deps.logger.info({ outcome: 'bookings_completed', completed, requests, failed }, 'Matches closed');
    return `${completed} bookings completed in ${requests} requests, ${failed} failed`;
  }
}
