import { validate as isUuid } from 'uuid';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { IBookingRepository } from '../../common/ports.js';
import { DismissBookingCommand, type DismissBookingResult } from './dismissBookingCommand.js';

/**
 * Records the dismissal on every booking of the request, so neither the other place of a
 * 2-goalkeeper request nor a later replacement is offered to the goalkeeper again. Dismissing a
 * booking that is no longer open still answers `dismissed`: the app only needs it gone.
 */
export class DismissBookingCommandHandler implements ICommandHandler<DismissBookingCommand, DismissBookingResult> {
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly bookingRepository: IBookingRepository,
  ) {}

  async handle(command: DismissBookingCommand): Promise<DismissBookingResult> {
    const { goalkeeperId, bookingId } = command;
    if (!(await this.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };
    if (!isUuid(bookingId)) return { outcome: 'booking_not_found' };

    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) return { outcome: 'booking_not_found' };

    const siblings = await this.bookingRepository.findByRequestIds([booking.requestId]);
    if (siblings.some((sibling) => sibling.status === 'assigned' && sibling.goalkeeperId === goalkeeperId)) {
      return { outcome: 'booking_held' };
    }
    if (!booking.dismissedGoalkeeperIds.includes(goalkeeperId)) {
      await this.bookingRepository.dismissRequestFor(booking.requestId, goalkeeperId);
    }
    return { outcome: 'dismissed' };
  }
}
