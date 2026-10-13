import { ICommand } from '../../../../common/mediator/types.js';

export type CancelBookingsByAdminResult =
  /** The bookings cancelled now, and how many goalkeepers got their commission back. */
  | { outcome: 'cancelled'; cancelled: string[]; refunds: number }
  /** Already cancelled by an administrator (idempotent): nothing changed. */
  | { outcome: 'replayed' }
  | { outcome: 'request_not_found' }
  | { outcome: 'booking_not_found' }
  /** Ended otherwise: expired, cancelled by the system or the client, completed or withdrawn. */
  | { outcome: 'not_cancellable'; status: string }
  /** A goalkeeper's refund can't be recorded right now; nothing changed. */
  | { outcome: 'temporarily_unavailable' }
  | { outcome: 'invalid_reason' };

/**
 * An administrator cancels one booking (`bookingId`) or every live booking of a request (`null`)
 * — admin spec 006, FR-021–FR-024. `reason` is internal: 3–300 characters.
 */
export class CancelBookingsByAdminCommand extends ICommand<CancelBookingsByAdminResult> {
  constructor(
    readonly staffUserId: string,
    readonly requestId: string,
    readonly bookingId: string | null,
    readonly reason: string,
  ) {
    super();
  }
}
