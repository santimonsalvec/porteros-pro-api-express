import { describe, expect, it } from 'vitest';
import { BookingSettings, type LeadTimeSurcharge } from '../../../../../src/domain/pricing/bookingSettings.js';
import { resolveBookingSettings } from '../../../../../src/application/features/goalkeeperRequests/common/resolveBookingSettings.js';

const cop: LeadTimeSurcharge = {
  tiers: [
    { fromMinutes: 0, toMinutes: 60, amount: 10000 },
    { fromMinutes: 60, toMinutes: 120, amount: 5000 },
    { fromMinutes: 120, toMinutes: null, amount: 0 },
  ],
};
const mxn: LeadTimeSurcharge = { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 30 }] };

function country(fields: Partial<ConstructorParameters<typeof BookingSettings>[0]> = {}): BookingSettings {
  return new BookingSettings({
    id: 'country-doc',
    scope: 'country',
    refId: 'country-co',
    bookingWindowDays: 2,
    minNoticeMinutes: 30,
    leadTimeSurcharge: cop,
    ...fields,
  });
}

function city(fields: Partial<ConstructorParameters<typeof BookingSettings>[0]> = {}): BookingSettings {
  return new BookingSettings({ id: 'city-doc', scope: 'city', refId: 'city-a', ...fields });
}

describe('resolveBookingSettings', () => {
  it('uses the country values when the city defines none', () => {
    const resolved = resolveBookingSettings({ city: null, country: country() });
    expect(resolved).toEqual({ bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: cop, missing: [] });
  });

  it('lets a city value win over the country value', () => {
    const resolved = resolveBookingSettings({ city: city({ bookingWindowDays: 4 }), country: country() });
    expect(resolved.bookingWindowDays).toBe(4);
  });

  it('resolves each setting independently — a partial city override inherits the rest', () => {
    const resolved = resolveBookingSettings({ city: city({ leadTimeSurcharge: mxn }), country: country() });
    expect(resolved.leadTimeSurcharge).toBe(mxn);
    expect(resolved.bookingWindowDays).toBe(2);
    expect(resolved.minNoticeMinutes).toBe(30);
    expect(resolved.missing).toEqual([]);
  });

  it('can be satisfied entirely by the city when there is no country document', () => {
    const full = city({ bookingWindowDays: 3, minNoticeMinutes: 45, leadTimeSurcharge: cop });
    expect(resolveBookingSettings({ city: full, country: null }).missing).toEqual([]);
  });

  it('reports every setting defined at neither level, by name', () => {
    expect(resolveBookingSettings({ city: null, country: null })).toEqual({
      bookingWindowDays: null,
      minNoticeMinutes: null,
      leadTimeSurcharge: null,
      missing: ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge'],
    });
  });

  it('reports only the settings that are absent', () => {
    const resolved = resolveBookingSettings({ city: null, country: country({ bookingWindowDays: null }) });
    expect(resolved.missing).toEqual(['bookingWindowDays']);
    expect(resolved.minNoticeMinutes).toBe(30);
  });

  it('treats a minimum notice of 0 as defined, not missing', () => {
    const resolved = resolveBookingSettings({ city: city({ minNoticeMinutes: 0 }), country: country() });
    expect(resolved.minNoticeMinutes).toBe(0);
    expect(resolved.missing).toEqual([]);
  });
});
