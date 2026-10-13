import { z } from 'zod';

const id = z.string().trim().min(1).max(100);

/** `?countryId&cityId` (contracts/dashboard-system-api.md §1): a city needs its country. Strict. */
export const dashboardSummaryQuerySchema = z
  .object({ countryId: id.optional(), cityId: id.optional() })
  .strict()
  .refine((query) => query.cityId === undefined || query.countryId !== undefined, { message: 'A city needs its country.', path: ['cityId'] });
