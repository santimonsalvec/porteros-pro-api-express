import { z } from 'zod';

/** Request schemas of the admin's goalkeeper validation and verification (admin spec 030, contracts C3–C7). */

const revision = z.number().int().min(0);
const reason = z.string().optional();
/** `YYYY-MM-DD`, read as the start of that day in UTC. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date as YYYY-MM-DD.');

/** `POST /admin/goalkeepers/:userId/background-checks/:checkId/review`. */
export const reviewBackgroundCheckRequestSchema = z
  .object({
    revision,
    decision: z.enum(['approve', 'reject']),
    reason,
    expiresAt: isoDate.transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  })
  .strict();

/** `POST /admin/goalkeepers/:userId/validation`. */
export const decideValidationRequestSchema = z
  .object({
    revision,
    decision: z.enum(['approve', 'reject']),
    reason,
    // Validate and verify in one step (FR-011): declared below, after the verification schema.
    verification: z.lazy(() => verificationSchema).optional(),
  })
  .strict();

/** The manual verification, by method (contracts C6). */
export const verificationSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('referral'), referrerId: z.string().min(1) }).strict(),
  z.object({ method: z.literal('other_platform'), platformName: z.string(), evidenceImageIds: z.array(z.string().min(1)).default([]) }).strict(),
  z
    .object({ method: z.literal('practice'), evaluatedOn: isoDate, result: z.enum(['passed', 'failed']), notes: z.string().nullable().default(null) })
    .strict(),
]);

/** `POST /admin/goalkeepers/:userId/verification`: the revision beside the method's fields. */
export const verifyGoalkeeperRequestSchema = z
  .object({ revision })
  .passthrough()
  .transform(({ revision: read, ...rest }, ctx) => {
    const parsed = verificationSchema.safeParse(rest);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    return { revision: read, verification: parsed.data };
  });

/** `GET /admin/goalkeepers/:userId/referrer-options`. */
export const referrerOptionsQuerySchema = z.object({ q: z.string().default('') }).strict();

/** `POST …/validation/revoke` and `…/verification/revoke`. */
export const revokeRequestSchema = z.object({ revision, reason: z.string() }).strict();
