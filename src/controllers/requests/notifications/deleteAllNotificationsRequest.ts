import { z } from 'zod';

/**
 * «Limpiar todo» (feature 025): `before` is the `createdAt` of the newest entry the user had, so
 * entries that arrive meanwhile are kept.
 */
export const deleteAllNotificationsRequestSchema = z.object({
  before: z
    .string({ required_error: 'before is required', invalid_type_error: 'before must be a date-time string' })
    .datetime({ offset: true, message: 'before must be an ISO 8601 date-time' })
    .transform((value) => new Date(value)),
});

export type DeleteAllNotificationsRequest = z.infer<typeof deleteAllNotificationsRequestSchema>;
