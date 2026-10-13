import { z } from 'zod';
import { TOP_UP_STATUSES } from '../../../domain/payments/topUp.js';
import { pageQuery } from '../geography/geographyRequests.js';
import { FROM_BEFORE_TO, fromBeforeTo, idField, instantField } from './financeFilters.js';

const filters = {
  status: z.enum(TOP_UP_STATUSES).optional(),
  countryId: idField.optional(),
  goalkeeperId: idField.optional(),
  from: instantField.optional(),
  to: instantField.optional(),
};

/** `GET /admin/top-ups` (admin spec 007, contracts/finance-api.md §2). */
export const listTopUpsQuerySchema = z
  .object({ ...pageQuery, ...filters })
  .strict()
  .refine(fromBeforeTo, FROM_BEFORE_TO);

/** `GET /admin/top-ups/export` (§3): the same filters, no pages. */
export const exportTopUpsQuerySchema = z.object(filters).strict().refine(fromBeforeTo, FROM_BEFORE_TO);
