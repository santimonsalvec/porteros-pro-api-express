import { describe, expect, it } from 'vitest';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';

describe('parseStartsAt', () => {
  it('parses an offset-less local time without inventing an offset', () => {
    expect(parseStartsAt('2026-09-21T15:00')).toEqual({
      local: { year: 2026, month: 9, day: 21, hour: 15, minute: 0, second: 0, millisecond: 0 },
      offsetMinutes: null,
    });
    expect(parseStartsAt('2026-09-21T15:30:00')?.offsetMinutes).toBeNull();
  });

  it('parses Z and ±HH:mm offsets', () => {
    expect(parseStartsAt('2026-09-21T15:00:00Z')?.offsetMinutes).toBe(0);
    expect(parseStartsAt('2026-09-21T15:00:00-05:00')?.offsetMinutes).toBe(-300);
    expect(parseStartsAt('2026-09-21T15:00:00+05:30')?.offsetMinutes).toBe(330);
    expect(parseStartsAt('2026-09-21T15:00+05:45')?.offsetMinutes).toBe(345);
  });

  it('parses seconds and fractional seconds', () => {
    expect(parseStartsAt('2026-09-21T15:00:30')?.local.second).toBe(30);
    expect(parseStartsAt('2026-09-21T15:00:00.5')?.local.millisecond).toBe(500);
    expect(parseStartsAt('2026-09-21T15:00:00.123456789Z')?.local.millisecond).toBe(123);
  });

  it('rejects impossible calendar and clock values', () => {
    expect(parseStartsAt('2026-02-30T10:00')).toBeNull();
    expect(parseStartsAt('2026-13-01T10:00')).toBeNull();
    expect(parseStartsAt('2026-00-10T10:00')).toBeNull();
    expect(parseStartsAt('2026-09-21T24:00')).toBeNull();
    expect(parseStartsAt('2026-09-21T10:60')).toBeNull();
    expect(parseStartsAt('2026-09-21T10:00:60')).toBeNull();
    expect(parseStartsAt('2026-09-21T10:00+24:00')).toBeNull();
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parseStartsAt('2028-02-29T10:00')).not.toBeNull();
    expect(parseStartsAt('2026-02-29T10:00')).toBeNull();
  });

  it('rejects any other shape', () => {
    expect(parseStartsAt('2026-09-21t15:00')).toBeNull();
    expect(parseStartsAt('2026-09-21')).toBeNull();
    expect(parseStartsAt('2026-09-21 15:00')).toBeNull();
    expect(parseStartsAt('2026-09-21T15:00:00garbage')).toBeNull();
    expect(parseStartsAt('')).toBeNull();
    expect(parseStartsAt('tomorrow at 3')).toBeNull();
  });

  it('does not depend on the process time zone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Tokyo';
      const tokyo = parseStartsAt('2026-09-21T15:00');
      process.env.TZ = 'America/Los_Angeles';
      const losAngeles = parseStartsAt('2026-09-21T15:00');
      expect(tokyo).toEqual(losAngeles);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
