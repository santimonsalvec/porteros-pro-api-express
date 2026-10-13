import { toLocalParts, zoneOffsetMinutes } from '../../goalkeeperRequests/common/zonedTime.js';

/** `from` included, `to` excluded. */
export interface TimeWindow {
  from: Date;
  to: Date;
}

export interface DashboardWindows {
  today: TimeWindow;
  /** Monday to the next Monday. */
  week: TimeWindow;
  /** The week's seven local dates, `YYYY-MM-DD`, Monday first. */
  days: string[];
}

const DAY_MS = 86_400_000;

/**
 * The first instant of a local calendar day (`day` may overflow the month, as `Date.UTC` allows).
 * Midnight is tried with the offset of the day before and of the day itself, and the earliest
 * candidate that already falls on that day wins: a clock that jumps forward at midnight skips it
 * (the day starts at 01:00) and one that goes back repeats the previous evening, never this day.
 */
function localDayStart(year: number, month: number, day: number, timeZone: string): Date {
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const target = new Date(midnightAsUtc).toISOString().slice(0, 10);
  const candidates = [midnightAsUtc - DAY_MS / 2, midnightAsUtc + DAY_MS / 2]
    .map((noon) => midnightAsUtc - zoneOffsetMinutes(timeZone, noon) * 60_000)
    .sort((a, b) => a - b);
  const start = candidates.find((candidate) => localDate(candidate, timeZone) === target) ?? candidates[candidates.length - 1]!;
  return new Date(start);
}

function localDate(epochMs: number, timeZone: string): string {
  const { year, month, day } = toLocalParts(epochMs, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Today and this week (Monday first) in `timeZone`, as instants (admin spec 008, research §2). */
export function dashboardWindows(timeZone: string, now: Date): DashboardWindows {
  const { year, month, day } = toLocalParts(now.getTime(), timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const monday = day - ((weekday + 6) % 7);
  const days = Array.from({ length: 7 }, (_, offset) => new Date(Date.UTC(year, month - 1, monday + offset)).toISOString().slice(0, 10));
  return {
    today: { from: localDayStart(year, month, day, timeZone), to: localDayStart(year, month, day + 1, timeZone) },
    week: { from: localDayStart(year, month, monday, timeZone), to: localDayStart(year, month, monday + 7, timeZone) },
    days,
  };
}
