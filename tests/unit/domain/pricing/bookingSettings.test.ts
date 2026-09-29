import { describe, expect, it } from 'vitest';
import { BookingSettings, type LeadTimeSurcharge } from '../../../../src/domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';

const tiers: LeadTimeSurcharge = {
  tiers: [
    { fromMinutes: 0, toMinutes: 60, amount: 10000 },
    { fromMinutes: 60, toMinutes: 120, amount: 5000 },
    { fromMinutes: 120, toMinutes: null, amount: 0 },
  ],
};
const base = { id: 's1', scope: 'country', refId: 'country-co' };

describe('BookingSettings', () => {
  it('builds a fully defined document', () => {
    const settings = new BookingSettings({ ...base, bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: tiers });
    expect(settings).toMatchObject({ scope: 'country', bookingWindowDays: 2, minNoticeMinutes: 30 });
  });

  it('builds a document with every setting absent — each one means "inherit"', () => {
    const settings = new BookingSettings({ ...base, scope: 'city' });
    expect(settings.bookingWindowDays).toBeNull();
    expect(settings.minNoticeMinutes).toBeNull();
    expect(settings.leadTimeSurcharge).toBeNull();
  });

  it('accepts a minimum notice of 0 and a gap between tiers', () => {
    expect(new BookingSettings({ ...base, minNoticeMinutes: 0 }).minNoticeMinutes).toBe(0);
    const gappy = { tiers: [{ fromMinutes: 0, toMinutes: 30, amount: 1 }, { fromMinutes: 90, toMinutes: null, amount: 0 }] };
    expect(() => new BookingSettings({ ...base, leadTimeSurcharge: gappy })).not.toThrow();
  });

  it.each([
    ['an unknown scope', { scope: 'planet' }],
    ['a window of 0', { bookingWindowDays: 0 }],
    ['a fractional window', { bookingWindowDays: 1.5 }],
    ['a negative minimum notice', { minNoticeMinutes: -1 }],
    ['no tiers', { leadTimeSurcharge: { tiers: [] } }],
    [
      'overlapping tiers',
      { leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: 60, amount: 1 }, { fromMinutes: 30, toMinutes: null, amount: 0 }] } },
    ],
    [
      'unsorted tiers',
      { leadTimeSurcharge: { tiers: [{ fromMinutes: 60, toMinutes: 120, amount: 1 }, { fromMinutes: 0, toMinutes: 60, amount: 2 }] } },
    ],
    [
      'an unbounded tier that is not last',
      { leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 1 }, { fromMinutes: 60, toMinutes: null, amount: 0 }] } },
    ],
    ['a negative start', { leadTimeSurcharge: { tiers: [{ fromMinutes: -5, toMinutes: 60, amount: 1 }] } }],
    ['an empty range', { leadTimeSurcharge: { tiers: [{ fromMinutes: 60, toMinutes: 60, amount: 1 }] } }],
    ['a negative amount', { leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: -1 }] } }],
    ['a fractional amount', { leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 1.5 }] } }],
  ])('rejects %s', (_label, override) => {
    expect(() => new BookingSettings({ ...base, ...override })).toThrow(InvalidConfigurationError);
  });

  it('accepts an optional free-cancellation period and leaves it null when absent', () => {
    expect(new BookingSettings({ ...base, freeCancellationMinutes: 60 }).freeCancellationMinutes).toBe(60);
    expect(new BookingSettings({ ...base, freeCancellationMinutes: 0 }).freeCancellationMinutes).toBe(0);
    expect(new BookingSettings(base).freeCancellationMinutes).toBeNull();
  });

  it.each([-1, 1.5])('rejects a free-cancellation period of %s', (value) => {
    expect(() => new BookingSettings({ ...base, freeCancellationMinutes: value })).toThrow(InvalidConfigurationError);
  });

  it('accepts an optional travel margin and leaves it null when absent', () => {
    expect(new BookingSettings({ ...base, travelBufferMinutes: 30 }).travelBufferMinutes).toBe(30);
    expect(new BookingSettings(base).travelBufferMinutes).toBeNull();
  });

  it.each([-5, 2.5])('rejects a travel margin of %s', (value) => {
    expect(() => new BookingSettings({ ...base, travelBufferMinutes: value })).toThrow(InvalidConfigurationError);
  });

  it('accepts optional goalkeeper penalty values, partial or absent (feature 018)', () => {
    expect(new BookingSettings({ ...base, goalkeeperPenalties: { lateNoticeMinutes: 60 } }).goalkeeperPenalties).toEqual({ lateNoticeMinutes: 60 });
    expect(new BookingSettings(base).goalkeeperPenalties).toBeNull();
  });

  it('accepts an optional check-in window and rejects values out of range (feature 020)', () => {
    expect(new BookingSettings({ ...base, checkInWindow: { closesMinutesAfter: 10 } }).checkInWindow).toEqual({ closesMinutesAfter: 10 });
    expect(new BookingSettings(base).checkInWindow).toBeNull();
    expect(() => new BookingSettings({ ...base, checkInWindow: { opensMinutesBefore: 121 } })).toThrow(/checkInWindow.opensMinutesBefore/);
    expect(() => new BookingSettings({ ...base, checkInWindow: { closesMinutesAfter: 0 } })).toThrow(/checkInWindow.closesMinutesAfter/);
  });

  it.each([0, -1, 2.5])('rejects a penalty value of %s', (value) => {
    expect(() => new BookingSettings({ ...base, goalkeeperPenalties: { weeklyLimit: value } })).toThrow(/goalkeeperPenalties.weeklyLimit/);
  });
});
