import { z } from 'zod';

/** `?retried&page&pageSize` (contracts/dashboard-system-api.md §3). Strict. */
export const systemEventsQuerySchema = z
  .object({
    retried: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    page: z.string().regex(/^\d+$/).default('1').transform(Number).pipe(z.number().int().min(1)),
    pageSize: z.string().regex(/^\d+$/).default('20').transform(Number).pipe(z.number().int().min(1).max(50)),
  })
  .strict();

/** The routes without parameters accept none. */
export const noQuerySchema = z.object({}).strict();
