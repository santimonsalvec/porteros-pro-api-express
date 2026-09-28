import { ICommand } from '../../../../common/mediator/types.js';
import type { AgendaItem } from '../../../goalkeeperRequests/common/goalkeeperBookingResponse.js';
import type { WithdrawalSummary } from '../../common/withdrawalResponses.js';

export type WithdrawFromBookingResult =
  /** Withdrawn now, or already withdrawn (idempotent): the booking and the withdrawal. */
  | { outcome: 'withdrawn' | 'replayed'; booking: AgendaItem; withdrawal: WithdrawalSummary }
  | { outcome: 'not_a_goalkeeper' }
  /** No such booking, or the goalkeeper never held it. */
  | { outcome: 'booking_not_found' }
  /** Not assigned to them any more: cancelled, expired, pending… */
  | { outcome: 'not_withdrawable'; status: string }
  | { outcome: 'match_started'; startsAt: string }
  | { outcome: 'invalid_reason' };

/** A goalkeeper withdraws from a booking they took (feature 018). */
export class WithdrawFromBookingCommand extends ICommand<WithdrawFromBookingResult> {
  constructor(
    readonly goalkeeperId: string,
    readonly bookingId: string,
    readonly reason?: string,
  ) {
    super();
  }
}
