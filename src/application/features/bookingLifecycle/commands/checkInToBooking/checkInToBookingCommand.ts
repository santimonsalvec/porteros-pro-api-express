import { ICommand } from '../../../../common/mediator/types.js';
import type { AgendaItem } from '../../../goalkeeperRequests/common/goalkeeperBookingResponse.js';

export interface CheckInLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export type CheckInToBookingResult =
  /** Checked in now, or already (idempotent): the booking as the agenda shows it. */
  | { outcome: 'checked_in' | 'replayed'; booking: AgendaItem }
  | { outcome: 'not_a_goalkeeper' }
  /** No such booking, or never the goalkeeper's. */
  | { outcome: 'booking_not_found' }
  /** The image doesn't exist or wasn't uploaded by the goalkeeper. */
  | { outcome: 'invalid_photo' }
  | { outcome: 'not_assigned'; status: string }
  | { outcome: 'too_early'; opensAt: string }
  | { outcome: 'too_late'; closedAt: string };

/** The goalkeeper confirms arrival at the pitch with a photo and, optionally, the phone's location (feature 020). */
export class CheckInToBookingCommand extends ICommand<CheckInToBookingResult> {
  constructor(
    readonly goalkeeperId: string,
    readonly bookingId: string,
    readonly imageId: string,
    readonly location?: CheckInLocation,
  ) {
    super();
  }
}
