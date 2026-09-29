import { z } from 'zod';

/** A minimal rating (contracts/ratings-and-cases.md §2). */
export const rateRequestSchema = z.object({
  answer: z.boolean({ required_error: 'answer is required', invalid_type_error: 'answer must be a boolean' }),
  stars: z.number({ required_error: 'stars is required', invalid_type_error: 'stars must be a number' }).int().min(1).max(5),
  comment: z.string({ invalid_type_error: 'comment must be a string' }).max(500).optional(),
});
