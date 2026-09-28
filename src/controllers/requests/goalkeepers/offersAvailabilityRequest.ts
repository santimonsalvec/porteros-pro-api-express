import { z } from 'zod';

/** Turns the goalkeeper's offers on or off (contracts/notifications-and-offers.md). */
export const offersAvailabilityRequestSchema = z.object({
  available: z.boolean({ required_error: 'available is required', invalid_type_error: 'available must be true or false' }),
});

export type OffersAvailabilityRequest = z.infer<typeof offersAvailabilityRequestSchema>;
