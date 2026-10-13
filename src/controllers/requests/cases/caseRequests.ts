import { z } from 'zod';

const instant = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 instant.' })
  .transform((value) => new Date(value));

/** `?status=open|resolved&page&pageSize` (contracts/ratings-and-cases.md §3). */
export const listCasesQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
    page: z.string().regex(/^\d+$/).default('1').transform(Number).pipe(z.number().int().min(1)),
    pageSize: z.string().regex(/^\d+$/).default('20').transform(Number).pipe(z.number().int().min(1).max(50)),
    // Admin spec 006 (contracts/operations-api.md §6): optional, the list is 021's without them.
    countryId: z.string().trim().min(1).max(100).optional(),
    type: z.enum(['goalkeeper_no_show', 'payment_not_received', 'late_attendance_claim']).optional(),
    from: instant.optional(),
    to: instant.optional(),
    order: z.enum(['default', 'oldest']).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from.getTime() < query.to.getTime(), { message: 'Must be after from.', path: ['to'] });

export const resolveCaseRequestSchema = z.object({
  note: z.string({ required_error: 'note is required', invalid_type_error: 'note must be a string' }).trim().min(3).max(500),
});
