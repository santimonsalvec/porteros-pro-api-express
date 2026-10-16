import { z } from 'zod';

/** Request schemas of the unverified discount (admin spec 030, contracts D1–D4). */

const revision = z.number().int().min(0);
/** Whole basis points and whole minutes; `null` = inherit. The limits are the handler's, so its messages name them. */
const terms = { discountBps: z.number().nullable().default(null), verifiedPriorityMinutes: z.number().nullable().default(null) };

/** `GET /admin/unverified-discounts`. */
export const listUnverifiedDiscountsQuerySchema = z.object({ countryId: z.string().min(1) }).strict();

/** `POST /admin/unverified-discounts`. */
export const createUnverifiedDiscountRequestSchema = z
  .object({ scope: z.enum(['country', 'market', 'zone']), refId: z.string().min(1), ...terms })
  .strict();

/** `PATCH /admin/unverified-discounts/:discountId`. */
export const updateUnverifiedDiscountRequestSchema = z.object({ revision, ...terms }).strict();

/** `POST /admin/unverified-discounts/:discountId/delete`. */
export const deleteUnverifiedDiscountRequestSchema = z.object({ revision }).strict();
