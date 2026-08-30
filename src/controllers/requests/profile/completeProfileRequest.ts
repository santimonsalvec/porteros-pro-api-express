import { z } from 'zod';

export const completeProfileRequestSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  countryCode: z.string().min(1),
  whatsAppNumber: z.string(),
  acceptedTerms: z.boolean(),
});

export type CompleteProfileRequest = z.infer<typeof completeProfileRequestSchema>;
