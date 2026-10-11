import { z } from 'zod';

/** `POST /auth/admin/sign-in`: the Google ID token from Google Identity Services. */
export const adminSignInRequestSchema = z.object({
  credential: z.string({ required_error: 'credential is required', invalid_type_error: 'credential must be a string' }).min(1).max(4096),
});
