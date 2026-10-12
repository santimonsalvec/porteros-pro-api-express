import { describe, expect, it } from 'vitest';
import { resolveBookingSettingsWithOrigin } from '../../../../../src/application/features/goalkeeperRequests/common/resolveBookingSettings.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';

const tiers = { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 0 }] };
const country = new BookingSettings({
  id: 'co',
  scope: 'country',
  refId: 'country-co',
  bookingWindowDays: 7,
  minNoticeMinutes: 60,
  leadTimeSurcharge: tiers,
  travelBufferMinutes: 30,
});
const city = new BookingSettings({ id: 'med', scope: 'city', refId: 'city-med', travelBufferMinutes: 45, bookingWindowDays: 3 });

describe('resolveBookingSettingsWithOrigin', () => {
  it("says, field by field, whether the value is the city's, the country's or a default", () => {
    expect(resolveBookingSettingsWithOrigin({ city, country })).toEqual({
      bookingWindowDays: { value: 3, origin: 'city' },
      minNoticeMinutes: { value: 60, origin: 'country' },
      leadTimeSurcharge: { value: tiers, origin: 'country' },
      travelBufferMinutes: { value: 45, origin: 'city' },
      freeCancellationMinutes: { value: 60, origin: 'default' },
    });
  });

  it('defaults the travel buffer to 30 when nobody sets it', () => {
    expect(resolveBookingSettingsWithOrigin({ city: null, country: null }).travelBufferMinutes).toEqual({ value: 30, origin: 'default' });
  });

  it('leaves a required value missing, with no origin', () => {
    expect(resolveBookingSettingsWithOrigin({ city: null, country: null })).toMatchObject({
      bookingWindowDays: { value: null, origin: null },
      minNoticeMinutes: { value: null, origin: null },
      leadTimeSurcharge: { value: null, origin: null },
    });
  });
});
