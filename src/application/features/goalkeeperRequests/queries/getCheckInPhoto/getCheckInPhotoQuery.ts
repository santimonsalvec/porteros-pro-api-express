import { IQuery } from '../../../../common/mediator/types.js';

export type GetCheckInPhotoResult =
  | { outcome: 'ok'; photo: { photoUrl: string; at: string } }
  | { outcome: 'request_not_found' }
  | { outcome: 'booking_not_found' }
  | { outcome: 'check_in_not_found' };

/** A booking's check-in photo: the one sensitive read of operations (FR-006), audited by its route. */
export class GetCheckInPhotoQuery extends IQuery<GetCheckInPhotoResult> {
  constructor(
    readonly bookingId: string,
    /** When asked from a request: the booking must be one of its own. */
    readonly requestId?: string,
  ) {
    super();
  }
}
