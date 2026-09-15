import { z } from 'zod';

/**
 * Unlike the other three sections, both fields are required together — there is no
 * partial/independent save of just a city or just zones (research.md §7).
 */
export const saveAvailabilitySectionRequestSchema = z.object({
  cityId: z.string().trim().min(1),
  zoneIds: z.array(z.string().trim().min(1)).min(1),
});

export type SaveAvailabilitySectionRequest = z.infer<typeof saveAvailabilitySectionRequestSchema>;
