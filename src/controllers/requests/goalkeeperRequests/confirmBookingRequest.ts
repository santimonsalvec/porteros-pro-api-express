import { z } from 'zod';
import { PARTIAL_FULFILLMENT_OPTIONS } from '../../../domain/bookings/goalkeeperRequest.js';

/**
 * The quote id and, optionally, what to do if only some goalkeepers are confirmed. Price and match
 * details come from the stored quote, and any other key is stripped. The UUID format is
 * deliberately NOT checked here — a malformed id is answered `404 quote_not_found`, not `400`
 * (contracts/confirm-request.md).
 */
export const confirmBookingRequestSchema = z.object({
  quoteId: z.string({
    required_error: 'quoteId is required',
    invalid_type_error: 'quoteId must be a string',
  }),
  partialFulfillment: z
    .enum(PARTIAL_FULFILLMENT_OPTIONS, {
      errorMap: () => ({ message: `partialFulfillment must be ${PARTIAL_FULFILLMENT_OPTIONS.join(' or ')}` }),
    })
    .optional(),
});
