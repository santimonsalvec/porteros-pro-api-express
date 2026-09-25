import { describe, expect, it } from 'vitest';
import {
  formatLocalIso,
  isValidTimeZone,
  localDayNumber,
  resolveLocalDateTime,
  toLocalParts,
  zoneOffsetMinutes,
} from '../../../../../src/application/features/goalkeeperRequests/common/zonedTime.js';
import type { LocalDateTime } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';

function local(year: number, month: number, day: number, hour: number, minute: number, second = 0): LocalDateTime {
  return { year, month, day, hour, minute, second, millisecond: 0 };
}

describe('zoneOffsetMinutes', () => {
  it('reads whole-hour, half-hour and 45-minute offsets', () => {
    const instant = Date.UTC(2026, 8, 21, 12, 0);
    expect(zoneOffsetMinutes('America/Bogota', instant)).toBe(-300);
    expect(zoneOffsetMinutes('Asia/Kolkata', instant)).toBe(330);
    expect(zoneOffsetMinutes('Asia/Kathmandu', instant)).toBe(345);
  });

  it('follows daylight-saving changes', () => {
    expect(zoneOffsetMinutes('America/New_York', Date.UTC(2026, 0, 15, 12))).toBe(-300);
    expect(zoneOffsetMinutes('America/New_York', Date.UTC(2026, 6, 15, 12))).toBe(-240);
    expect(zoneOffsetMinutes('Australia/Lord_Howe', Date.UTC(2026, 0, 1))).toBe(660);
    expect(zoneOffsetMinutes('Australia/Lord_Howe', Date.UTC(2026, 6, 1))).toBe(630);
  });
});

describe('isValidTimeZone', () => {
  it('accepts real IANA identifiers and rejects everything else', () => {
    expect(isValidTimeZone('America/Bogota')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('   ')).toBe(false);
  });
});

describe('resolveLocalDateTime', () => {
  it('resolves an ordinary local time to the right instant', () => {
    const result = resolveLocalDateTime(local(2026, 9, 21, 15, 0), 'America/Bogota');
    expect(result).toEqual({ kind: 'ok', epochMs: Date.UTC(2026, 8, 21, 20, 0) });
  });

  it('resolves the same wall-clock time to different instants in different zones', () => {
    const bogota = resolveLocalDateTime(local(2026, 9, 21, 15, 0), 'America/Bogota');
    const mexico = resolveLocalDateTime(local(2026, 9, 21, 15, 0), 'America/Mexico_City');
    const kolkata = resolveLocalDateTime(local(2026, 9, 21, 15, 0), 'Asia/Kolkata');
    expect(bogota).toEqual({ kind: 'ok', epochMs: Date.UTC(2026, 8, 21, 20, 0) });
    expect(mexico).toEqual({ kind: 'ok', epochMs: Date.UTC(2026, 8, 21, 21, 0) });
    expect(kolkata).toEqual({ kind: 'ok', epochMs: Date.UTC(2026, 8, 21, 9, 30) });
  });

  it('flags a wall-clock time skipped by a clock going forward', () => {
    expect(resolveLocalDateTime(local(2026, 3, 8, 2, 30), 'America/New_York')).toEqual({ kind: 'nonexistent' });
    expect(resolveLocalDateTime(local(2026, 10, 4, 2, 15), 'Australia/Lord_Howe')).toEqual({ kind: 'nonexistent' });
  });

  it('flags a wall-clock time that happens twice when a clock goes back', () => {
    expect(resolveLocalDateTime(local(2026, 11, 1, 1, 30), 'America/New_York')).toEqual({ kind: 'ambiguous' });
  });

  it('resolves times just outside a DST change normally', () => {
    expect(resolveLocalDateTime(local(2026, 11, 1, 3, 0), 'America/New_York')).toEqual({
      kind: 'ok',
      epochMs: Date.UTC(2026, 10, 1, 8, 0),
    });
    expect(resolveLocalDateTime(local(2026, 3, 8, 3, 0), 'America/New_York')).toEqual({
      kind: 'ok',
      epochMs: Date.UTC(2026, 2, 8, 7, 0),
    });
  });
});

describe('toLocalParts / localDayNumber / formatLocalIso', () => {
  it('round-trips an instant through a zone', () => {
    const instant = Date.UTC(2026, 8, 21, 20, 0);
    expect(toLocalParts(instant, 'America/Bogota')).toEqual(local(2026, 9, 21, 15, 0));
    expect(toLocalParts(instant, 'Asia/Kathmandu')).toEqual(local(2026, 9, 22, 1, 45));
  });

  it('keeps sub-second precision for negative-safe millisecond extraction', () => {
    expect(toLocalParts(Date.UTC(2026, 8, 21, 20, 0, 0, 250), 'America/Bogota').millisecond).toBe(250);
  });

  it('counts whole local calendar days across month and year boundaries', () => {
    expect(localDayNumber(local(2026, 10, 1, 0, 0)) - localDayNumber(local(2026, 9, 30, 23, 59))).toBe(1);
    expect(localDayNumber(local(2027, 1, 1, 0, 0)) - localDayNumber(local(2026, 12, 31, 12, 0))).toBe(1);
    expect(localDayNumber(local(2026, 9, 23, 0, 0)) - localDayNumber(local(2026, 9, 21, 23, 30))).toBe(2);
  });

  it('formats the local time with the zone offset', () => {
    const instant = Date.UTC(2026, 8, 21, 20, 0);
    expect(formatLocalIso(instant, 'America/Bogota')).toBe('2026-09-21T15:00:00-05:00');
    expect(formatLocalIso(instant, 'Asia/Kolkata')).toBe('2026-09-22T01:30:00+05:30');
    expect(formatLocalIso(instant, 'Asia/Kathmandu')).toBe('2026-09-22T01:45:00+05:45');
    expect(formatLocalIso(instant, 'UTC')).toBe('2026-09-21T20:00:00+00:00');
  });
});
