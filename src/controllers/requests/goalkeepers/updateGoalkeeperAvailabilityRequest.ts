import { z } from 'zod';

/** The zones of the goalkeeper's current market; `marketId`, when sent, must be that market (spec 031). */
export const updateGoalkeeperAvailabilityRequestSchema = z.object({
  marketId: z.string().trim().min(1).optional(),
  zoneIds: z.array(z.string().trim().min(1)).min(1),
});

/** `POST /goalkeepers/me/market-change` (spec 031, contract A7). */
export const changeGoalkeeperMarketRequestSchema = z
  .object({ marketId: z.string().trim().min(1), zoneIds: z.array(z.string().trim().min(1)).min(1) })
  .strict();

export type UpdateGoalkeeperAvailabilityRequest = z.infer<typeof updateGoalkeeperAvailabilityRequestSchema>;
