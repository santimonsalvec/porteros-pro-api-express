import { z } from 'zod';

/** Either field may be sent alone (the app autosaves one field at a time), but not neither. */
export const updateGoalkeeperPhysicalDataRequestSchema = z
  .object({
    heightCm: z.number().optional(),
    weightKg: z.number().optional(),
  })
  .refine((body) => body.heightCm !== undefined || body.weightKg !== undefined);

export type UpdateGoalkeeperPhysicalDataRequest = z.infer<typeof updateGoalkeeperPhysicalDataRequestSchema>;
