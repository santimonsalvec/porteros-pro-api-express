import type { IScheduledJob } from '../../events/common/ports.js';
import type { IBookingRepository } from '../../goalkeeperRequests/common/ports.js';
import type { OfferEligibilityService } from '../common/offerEligibilityService.js';
import type { OfferSender } from '../common/offerSender.js';
import type { IOffersLogger } from '../common/ports.js';

export interface OfferRemindersDependencies {
  bookingRepository: IBookingRepository;
  eligibility: OfferEligibilityService;
  sender: OfferSender;
  logger: IOffersLogger;
  /** At most this many open bookings per round (research §3). */
  roundCap: number;
}

/**
 * One reminder round, run by every sweep (feature 013). Eligibility is recomputed from scratch,
 * so goalkeepers who became eligible get their offer now, and those who can no longer take a
 * match are dropped. `OfferSender` keeps pushes ≥ the interval apart per goalkeeper and stops
 * each offer after its maximum reminders. There are no quiet hours (clarification 1).
 */
export class OfferRemindersJob implements IScheduledJob {
  readonly name = 'offer-reminders';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: OfferRemindersDependencies) {}

  async run(now: Date): Promise<string> {
    const open = await this.deps.bookingRepository.findOpenPending(now, this.deps.roundCap);
    if (open.length === this.deps.roundCap) {
      this.deps.logger.warn({ outcome: 'offer_round_cap_reached', cap: this.deps.roundCap }, 'Offer round read its maximum of open bookings');
    }
    if (open.length === 0) return '0 open bookings';

    const eligible = await this.deps.eligibility.eligibleGoalkeepersFor(open, now);
    const report = await this.deps.sender.send(eligible, now, 'round');
    this.deps.logger.info({ outcome: 'offer_round', openBookings: open.length, ...report }, 'Offer reminder round');
    return `${open.length} open bookings, ${report.pushed} goalkeepers pushed, ${report.entriesCreated} new offers`;
  }
}
