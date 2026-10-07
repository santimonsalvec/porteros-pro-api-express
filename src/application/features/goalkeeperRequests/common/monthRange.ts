import { zoneOffsetMinutes } from './zonedTime.js';

/** A calendar month: `month` is 1–12. */
export interface CalendarMonth {
  year: number;
  month: number;
}

/** The month `delta` months away from `month` (negative goes back). */
export function addMonths(month: CalendarMonth, delta: number): CalendarMonth {
  const index = month.year * 12 + (month.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** How many days the month has (February counts leap years). */
export function daysInMonth(month: CalendarMonth): number {
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}

/**
 * The instant a local calendar day starts in `timeZone` (feature 026). The offset is read at that
 * day's noon, so a zone whose clocks change at midnight still yields the day's first instant
 * instead of a skipped or doubled wall-clock time.
 */
export function localDayStart(month: CalendarMonth, day: number, timeZone: string): Date {
  const midnightAsUtc = Date.UTC(month.year, month.month - 1, day);
  const offset = zoneOffsetMinutes(timeZone, midnightAsUtc + 12 * 3_600_000);
  return new Date(midnightAsUtc - offset * 60_000);
}
