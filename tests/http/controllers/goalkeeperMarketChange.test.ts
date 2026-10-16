import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { signInAdmin, signInGoalkeeper } from '../operatingBalanceTestHelpers.js';
import { buildRequest, buildRequestBookings } from '../../fixtures/quoteFixtures.js';

type Context = Awaited<ReturnType<typeof buildTestApp>>;

const change = (context: Context, token: string, body: object) =>
  request(context.app).post('/goalkeepers/me/market-change').set('Authorization', `Bearer ${token}`).send(body);

describe('POST /goalkeepers/me/market-change (spec 031, A7)', () => {
  it('moves the goalkeeper to another market of the country with its zones', async () => {
    const context = await buildTestApp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-3301');

    const moved = await change(context, goalkeeper.token, { marketId: 'city-medellin', zoneIds: ['zone-bello'] });
    const me = await request(context.app).get('/goalkeepers/me').set('Authorization', `Bearer ${goalkeeper.token}`);

    expect(moved.status).toBe(200);
    expect(moved.body.goalkeeper).toMatchObject({ marketId: 'city-medellin', serviceZoneIds: ['zone-bello'], market: { id: 'city-medellin', name: 'Medellín' } });
    expect(me.body).toMatchObject({ marketId: 'city-medellin', market: { name: 'Medellín' } });
  });

  it('refuses the current market, another market’s zones and a held booking', async () => {
    const context = await buildTestApp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-3302');

    const same = await change(context, goalkeeper.token, { marketId: 'city-cali', zoneIds: ['zone-cali-norte'] });
    const zones = await change(context, goalkeeper.token, { marketId: 'city-medellin', zoneIds: ['zone-cali-sur'] });
    const [booking] = buildRequestBookings(buildRequest('r-held', new Date('2026-12-01T20:00:00.000Z'), { marketId: 'city-cali', zoneId: 'zone-cali-norte' }));
    context.bookingRepository.seed(booking!.assign(goalkeeper.userId, new Date()));
    const held = await change(context, goalkeeper.token, { marketId: 'city-medellin', zoneIds: ['zone-bello'] });

    expect([same.status, same.body.error]).toEqual([409, 'same_market']);
    expect([zones.status, zones.body.error, zones.body.invalidZoneIds]).toEqual([400, 'invalid_zones', ['zone-cali-sur']]);
    expect([held.status, held.body.error, held.body.bookingIds]).toEqual([409, 'pending_bookings', [booking!.id]]);
  });

  it('to another country, refuses an operating balance that is not zero, saying how much', async () => {
    const context = await buildTestApp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-3303');
    await context.operatingBalanceStore.append({
      id: 'mv-adjust',
      goalkeeperId: goalkeeper.userId,
      type: 'admin_adjustment',
      amount: 20000,
      currency: 'COP',
      occurredAt: new Date(),
      causeKey: 'adjustment:test',
      actor: { kind: 'admin', userId: 'staff-1' },
      references: {},
      cancellation: null,
      reason: 'Prueba',
      invoicing: { documentType: 'CC', documentNumber: '1020304050' },
      marketId: 'city-cali',
    });

    const refused = await change(context, goalkeeper.token, { marketId: 'city-cdmx', zoneIds: ['zone-cdmx'] });

    expect([refused.status, refused.body.error, refused.body.balance, refused.body.currency]).toEqual([409, 'balance_not_zero', 20000, 'COP']);
  });

  it('keeps PUT /profile/availability to the zones of the current market', async () => {
    const context = await buildTestApp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-3304');
    const put = (body: object) => request(context.app).put('/goalkeepers/me/profile/availability').set('Authorization', `Bearer ${goalkeeper.token}`).send(body);

    const other = await put({ marketId: 'city-medellin', zoneIds: ['zone-bello'] });
    const zonesOnly = await put({ zoneIds: ['zone-cali-sur'] });

    expect([other.status, other.body.error]).toEqual([409, 'use_market_change']);
    expect([zonesOnly.status, zonesOnly.body.marketId, zonesOnly.body.serviceZoneIds]).toEqual([200, 'city-cali', ['zone-cali-sur']]);
  });

  it('has no admin route to move a goalkeeper (FR-025)', async () => {
    const context = await buildTestApp();
    const admin = as(context, (await signInAdmin(context)).token);
    const goalkeeper = await signInGoalkeeper(context, 'sub-3305');

    for (const path of [`/admin/goalkeepers/${goalkeeper.userId}/market-change`, `/admin/goalkeepers/${goalkeeper.userId}/market`]) {
      expect((await admin.post(path, { marketId: 'city-medellin', zoneIds: ['zone-bello'] })).status).toBe(404);
    }
  });
});
