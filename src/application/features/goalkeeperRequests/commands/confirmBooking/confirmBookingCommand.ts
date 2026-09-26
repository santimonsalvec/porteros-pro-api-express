import { ICommand } from '../../../../common/mediator/types.js';
import type { BookingResponse } from '../../common/bookingResponse.js';

export type ConfirmBookingResult =
  /** This call created the booking. */
  | { outcome: 'created'; booking: BookingResponse }
  /** The booking already existed (a retry or a double tap): the same booking, nothing created. */
  | { outcome: 'replayed'; booking: BookingResponse }
  /** Never existed, malformed id, removed after expiry, or another client's — indistinguishable. */
  | { outcome: 'quote_not_found' }
  /** Past its expiry but not yet removed by the database. */
  | { outcome: 'quote_expired' }
  /** The client already holds a booking for that zone and start (from another quote). */
  | { outcome: 'duplicate_booking'; existingBookingId: string | null }
  /** A concurrent confirmation of this quote has not committed yet — safe to retry. */
  | { outcome: 'confirmation_in_progress' };

/** Turns the caller's quote into a booking at exactly the quoted price. Idempotent per `quoteId`. */
export class ConfirmBookingCommand extends ICommand<ConfirmBookingResult> {
  constructor(
    public readonly clientId: string,
    public readonly quoteId: string,
  ) {
    super();
  }
}
