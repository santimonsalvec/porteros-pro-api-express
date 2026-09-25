import { z, type ZodError } from 'zod';
import {
  DURATION_OPTIONS,
  GOALKEEPER_COUNTS,
  isDurationOption,
  isGoalkeeperCount,
} from '../../../application/features/goalkeeperRequests/common/bookingLimits.js';
import { parseStartsAt } from '../../../application/features/goalkeeperRequests/common/startsAt.js';

/** "60, 90 or 120" — the message is built from the constants so it can never drift from them. */
function orList(values: readonly number[]): string {
  return values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
}

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
  goalkeeperCount: z.number().refine(isGoalkeeperCount, { message: `Must be ${orList(GOALKEEPER_COUNTS)}.` }),
  durationMinutes: z.number().refine(isDurationOption, { message: `Must be ${orList(DURATION_OPTIONS)}.` }),
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
