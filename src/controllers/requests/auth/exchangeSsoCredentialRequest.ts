import { z } from 'zod';

export const exchangeSsoCredentialRequestSchema = z.object({
  provider: z.string().min(1),
  platform: z.string().min(1),
  credential: z.string().min(1),
});

export type ExchangeSsoCredentialRequest = z.infer<typeof exchangeSsoCredentialRequestSchema>;
