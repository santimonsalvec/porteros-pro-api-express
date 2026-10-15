import { describe, expect, it } from 'vitest';
import { City } from '../../../src/domain/locations/city.js';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

const tiers = { tiers: [{ fromMinutes: 0, toMinutes: 180, amount: 5000 }, { fromMinutes: 180, toMinutes: null, amount: 0 }] };
const COLOMBIA = {
  bookingWindowDays: 7,
  minNoticeMinutes: 60,
  freeCancellationMinutes: 60,
  travelBufferMinutes: 30,
  leadTimeSurcharge: tiers,
  goalkeeperPenalties: { lateNoticeMinutes: 120, lateSuspensionDays: 3, weeklyLimit: 3, windowDays: 7, limitSuspensionDays: 7 },
  checkInWindow: { opensMinutesBefore: 30, closesMinutesAfter: 15 },
  noShowGraceMinutes: 60,
};
const CALI = { bookingWindowDays: null, minNoticeMinutes: null, freeCancellationMinutes: null, travelBufferMinutes: 45, leadTimeSurcharge: null };

describe('/admin/booking-settings (admin spec 004, US2)', () => {
  it("saves the country's rules and a city override, auditing who and the before and after", async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const countryBefore = await editor.get('/admin/booking-settings/countries/country-co');
    const country = await editor.put('/admin/booking-settings/countries/country-co', { revision: countryBefore.body.revision, ...COLOMBIA });
    const cityBefore = await editor.get('/admin/booking-settings/cities/city-cali');
    const city = await editor.put('/admin/booking-settings/cities/city-cali', { revision: cityBefore.body.revision, ...CALI });

    expect(countryBefore.body).toMatchObject({ countryName: 'Colombia', currency: 'COP', own: { bookingWindowDays: 2 }, defaults: { travelBufferMinutes: 30 } });
    expect([country.status, country.body.own]).toEqual([200, COLOMBIA]);
    expect(cityBefore.body.revision).toBeNull();
    expect([city.status, city.body.own.travelBufferMinutes, city.body.effective.travelBufferMinutes, city.body.effective.bookingWindowDays]).toEqual([
      200,
      45,
      { value: 45, origin: 'city' },
      { value: 7, origin: 'country' },
    ]);
    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done');
    expect(done.map((entry) => entry.action)).toEqual(['bookingSettings.country.update', 'bookingSettings.city.update']);
    expect(done[0]).toMatchObject({ resourceType: 'bookingSettings', resourceId: 'country-co', before: { own: { bookingWindowDays: 2 } }, after: { own: { bookingWindowDays: 7 } } });
  });

  it('answers each broken value on its own path, tiers included', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;

    const overlap = await editor.put('/admin/booking-settings/countries/country-co', {
      revision,
      ...COLOMBIA,
      leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: 180, amount: 0 }, { fromMinutes: 150, toMinutes: null, amount: 0 }] },
      checkInWindow: { opensMinutesBefore: 121, closesMinutesAfter: 15 },
    });
    const missingField = await editor.put('/admin/booking-settings/countries/country-co', { revision, bookingWindowDays: 7 });
    const countryOnly = await editor.put('/admin/booking-settings/cities/city-cali', { revision: null, ...CALI, noShowGraceMinutes: 60 });

    expect([overlap.status, overlap.body.fieldErrors]).toEqual([
      400,
      { 'leadTimeSurcharge.tiers.1.fromMinutes': 'tier_overlap', 'checkInWindow.opensMinutesBefore': 'out_of_range' },
    ]);
    expect([missingField.status, Object.keys(missingField.body.fieldErrors)]).toContain(400);
    expect([countryOnly.status, Object.keys(countryOnly.body.fieldErrors)]).toEqual([400, ['noShowGraceMinutes']]);
  });

  it('refuses a country change that leaves a city with a notice not above its buffer, naming the city', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;
    await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA });
    await editor.put('/admin/booking-settings/cities/city-cali', { revision: null, ...CALI });

    const lowered = await editor.put('/admin/booking-settings/countries/country-co', { revision: revision + 1, ...COLOMBIA, minNoticeMinutes: 40 });

    expect([lowered.status, lowered.body.error, lowered.body.fieldErrors]).toEqual([400, 'validation_failed', { minNoticeMinutes: 'min_notice_not_above_travel_buffer' }]);
    expect(lowered.body.violations).toEqual([
      { cityId: 'city-cali', cityName: 'Cali', minNoticeMinutes: 40, travelBufferMinutes: 45, origins: { minNoticeMinutes: 'country', travelBufferMinutes: 'city' } },
    ]);
  });

  it('holds back a warned change until confirmed, and refuses a stale one', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;

    const held = await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA, freeCancellationMinutes: 20 });
    const confirmed = await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA, freeCancellationMinutes: 20, acknowledgeWarnings: true });
    const stale = await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA });

    expect([held.status, held.body.error, held.body.warnings[0].code]).toEqual([409, 'warnings_unacknowledged', 'travel_buffer_exceeds_free_cancellation']);
    expect(confirmed.status).toBe(200);
    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
  });

  it('sends a satellite city to its anchor, and reads only with pricing.read', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);
    context.cityRepository.seed(new City({ id: 'city-jamundi', name: 'Jamundí', regionId: 'region-valle', zoneCityId: 'city-cali' }));
    const client = await signInClient(context, 'sub-0408');

    const satellite = await reader.get('/admin/booking-settings/cities/city-jamundi');
    const unknown = await reader.get('/admin/booking-settings/countries/nowhere');
    const write = await reader.put('/admin/booking-settings/cities/city-cali', { revision: null, ...CALI });

    expect([satellite.status, satellite.body.error, satellite.body.anchorCityId]).toEqual([409, 'city_not_anchor', 'city-cali']);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'country_not_found']);
    expect(write.status).toBe(403);
    expect((await as(context, client.token).get('/admin/booking-settings/countries/country-co')).status).toBe(401);
  });
});
