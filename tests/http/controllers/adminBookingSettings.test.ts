import { describe, expect, it } from 'vitest';
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
  offerReminderIntervalMinutes: 10,
  offerMaxReminders: 2,
};
const CALI = {
  bookingWindowDays: null,
  minNoticeMinutes: null,
  freeCancellationMinutes: null,
  travelBufferMinutes: 45,
  leadTimeSurcharge: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
  offerReminderIntervalMinutes: null,
  offerMaxReminders: null,
};

describe('/admin/booking-settings (admin spec 004, US2)', () => {
  it("saves the country's rules and a city override, auditing who and the before and after", async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const countryBefore = await editor.get('/admin/booking-settings/countries/country-co');
    const country = await editor.put('/admin/booking-settings/countries/country-co', { revision: countryBefore.body.revision, ...COLOMBIA });
    const cityBefore = await editor.get('/admin/booking-settings/markets/city-cali');
    const city = await editor.put('/admin/booking-settings/markets/city-cali', { revision: cityBefore.body.revision, ...CALI });

    expect(countryBefore.body).toMatchObject({ countryName: 'Colombia', currency: 'COP', own: { bookingWindowDays: 2 }, defaults: { travelBufferMinutes: 30 } });
    expect([country.status, country.body.own]).toEqual([200, COLOMBIA]);
    expect(cityBefore.body.revision).toBeNull();
    expect([city.status, city.body.own.travelBufferMinutes, city.body.effective.travelBufferMinutes, city.body.effective.bookingWindowDays]).toEqual([
      200,
      45,
      { value: 45, origin: 'market' },
      { value: 7, origin: 'country' },
    ]);
    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done');
    expect(done.map((entry) => entry.action)).toEqual(['bookingSettings.country.update', 'bookingSettings.market.update']);
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
    const countryOnly = await editor.put('/admin/booking-settings/markets/city-cali', { revision: null, ...CALI, goalkeeperPenalties: { weeklyLimit: 3 } });

    expect([overlap.status, overlap.body.fieldErrors]).toEqual([
      400,
      { 'leadTimeSurcharge.tiers.1.fromMinutes': 'tier_overlap', 'checkInWindow.opensMinutesBefore': 'out_of_range' },
    ]);
    expect([missingField.status, Object.keys(missingField.body.fieldErrors)]).toContain(400);
    expect([countryOnly.status, countryOnly.body.fieldErrors]).toEqual([400, { goalkeeperPenalties: 'field_not_allowed_at_level' }]);
  });

  it('refuses a country change that leaves a city with a notice not above its buffer, naming the city', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;
    await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA });
    await editor.put('/admin/booking-settings/markets/city-cali', { revision: null, ...CALI });

    const lowered = await editor.put('/admin/booking-settings/countries/country-co', { revision: revision + 1, ...COLOMBIA, minNoticeMinutes: 40 });

    expect([lowered.status, lowered.body.error, lowered.body.fieldErrors]).toEqual([400, 'validation_failed', { minNoticeMinutes: 'min_notice_not_above_travel_buffer' }]);
    expect(lowered.body.violations).toEqual([
      { marketId: 'city-cali', marketName: 'Cali', minNoticeMinutes: 40, travelBufferMinutes: 45, origins: { minNoticeMinutes: 'country', travelBufferMinutes: 'market' } },
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

  it('answers an unknown market, and reads only with pricing.read', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0408');

    const missing = await reader.get('/admin/booking-settings/markets/nowhere');
    const unknown = await reader.get('/admin/booking-settings/countries/nowhere');
    const write = await reader.put('/admin/booking-settings/markets/city-cali', { revision: null, ...CALI });

    expect([missing.status, missing.body.error]).toEqual([404, 'market_not_found']);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'country_not_found']);
    expect(write.status).toBe(403);
    expect((await as(context, client.token).get('/admin/booking-settings/countries/country-co')).status).toBe(401);
  });
});

describe('/admin/booking-settings by market (spec 031, US2)', () => {
  it('lets a market set its check-in, no-show and reminder values, and names where each value comes from', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;
    await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA, offerReminderIntervalMinutes: null });

    const saved = await editor.put('/admin/booking-settings/markets/city-cali', {
      revision: null,
      ...CALI,
      checkInWindow: { opensMinutesBefore: 45, closesMinutesAfter: null },
      noShowGraceMinutes: 90,
      offerMaxReminders: 1,
    });

    expect(saved.status).toBe(200);
    expect(saved.body.own).toMatchObject({ checkInWindow: { opensMinutesBefore: 45 }, noShowGraceMinutes: 90, offerMaxReminders: 1 });
    expect(saved.body.effective).toMatchObject({
      bookingWindowDays: { value: 7, origin: 'country' },
      noShowGraceMinutes: { value: 90, origin: 'market' },
      offerMaxReminders: { value: 1, origin: 'market' },
      offerReminderIntervalMinutes: { value: 5, origin: 'platform' },
      checkInWindow: { opensMinutesBefore: { value: 45, origin: 'market' }, closesMinutesAfter: { value: 15, origin: 'country' } },
    });
  });

  it('shows the offer reminders among the country values and their platform defaults', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const country = await editor.get('/admin/booking-settings/countries/country-co');

    expect(country.body.own).toMatchObject({ offerReminderIntervalMinutes: null, offerMaxReminders: null });
    expect(country.body.defaults).toMatchObject({ offerReminderIntervalMinutes: 5, offerMaxReminders: 3 });
  });

  it('refuses reminder values out of range', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const broken = await editor.put('/admin/booking-settings/markets/city-cali', { revision: null, ...CALI, offerReminderIntervalMinutes: 0, offerMaxReminders: 11 });

    expect([broken.status, broken.body.fieldErrors]).toEqual([400, { offerReminderIntervalMinutes: 'out_of_range', offerMaxReminders: 'out_of_range' }]);
  });

  it('no longer answers the city route', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    expect((await editor.get('/admin/booking-settings/cities/city-cali')).status).toBe(404);
  });
});
