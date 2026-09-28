import { z } from 'zod';

/** An administrator's reversal of a withdrawal's penalty (contracts/withdrawals.md §4). */
export const reverseWithdrawalRequestSchema = z
  .object({
    refund: z.boolean({ invalid_type_error: 'refund must be a boolean' }).default(false),
    liftSuspension: z.boolean({ invalid_type_error: 'liftSuspension must be a boolean' }).default(false),
    reason: z
      .string({ required_error: 'reason is required', invalid_type_error: 'reason must be a string' })
      .trim()
      .min(3, 'reason must have at least 3 characters')
      .max(500, 'reason must have at most 500 characters'),
  })
  .refine((body) => body.refund || body.liftSuspension, { message: 'Ask for refund, liftSuspension or both', path: ['body'] });

export type ReverseWithdrawalRequest = z.infer<typeof reverseWithdrawalRequestSchema>;
