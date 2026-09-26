/**
 * The fixed limits of a goalkeeper booking. This is the single source of truth: the quote
 * request validation, the start-time slot check and the booking-config endpoint all read
 * these, so what the app is told it may pick is exactly what a quote accepts.
 *
 * They are code constants, not per-country settings (the spec fixes them); the per-country,
 * database-driven values are the booking window, the minimum notice and the surcharge tiers.
 */

export const GOALKEEPER_COUNTS = [1, 2] as const;
export type GoalkeeperCount = (typeof GOALKEEPER_COUNTS)[number];
export const GOALKEEPER_COUNT_MIN: GoalkeeperCount = 1;
export const GOALKEEPER_COUNT_MAX: GoalkeeperCount = 2;

export const DURATION_OPTIONS = [60, 90, 120] as const;
export type DurationMinutes = (typeof DURATION_OPTIONS)[number];

/** Start times sit on multiples of this many minutes (local :00 and :30). */
export const SLOT_STEP_MINUTES = 30;

/** A stored quote can be confirmed for this many minutes after it is issued (FR-002). */
export const QUOTE_VALIDITY_MINUTES = 3;

/** `GET /bookings` page size when the client does not send one, and the most it may ask for (FR-005). */
export const BOOKINGS_PAGE_SIZE_DEFAULT = 20;
export const BOOKINGS_PAGE_SIZE_MAX = 50;

export function isGoalkeeperCount(value: number): value is GoalkeeperCount {
  return (GOALKEEPER_COUNTS as readonly number[]).includes(value);
}

export function isDurationOption(value: number): value is DurationMinutes {
  return (DURATION_OPTIONS as readonly number[]).includes(value);
}
