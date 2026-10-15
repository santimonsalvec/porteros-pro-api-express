import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper } from '../operatingBalanceTestHelpers.js';
import { POINTS } from '../../fixtures/quoteFixtures.js';

type Context = Awaited<ReturnType<typeof buildTestApp>>;

/**
 * What the admin saves is what the app quotes next (admin spec 004, FR-024): the quote's own code
 * and tests stay untouched; these only show the effect of admin writes on it.
 */
async function quoteAt(context: Context, token: string, point: { latitude: number; longitude: number }, fields: Record<string, unknown>) {
  return request(context.app)
    .post('/goalkeeper-requests/quote')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...point, startsAt: '2026-09-21T15:00:00', goalkeeperCount: 1, durationMinutes: 90, modality: 'any', level: 'recreational', surfaceId: 'synthetic_grass', ...fields });
}

describe('admin price writes reach the quote (admin spec 004)', () => {
  it('quotes with the rates the admin creates, and stops using one it deletes', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0402');

    const before = await quoteAt(context, client.token, POINTS.caliSur, {});
    const zoneRate = await editor.post('/admin/rental-rates', { scope: 'zone', refId: 'zone-cali-sur', durationMinutes: 90, amount: 60000 });
    await editor.post('/admin/rental-rates', { scope: 'city', refId: 'city-cali', durationMinutes: 90, modality: 'futbol_11', level: 'competitive', amount: 70000 });
    const zone = await quoteAt(context, client.token, POINTS.caliSur, {});
    const futbol11 = await quoteAt(context, client.token, POINTS.caliCentro, { modality: 'futbol_11', level: 'competitive' });
    const general = await quoteAt(context, client.token, POINTS.caliCentro, {});
    await editor.post(`/admin/rental-rates/${zoneRate.body.id}/delete`, { reason: 'Vuelve al precio de la ciudad' });
    const afterDelete = await quoteAt(context, client.token, POINTS.caliSur, {});

    expect(before.body.unitRate).toBe(56000);
    expect(zone.body.unitRate).toBe(60000);
    expect(futbol11.body.unitRate).toBe(70000);
    expect(general.body.unitRate).toBe(56000);
    expect(afterDelete.body.unitRate).toBe(56000);
  });

  it('a duration whose last rate is deleted can no longer be quoted', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0403');
    const cityRate120 = (await editor.get('/admin/rental-rates?cityId=city-cali&durationMinutes=120')).body.items.find(
      (item: { scope: string }) => item.scope === 'city',
    );

    const before = await quoteAt(context, client.token, POINTS.caliCentro, { durationMinutes: 120 });
    await editor.post(`/admin/rental-rates/${cityRate120.id}/delete`, { reason: 'Sin partidos de 2 h' });
    const after = await quoteAt(context, client.token, POINTS.caliCentro, { durationMinutes: 120 });

    expect([before.status, before.body.unitRate]).toEqual([200, 71000]);
    expect([after.status, after.body.error]).toEqual([422, 'rate_not_configured']);
  });
});

describe('admin commission writes reach the bookings (admin spec 004)', () => {
  it('a new booking carries the zone commission, which a later change does not touch', async () => {
    const context = await buildTestApp();
    context.clock.set(MATCH_NOW);
    const { editor } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0405');
    const goalkeeper = await signInGoalkeeper(context, 'sub-0406');
    await context.operatingBalanceLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 30000, reason: 'Saldo de pruebas', operationKey: 'k-e1' });
    const available = () => request(context.app).get('/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${goalkeeper.token}`);

    const created = await editor.post('/admin/commissions', { scope: 'zone', refId: 'zone-cali-norte', amount: 9000 });
    await createRequestAsClient(context, client.token);
    const first = await available();
    await editor.patch(`/admin/commissions/${created.body.id}`, { revision: 0, amount: 9500 });
    const afterChange = await available();

    expect(first.body.items[0].commission).toBe(9000);
    expect(afterChange.body.items[0].commission).toBe(9000);
  });

  it('without any commission the zone can no longer be quoted', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0407');

    await editor.post('/admin/commissions/commission-country-co/delete', { reason: 'Prueba sin comisión' });
    const quote = await quoteAt(context, client.token, POINTS.caliNorte, {});

    expect([quote.body.error, quote.body.missing]).toEqual(['service_not_configured', ['commission']]);
  });
});

describe('admin booking-rule writes reach the quote (admin spec 004)', () => {
  const tiers = { tiers: [{ fromMinutes: 0, toMinutes: 180, amount: 5000 }, { fromMinutes: 180, toMinutes: null, amount: 0 }] };
  const COLOMBIA = {
    bookingWindowDays: 7,
    minNoticeMinutes: 60,
    freeCancellationMinutes: 60,
    travelBufferMinutes: 30,
    leadTimeSurcharge: tiers,
    goalkeeperPenalties: null,
    checkInWindow: null,
    noShowGraceMinutes: null,
  };

  it('quotes with the window, notice and surcharge the admin saves', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0409');
    const in4Days = { startsAt: '2026-09-25T15:00:00' };

    const beforeWindow = await quoteAt(context, client.token, POINTS.caliNorte, in4Days);
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;
    await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA });
    const afterWindow = await quoteAt(context, client.token, POINTS.caliNorte, in4Days);
    const tooSoon = await quoteAt(context, client.token, POINTS.caliNorte, { startsAt: '2026-09-21T13:30:00' });
    const inTwoHours = await quoteAt(context, client.token, POINTS.caliNorte, { startsAt: '2026-09-21T15:00:00' });

    expect(beforeWindow.body.error).toBe('outside_booking_window');
    expect([afterWindow.status, afterWindow.body.unitSurcharge]).toEqual([200, 0]);
    expect([tooSoon.body.error, tooSoon.body.minNoticeMinutes]).toEqual(['insufficient_notice', 60]);
    expect(inTwoHours.body.unitSurcharge).toBe(5000);
  });

  it("a city override wins over the country's value, field by field", async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0410');
    const { revision } = (await editor.get('/admin/booking-settings/countries/country-co')).body;
    await editor.put('/admin/booking-settings/countries/country-co', { revision, ...COLOMBIA });

    await editor.put('/admin/booking-settings/cities/city-cali', {
      revision: null,
      bookingWindowDays: 1,
      minNoticeMinutes: null,
      freeCancellationMinutes: null,
      travelBufferMinutes: null,
      leadTimeSurcharge: null,
    });
    const tomorrow = await quoteAt(context, client.token, POINTS.caliNorte, { startsAt: '2026-09-22T15:00:00' });
    const tooSoon = await quoteAt(context, client.token, POINTS.caliNorte, { startsAt: '2026-09-21T13:30:00' });

    expect([tomorrow.body.error, tomorrow.body.bookingWindowDays]).toEqual(['outside_booking_window', 1]);
    expect(tooSoon.body.minNoticeMinutes).toBe(60);
  });
});
