import { z } from 'zod';

const token = z
  .string({ required_error: 'token is required', invalid_type_error: 'token must be a string' })
  .trim()
  .min(1, 'token must not be empty')
  .max(4096, 'token must have at most 4096 characters');

/** The app's push token and platform (contracts/devices-endpoints.md). Tokens never travel in URLs. */
export const registerDeviceRequestSchema = z.object({
  token,
  platform: z.enum(['ios', 'android'], {
    required_error: 'platform is required',
    invalid_type_error: 'platform must be "ios" or "android"',
  }),
});

export const unregisterDeviceRequestSchema = z.object({ token });

export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type UnregisterDeviceRequest = z.infer<typeof unregisterDeviceRequestSchema>;
