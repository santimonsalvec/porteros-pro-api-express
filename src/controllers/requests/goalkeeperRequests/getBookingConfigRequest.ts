import { z } from 'zod';

/** A query-string coordinate: required, numeric, and inside its valid range. */
const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Required')
    .transform(Number)
    .pipe(z.number({ invalid_type_error: 'Must be a number.' }).finite('Must be a number.').min(min).max(max));

/** `GET /config?latitude=..&longitude=..` — the pitch the client has chosen. */
export const getBookingConfigRequestSchema = z.object({
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
});

export type GetBookingConfigRequest = z.infer<typeof getBookingConfigRequestSchema>;
