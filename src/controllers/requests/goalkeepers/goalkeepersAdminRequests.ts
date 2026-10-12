import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';
import { booleanQuery, searchQueryField } from '../users/usersRequests.js';

/** Request schemas of the admin's goalkeepers (admin spec 005, contracts/users-goalkeepers-api.md §3–§4). */

const id = z.string().min(1).optional();

/** `GET /admin/goalkeepers`. */
export const listGoalkeepersQuerySchema = z
  .object({
    ...pageQuery,
    q: searchQueryField,
    cityId: id,
    zoneId: id,
    suspended: booleanQuery.optional(),
    availableForOffers: booleanQuery.optional(),
    balanceBelow: z.string().regex(/^-?\d+$/, 'Must be a whole number.').transform(Number).optional(),
  })
  .strict();

/** `PATCH /admin/goalkeepers/:userId/document`. */
export const correctDocumentRequestSchema = z
  .object({
    version: z.string().min(1),
    documentType: z.string().trim().min(1),
    documentNumber: z.string(),
  })
  .strict();

/** `GET /admin/goalkeeper-registrations`. */
export const listRegistrationsQuerySchema = z
  .object({
    ...pageQuery,
    step: z.enum(['identification', 'physicalData', 'availability', 'ready']).optional(),
    cityId: id,
    idleDaysMin: z.string().regex(/^\d{1,4}$/, 'Must be a whole number of days.').transform(Number).optional(),
  })
  .strict();
