import { z } from 'zod';
import { pageQuery } from '../geography/geographyRequests.js';

/** `GET /admin/notifications?userId=…` (admin spec 006, contracts/operations-api.md §11). */
export const listUserNotificationsQuerySchema = z
  .object({
    ...pageQuery,
    userId: z.string({ required_error: 'userId is required' }).trim().min(1).max(100),
  })
  .strict();
