import { z } from 'zod';
import { DEPOSIT_STATUSES } from '../../../domain/deposits/deposit.js';
import { pageQuery } from '../geography/geographyRequests.js';
import { FROM_BEFORE_TO, fromBeforeTo, idField, instantField } from './financeFilters.js';

const filters = {
  status: z.enum(DEPOSIT_STATUSES).optional(),
  countryId: idField.optional(),
  goalkeeperId: idField.optional(),
  from: instantField.optional(),
  to: instantField.optional(),
};

/** `GET /admin/deposits` (admin spec 007, contracts/finance-api.md §2). */
export const listDepositsQuerySchema = z
  .object({ ...pageQuery, ...filters })
  .strict()
  .refine(fromBeforeTo, FROM_BEFORE_TO);

/** `GET /admin/deposits/export` (§3): the same filters, no pages. */
export const exportDepositsQuerySchema = z.object(filters).strict().refine(fromBeforeTo, FROM_BEFORE_TO);
