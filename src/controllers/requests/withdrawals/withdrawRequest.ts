import { z } from 'zod';

/** The goalkeeper's optional reason when withdrawing (contracts/withdrawals.md §1). Empty means none. */
export const withdrawRequestSchema = z.object({
  reason: z
    .string({ invalid_type_error: 'reason must be a string' })
    .trim()
    .max(200, 'reason must have at most 200 characters')
    .optional(),
});

export type WithdrawRequest = z.infer<typeof withdrawRequestSchema>;
