import { z } from 'zod';

export const savePhysicalDataSectionRequestSchema = z.object({
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
});

export type SavePhysicalDataSectionRequest = z.infer<typeof savePhysicalDataSectionRequestSchema>;
