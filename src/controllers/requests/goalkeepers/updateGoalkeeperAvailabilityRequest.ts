import { z } from 'zod';

/** Same shape as the draft registration's availability body — city and zones always travel together. */
export const updateGoalkeeperAvailabilityRequestSchema = z.object({
  cityId: z.string().trim().min(1),
  zoneIds: z.array(z.string().trim().min(1)).min(1),
});

export type UpdateGoalkeeperAvailabilityRequest = z.infer<typeof updateGoalkeeperAvailabilityRequestSchema>;
