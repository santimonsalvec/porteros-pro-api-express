import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';

const instant = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 instant.' })
  .transform((value) => new Date(value));
const stars = z.string().regex(/^[1-5]$/, 'Must be 1 to 5.').transform(Number);
const id = z.string().trim().min(1).max(100);

/** `GET /admin/ratings` (admin spec 006, contracts/operations-api.md §10). */
export const listRatingsQuerySchema = z
  .object({
    ...pageQuery,
    goalkeeperId: id.optional(),
    clientId: id.optional(),
    side: z.enum(['client', 'goalkeeper']).optional(),
    starsMin: stars.optional(),
    starsMax: stars.optional(),
    from: instant.optional(),
    to: instant.optional(),
  })
  .strict()
  .refine((query) => query.starsMin === undefined || query.starsMax === undefined || query.starsMin <= query.starsMax, {
    message: 'Must be at least starsMin.',
    path: ['starsMax'],
  })
  .refine((query) => !query.from || !query.to || query.from.getTime() < query.to.getTime(), { message: 'Must be after from.', path: ['to'] });
