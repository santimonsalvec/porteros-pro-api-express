import { z } from 'zod';

/** The client's optional reason when cancelling (contracts/client-cancel.md). */
export const cancelRequestSchema = z.object({
  reason: z
    .string({ invalid_type_error: 'reason must be a string' })
    .trim()
    .min(1, 'reason must not be empty')
    .max(200, 'reason must have at most 200 characters')
    .optional(),
});

export type CancelRequest = z.infer<typeof cancelRequestSchema>;
