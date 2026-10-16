import { z } from 'zod';

/** No parameters: the country and the market come from X-Scope (spec 031, contract B1). Strict. */
export const dashboardSummaryQuerySchema = z.object({}).strict();
