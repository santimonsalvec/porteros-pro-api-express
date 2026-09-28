import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IBookingRepository } from '../../../goalkeeperRequests/common/ports.js';
import type { OfferEligibilityService } from '../../common/offerEligibilityService.js';
import type { OfferSender } from '../../common/offerSender.js';
import type { IOffersLogger } from '../../common/ports.js';
import { NotifyBookingOffersCommand, type NotifyBookingOffersResult } from './notifyBookingOffersCommand.js';

export interface NotifyBookingOffersDependencies {
  bookingRepository: IBookingRepository;
  eligibility: OfferEligibilityService;
  sender: OfferSender;
  clock: IClock;
  logger: IOffersLogger;
}

/**
 * Evaluated when the event is processed, not when the booking was created: a booking already
 * taken, cancelled or past its search is notified to nobody (FR-003). The first notification
 * always pushes — the reminder interval only spaces reminders.
 */
export class NotifyBookingOffersCommandHandler implements ICommandHandler<NotifyBookingOffersCommand, NotifyBookingOffersResult> {
  constructor(private readonly deps: NotifyBookingOffersDependencies) {}

  async handle(command: NotifyBookingOffersCommand): Promise<NotifyBookingOffersResult> {
    const now = this.deps.clock.now();
    const booking = await this.deps.bookingRepository.findById(command.bookingId);
    if (!booking) return { outcome: 'skipped', reason: 'not_found' };
    if (booking.status !== 'pending_assignment' || !booking.isSearchOpenAt(now)) return { outcome: 'skipped', reason: 'not_open' };

    const eligible = await this.deps.eligibility.eligibleGoalkeepersFor([booking], now);
    // A replacement reopens the request's existing offers (feature 018).
    const report = await this.deps.sender.send(eligible, now, booking.replacesBookingId ? 'renew' : 'first');
    this.deps.logger.info(
      { outcome: 'offers_notified', bookingId: booking.id, requestId: booking.requestId, eligible: eligible.size, ...report },
      'Offers sent for a new booking',
    );
    return { outcome: 'notified', eligible: eligible.size, report };
  }
}
