import { z } from 'zod';

/** `?status=open|resolved&page&pageSize` (contracts/ratings-and-cases.md §3). */
export const listCasesQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  page: z.string().regex(/^\d+$/).default('1').transform(Number).pipe(z.number().int().min(1)),
  pageSize: z.string().regex(/^\d+$/).default('20').transform(Number).pipe(z.number().int().min(1).max(50)),
});

export const resolveCaseRequestSchema = z.object({
  note: z.string({ required_error: 'note is required', invalid_type_error: 'note must be a string' }).trim().min(3).max(500),
});
