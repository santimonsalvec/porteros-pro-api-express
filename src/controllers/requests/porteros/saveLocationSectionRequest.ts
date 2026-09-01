import { z } from 'zod';

export const saveLocationSectionRequestSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  neighborhood: z.string().optional(),
  formattedAddress: z.string().optional(),
});

export type SaveLocationSectionRequest = z.infer<typeof saveLocationSectionRequestSchema>;
