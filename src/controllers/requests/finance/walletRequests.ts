import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';
import { idField } from './financeFilters.js';

/** `GET /admin/wallets` (admin spec 007, contracts/finance-api.md §1). */
export const listWalletsQuerySchema = z
  .object({
    ...pageQuery,
    countryId: idField.optional(),
    negative: z.enum(['true']).transform(() => true).optional(),
    sort: z.enum(['balance_asc', 'balance_desc']).default('balance_asc'),
  })
  .strict();
