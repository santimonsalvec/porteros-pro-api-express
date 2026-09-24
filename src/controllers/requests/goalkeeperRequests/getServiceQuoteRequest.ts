import { z, type ZodError } from 'zod';
import { parseStartsAt } from '../../../application/features/goalkeeperRequests/common/startsAt.js';

/**
 * Shape and range checks only (types, latitude/longitude, the allowed count and
 * duration values, and that `startsAt` parses). Everything that depends on the city —
 * the local 30-minute mark, notice, window, coverage, configuration — is judged in the
 * application layer (research.md §4).
 */
export const getServiceQuoteRequestSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  startsAt: z
    .string()
    .refine(
      (value) => parseStartsAt(value) !== null,
      'Must be an ISO-8601 date-time such as 2026-09-21T15:00:00 or 2026-09-21T15:00:00-05:00.',
    ),
  goalkeeperCount: z.union([z.literal(1), z.literal(2)], { errorMap: () => ({ message: 'Must be 1 or 2.' }) }),
  durationMinutes: z.union([z.literal(60), z.literal(90), z.literal(120)], {
    errorMap: () => ({ message: 'Must be 60, 90 or 120.' }),
  }),
});

export type GetServiceQuoteRequest = z.infer<typeof getServiceQuoteRequestSchema>;

/**
 * One message per offending field, keyed by its dotted path. The global `errorHandler`
 * collapses a `ZodError` into a generic body without field names, and changing it would
 * alter every other endpoint's response — so this endpoint builds its own.
 */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'body';
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
