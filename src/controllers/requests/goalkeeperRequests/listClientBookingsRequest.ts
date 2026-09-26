import { z } from 'zod';
import {
  BOOKINGS_PAGE_SIZE_DEFAULT,
  BOOKINGS_PAGE_SIZE_MAX,
} from '../../../application/features/goalkeeperRequests/common/bookingLimits.js';

/**
 * A query-string whole number with a default. Digits only, so `''`, `-1`, `1.5` and `1e1` are
 * refused rather than coerced; a repeated parameter arrives as an array and fails the string
 * check, so a request is never ambiguous (research.md §6).
 */
const wholeNumber = (defaultValue: number, max?: number) => {
  let value = z.number().int().min(1, 'Must be 1 or more.');
  if (max !== undefined) value = value.max(max, `Must be at most ${max}.`);
  return z
    .string({ invalid_type_error: 'Must be a whole number.' })
    .regex(/^\d+$/, 'Must be a whole number.')
    .default(String(defaultValue))
    .transform(Number)
    .pipe(value);
};

/**
 * `GET /bookings?page=..&pageSize=..`. Unknown parameters — including any client or user id —
 * are stripped: whose bookings are listed comes from the token alone (FR-002).
 */
export const listClientBookingsRequestSchema = z.object({
  page: wholeNumber(1),
  pageSize: wholeNumber(BOOKINGS_PAGE_SIZE_DEFAULT, BOOKINGS_PAGE_SIZE_MAX),
});

export type ListClientBookingsRequest = z.infer<typeof listClientBookingsRequestSchema>;
