import { ICommand } from '../../../../common/mediator/types.js';
import type { RatingResponse } from '../../common/ratingResponses.js';

export type RateBookingResult =
  | { outcome: 'rated'; rating: RatingResponse }
  | { outcome: 'booking_not_found' }
  | { outcome: 'already_rated' }
  | { outcome: 'invalid_rating'; message: string }
  | { outcome: 'not_rateable'; reason: 'not_finished' | 'expired' | 'no_goalkeeper' };

/** The client or the goalkeeper of a booking rates the other side (feature 021). */
export class RateBookingCommand extends ICommand<RateBookingResult> {
  constructor(
    readonly userId: string,
    readonly bookingId: string,
    readonly answer: boolean,
    readonly stars: number,
    readonly comment?: string,
  ) {
    super();
  }
}
