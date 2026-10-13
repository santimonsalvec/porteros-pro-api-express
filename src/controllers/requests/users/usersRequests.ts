import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';

/**
 * Request schemas of the admin's users (admin spec 005, contracts/users-goalkeepers-api.md §1–§2).
 * zod checks shapes; the profile rules (`validateNameAndWhatsApp`) check values.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD.');
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

/** `GET /admin/users`. */
export const listUsersQuerySchema = z
  .object({
    ...pageQuery,
    q: z.string().trim().max(100).optional(),
    role: z.enum(['client', 'goalkeeper']).optional(),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Must be a 2-letter country code.').optional(),
    createdFrom: day.optional(),
    createdTo: day.optional(),
    blocked: booleanQuery.optional(),
  })
  .strict();

/** A search the other admin lists accept too (goalkeepers): same length limit as users. */
export const searchQueryField = z.string().trim().max(100).optional();
export { booleanQuery };

/** `PATCH /admin/users/:userId`: any of the contact fields, with the version read. */
export const updateUserContactRequestSchema = z
  .object({
    version: z.string().min(1),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    countryCode: z.string().trim().optional(),
    whatsAppNumber: z.string().optional(),
  })
  .strict();

/** `POST /admin/users/:userId/block|unblock`: the length is checked by the domain rule. */
export const blockReasonRequestSchema = z.object({ reason: z.string({ required_error: 'reason is required' }) }).strict();
