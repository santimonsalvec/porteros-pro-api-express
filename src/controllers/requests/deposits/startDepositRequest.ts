import { z } from 'zod';

/** One of the country's deposit amounts, in whole currency units (contracts §2). */
export const startDepositRequestSchema = z.object({
  amount: z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .int('amount must be a whole number')
    .positive('amount must be greater than 0'),
});

export type StartDepositRequest = z.infer<typeof startDepositRequestSchema>;
