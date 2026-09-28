import { ICommand } from '../../../../common/mediator/types.js';
import type { RequestResponse } from '../../../goalkeeperRequests/common/requestResponse.js';

export type CancelBookingsByClientResult =
  /** Cancelled now, or already cancelled by the client (idempotent): the request as it is now. */
  | { outcome: 'cancelled' | 'replayed'; request: RequestResponse }
  | { outcome: 'request_not_found' }
  | { outcome: 'booking_not_found' }
  /** Ended otherwise: expired, cancelled by the system, completed or withdrawn. */
  | { outcome: 'not_cancellable'; status: string }
  /** An assigned booking is past start − free-cancellation period: use the goalkeeper or pay them. */
  | { outcome: 'window_closed'; bookingId: string; freeCancellationUntil: string }
  /** The goalkeeper's refund can't be recorded right now; nothing changed. */
  | { outcome: 'temporarily_unavailable' }
  | { outcome: 'invalid_reason' };

/** The client cancels one booking (`bookingId`) or their whole request (`null`) — feature 017. */
export class CancelBookingsByClientCommand extends ICommand<CancelBookingsByClientResult> {
  constructor(
    readonly clientId: string,
    readonly requestId: string,
    readonly bookingId: string | null,
    readonly reason?: string,
  ) {
    super();
  }
}
