export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/**
 * A match start time as the client sent it: the wall-clock fields, plus the explicit
 * UTC offset in minutes when one was given (`null` = "local time in the pitch's city").
 */
export interface ParsedStartsAt {
  local: LocalDateTime;
  offsetMinutes: number | null;
}

const STARTS_AT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parses `YYYY-MM-DDTHH:mm[:ss[.fraction]][Z|±HH:mm]`. Deliberately NOT built on
 * `Date.parse`, which reads an offset-less string in the *server's* time zone — the
 * exact bug the per-city time-zone rule exists to prevent. Returns `null` for any
 * other shape or an impossible calendar/clock value.
 */
export function parseStartsAt(raw: string): ParsedStartsAt | null {
  const match = STARTS_AT_PATTERN.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const millisecond = match[7] === undefined ? 0 : Number(match[7].padEnd(3, '0').slice(0, 3));

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes: number | null = null;
  const offset = match[8];
  if (offset !== undefined) {
    if (offset === 'Z') {
      offsetMinutes = 0;
    } else {
      const sign = offset.startsWith('-') ? -1 : 1;
      const offsetHours = Number(offset.slice(1, 3));
      const offsetMins = Number(offset.slice(4, 6));
      if (offsetHours > 23 || offsetMins > 59) return null;
      offsetMinutes = sign * (offsetHours * 60 + offsetMins);
    }
  }

  return { local: { year, month, day, hour, minute, second, millisecond }, offsetMinutes };
}
