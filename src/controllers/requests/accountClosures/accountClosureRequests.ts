import { z } from 'zod';
import { CLOSURE_STATUSES } from '../../../domain/accountClosures/accountClosure.js';
import { pageQuery } from '../geography/geographyRequests.js';

/** Request schemas of the account closure routes (feature 029, contracts/account-closure-api.md). */

const OPEN_STATUSES = ['requested', 'refund_recorded'] as const;

/** `GET /admin/account-closures`: statuses come as a comma list; open ones by default. */
export const listAccountClosuresQuerySchema = z
  .object({
    ...pageQuery,
    status: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [...OPEN_STATUSES]))
      .pipe(z.array(z.enum(CLOSURE_STATUSES)).min(1)),
    q: z.string().trim().max(100).optional(),
    hasDebt: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? null : value === 'true' ? ('with' as const) : ('without' as const))),
  })
  .strict();

/** `POST …/debt-resolution`: the length of the reason is checked by the domain rule. */
export const debtResolutionRequestSchema = z
  .object({
    resolution: z.enum(['deposit_required', 'waived']),
    reason: z.string().optional(),
  })
  .strict();

/** `POST …/refund`: whole currency units, as the balance is. */
export const recordRefundRequestSchema = z
  .object({
    amount: z.number().int().min(0),
    reference: z.string().nullable().optional(),
    paidOn: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

/** `POST …/reject`. */
export const rejectClosureRequestSchema = z.object({ reason: z.string({ required_error: 'reason is required' }) }).strict();
