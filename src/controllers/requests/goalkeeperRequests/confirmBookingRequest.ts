import { z } from 'zod';

/**
 * Only the quote id: price and match details come from the stored quote, and any other key is
 * stripped (FR-007). The UUID format is deliberately NOT checked here — a malformed id is
 * answered `404 quote_not_found`, not `400` (contracts/create-booking.md).
 */
export const confirmBookingRequestSchema = z.object({
  quoteId: z.string({
    required_error: 'quoteId is required',
    invalid_type_error: 'quoteId must be a string',
  }),
});
