import type { LocalDateTime } from './startsAt.js';

/**
 * Time-zone arithmetic on the runtime's built-in `Intl` (research.md §3) — no library.
 * The only hard question, "what is this zone's UTC offset at this instant", is answered
 * by the runtime's tz database; everything else here is plain, pure arithmetic.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** `true` when `timeZone` is a real IANA identifier the runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

function partsAt(epochMs: number, timeZone: string): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/** The zone's UTC offset, in minutes, at the given instant (Bogotá ⇒ −300, Kolkata ⇒ 330). */
export function zoneOffsetMinutes(timeZone: string, epochMs: number): number {
  const parts = partsAt(epochMs, timeZone);
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const wholeSecondMs = Math.floor(epochMs / 1000) * 1000;
  return Math.round((asUtc - wholeSecondMs) / 60_000);
}

/** The wall-clock fields of an instant as seen in the given zone. */
export function toLocalParts(epochMs: number, timeZone: string): LocalDateTime {
  const parts = partsAt(epochMs, timeZone);
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
    millisecond: ((epochMs % 1000) + 1000) % 1000,
  };
}

export type LocalResolution =
  | { kind: 'ok'; epochMs: number }
  /** The wall-clock time was skipped by a clock going forward. */
  | { kind: 'nonexistent' }
  /** The wall-clock time happened twice because a clock went back. */
  | { kind: 'ambiguous' };

/**
 * Turns a wall-clock time in a zone into an instant. Probes the offset one day before
 * and one day after, derives a candidate instant from each, and keeps the candidates
 * whose own offset agrees: none ⇒ skipped by a DST gap, two ⇒ repeated by a DST overlap.
 */
export function resolveLocalDateTime(local: LocalDateTime, timeZone: string): LocalResolution {
  const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond);
  const candidates = new Set<number>();
  for (const probe of [asIfUtc - 86_400_000, asIfUtc + 86_400_000]) {
    const offset = zoneOffsetMinutes(timeZone, probe);
    const candidate = asIfUtc - offset * 60_000;
    if (zoneOffsetMinutes(timeZone, candidate) === offset) candidates.add(candidate);
  }
  if (candidates.size === 0) return { kind: 'nonexistent' };
  if (candidates.size > 1) return { kind: 'ambiguous' };
  return { kind: 'ok', epochMs: [...candidates][0]! };
}

/** Whole days since the epoch of a local calendar date — for counting calendar days between two local dates. */
export function localDayNumber(local: Pick<LocalDateTime, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(local.year, local.month - 1, local.day) / 86_400_000);
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** `YYYY-MM-DDTHH:mm:ss±HH:mm` for an instant as seen in the given zone. */
export function formatLocalIso(epochMs: number, timeZone: string): string {
  const local = toLocalParts(epochMs, timeZone);
  const offset = zoneOffsetMinutes(timeZone, epochMs);
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  return (
    `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}
