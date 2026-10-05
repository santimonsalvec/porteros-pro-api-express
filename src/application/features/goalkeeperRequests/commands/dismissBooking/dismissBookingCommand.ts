import { ICommand } from '../../../../common/mediator/types.js';

export type DismissBookingResult =
  /** Recorded now or before, or the booking is no longer open: either way it won't be offered again. */
  | { outcome: 'dismissed' }
  | { outcome: 'booking_not_found' }
  /** The goalkeeper holds a booking of this request: they must withdraw instead. */
  | { outcome: 'booking_held' }
  | { outcome: 'not_a_goalkeeper' };

/** "No me interesa": the booking's whole request is never offered to this goalkeeper again (feature 024). */
export class DismissBookingCommand extends ICommand<DismissBookingResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly bookingId: string,
  ) {
    super();
  }
}
