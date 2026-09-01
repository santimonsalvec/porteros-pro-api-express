import { z } from 'zod';

export const saveAvailabilitySectionRequestSchema = z.object({
  radiusKm: z.number().optional(),
});

export type SaveAvailabilitySectionRequest = z.infer<typeof saveAvailabilitySectionRequestSchema>;
