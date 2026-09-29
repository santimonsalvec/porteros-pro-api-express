import { z } from 'zod';

/** The check-in body (contracts/check-in.md §2): the uploaded photo, and the phone's location if any. */
export const checkInRequestSchema = z.object({
  imageId: z.string({ required_error: 'imageId is required', invalid_type_error: 'imageId must be a string' }).trim().min(1, 'imageId is required'),
  location: z
    .object({
      latitude: z.number({ invalid_type_error: 'latitude must be a number' }).min(-90).max(90),
      longitude: z.number({ invalid_type_error: 'longitude must be a number' }).min(-180).max(180),
      accuracyMeters: z.number({ invalid_type_error: 'accuracyMeters must be a number' }).min(0).optional(),
    })
    .optional(),
});

export type CheckInRequest = z.infer<typeof checkInRequestSchema>;
