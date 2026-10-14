import { z } from 'zod';
import { revisionField } from '../geography/geographyRequests.js';

/** The sign-in code's expiry (admin spec 009): the range and whole minutes are the domain's rule. */
export const accessSettingsRequestSchema = z
  .object({
    revision: revisionField,
    loginCodeExpiryMinutes: z.number({
      required_error: 'loginCodeExpiryMinutes is required',
      invalid_type_error: 'loginCodeExpiryMinutes must be a number',
    }),
  })
  .strict();
