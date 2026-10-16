import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';

/**
 * Request schemas of the admin's operations on requests (admin spec 006, contracts/operations-api.md
 * §1–§5). Dates are instants: the admin turns local days into them on the match's clock.
 */

const instant = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 instant.' })
  .transform((value) => new Date(value));
const id = z.string().trim().min(1).max(100);

/** `GET /admin/requests`. */
export const listRequestsQuerySchema = z
  .object({
    ...pageQuery,
    status: z.enum(['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed']).optional(),
    // The country and the market come from X-Scope (spec 031, contract B1).
    zoneId: id.optional(),
    from: instant.optional(),
    to: instant.optional(),
    clientId: id.optional(),
    goalkeeperId: id.optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from.getTime() < query.to.getTime(), { message: 'Must be after from.', path: ['to'] });

/** `POST /admin/requests/:requestId[/bookings/:bookingId]/cancel`: the length is checked by the domain rule. */
export const adminCancelRequestSchema = z.object({ reason: z.string({ required_error: 'reason is required' }) }).strict();
