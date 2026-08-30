import { z } from 'zod';

export const updateClientProfileRequestSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  countryCode: z.string().min(1),
  whatsAppNumber: z.string(),
});

export type UpdateClientProfileRequest = z.infer<typeof updateClientProfileRequestSchema>;
