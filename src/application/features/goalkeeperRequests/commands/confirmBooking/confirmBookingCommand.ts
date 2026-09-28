import { ICommand } from '../../../../common/mediator/types.js';
import {
  PARTIAL_FULFILLMENT_DEFAULT,
  type PartialFulfillment,
} from '../../../../../domain/bookings/goalkeeperRequest.js';
import type { RequestResponse } from '../../common/requestResponse.js';

export type ConfirmBookingResult =
  /** This call created the request and its bookings. */
  | { outcome: 'created'; request: RequestResponse }
  /** The request already existed (a retry or a double tap): the same request, nothing created. */
  | { outcome: 'replayed'; request: RequestResponse }
  /** Never existed, malformed id, removed after expiry, or another client's — indistinguishable. */
  | { outcome: 'quote_not_found' }
  /** Past its expiry but not yet removed by the database. */
  | { outcome: 'quote_expired' }
  /** The client already holds an active request for that zone and start (from another quote). */
  | { outcome: 'duplicate_request'; existingRequestId: string | null }
  /** A concurrent confirmation of this quote has not committed yet — safe to retry. */
  | { outcome: 'confirmation_in_progress' };

/**
 * Turns the caller's quote into a request with one booking per goalkeeper, at exactly the quoted
 * price. Idempotent per `quoteId`; `partialFulfillment` only applies when the request is created.
 */
export class ConfirmBookingCommand extends ICommand<ConfirmBookingResult> {
  constructor(
    public readonly clientId: string,
    public readonly quoteId: string,
    public readonly partialFulfillment: PartialFulfillment = PARTIAL_FULFILLMENT_DEFAULT,
  ) {
    super();
  }
}
