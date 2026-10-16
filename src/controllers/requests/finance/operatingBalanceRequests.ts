import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';

/** `GET /admin/operating-balances` (admin spec 007, contracts/finance-api.md §1). */
export const listOperatingBalancesQuerySchema = z
  .object({
    ...pageQuery,
    marketId: z.string().trim().min(1).max(100).optional(),
    negative: z.enum(['true']).transform(() => true).optional(),
    sort: z.enum(['balance_asc', 'balance_desc']).default('balance_asc'),
  })
  .strict();
