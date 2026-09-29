import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { goalkeeperNoShow } from '../../../../../domain/events/bookingEvents.js';
import { normalizeRatingComment } from '../../../../../domain/ratings/rating.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { resolvePenaltyConfig, type PenaltyConfigDependencies } from '../../../bookingLifecycle/common/penaltyConfig.js';
import type { IBookingLifecycleStore } from '../../../bookingLifecycle/common/ports.js';
import type { IEventRelay } from '../../../events/common/ports.js';
import type { IBookingAuditLogger, IBookingRepository } from '../../../goalkeeperRequests/common/ports.js';
import { toRatingResponse } from '../../common/ratingResponses.js';
import { RateBookingCommand, type RateBookingResult } from './rateBookingCommand.js';

export interface RateBookingDependencies extends PenaltyConfigDependencies {
  bookingRepository: IBookingRepository;
  store: IBookingLifecycleStore;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IBookingAuditLogger;
}

/**
 * A rating and its consequences in one transaction (the store, research §3): the client's answer
 * settles attendance — a "no" without a check-in is a no-show right away (clarification 1) — and
 * "no" answers or a late "yes" open a case. Ratings are private (clarification 2).
 */
export class RateBookingCommandHandler implements ICommandHandler<RateBookingCommand, RateBookingResult> {
  constructor(private readonly deps: RateBookingDependencies) {}

  async handle(command: RateBookingCommand): Promise<RateBookingResult> {
    const result = await this.rate(command);
    this.deps.audit.logRating({
      outcome: result.outcome,
      userId: command.userId,
      bookingId: command.bookingId,
      ...(result.outcome === 'rated' ? { side: result.rating.side } : {}),
    });
    return result;
  }

  private async rate(command: RateBookingCommand): Promise<RateBookingResult> {
    let comment: string | null;
    try {
      comment = normalizeRatingComment(command.comment);
      if (!Number.isInteger(command.stars) || command.stars < 1 || command.stars > 5) throw new Error('stars must be an integer from 1 to 5');
    } catch (error) {
      return { outcome: 'invalid_rating', message: (error as Error).message };
    }
    const booking = await this.deps.bookingRepository.findById(command.bookingId);
    if (!booking) return { outcome: 'booking_not_found' };
    const now = this.deps.clock.now();
    // Only needed when a "no" records a no-show, but resolving it up front keeps the store synchronous.
    const noShowConfig = booking.goalkeeperId ? await resolvePenaltyConfig(this.deps, booking.goalkeeperId) : null;
    const result = await this.deps.store.rate({
      bookingId: command.bookingId,
      userId: command.userId,
      now,
      answer: command.answer,
      stars: command.stars,
      comment,
      newId: () => this.deps.idGenerator.newId(),
      noShowConfig: noShowConfig!,
      buildEvents: (noShow) => [goalkeeperNoShow(this.deps.idGenerator.newId(), noShow.booking, noShow.incident, noShow.suspendedUntil, now)],
    });
    switch (result.kind) {
      case 'rated':
        if (result.events.length > 0) await this.deps.relay.relay(result.events);
        return { outcome: 'rated', rating: toRatingResponse(result.rating) };
      case 'not_found':
        return { outcome: 'booking_not_found' };
      case 'already_rated':
        return { outcome: 'already_rated' };
      case 'not_rateable':
        return { outcome: 'not_rateable', reason: result.reason };
    }
  }
}
