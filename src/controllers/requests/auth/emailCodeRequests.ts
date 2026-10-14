import { z } from 'zod';

/** The address is checked by the handler: a malformed one is a `validation_failed` on `email`. */
export const emailCodeRequestSchema = z.object({
  email: z.string({ required_error: 'email is required', invalid_type_error: 'email must be a string' }).max(254, 'email is too long'),
});

/** The code may come pasted with spaces or dashes; the handler normalizes it (admin spec 009). */
export const emailCodeVerifyRequestSchema = z.object({
  email: z.string({ required_error: 'email is required', invalid_type_error: 'email must be a string' }).max(254, 'email is too long'),
  code: z.string({ required_error: 'code is required', invalid_type_error: 'code must be a string' }).min(1, 'code is required').max(20, 'code is too long'),
});
