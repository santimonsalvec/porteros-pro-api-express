import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInAdmin, signInGoalkeeper, type TestApp } from '../operatingBalanceTestHelpers.js';

const OVERRIDE = {
  revision: null,
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_cali', environment: 'sandbox' },
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [30000, 60000],
};

const as = (context: TestApp, token: string) => ({
  get: (path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`),
  put: (path: string, body: object) => request(context.app).put(path).set('Authorization', `Bearer ${token}`).send(body),
  post: (path: string) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send({}),
});

async function world() {
  const context = await buildTestApp();
  context.paymentGatewaySettingsRepository.seed();
  const admin = as(context, (await signInAdmin(context)).token);
  return { context, admin };
}

describe('payment gateway settings by market (spec 031, contract E, A8)', () => {
  it("lists the country's settings with each market and its override", async () => {
    const { admin } = await world();
    await admin.put('/admin/payment-gateways/market/city-cali', OVERRIDE);

    const list = await admin.get('/admin/payment-gateways?countryId=country-co');

    expect(list.status).toBe(200);
    expect(list.body.country).toMatchObject({ scope: 'country', refId: 'country-co', amounts: [10000, 20000, 30000, 50000, 100000] });
    expect(list.body.markets).toContainEqual(expect.objectContaining({ marketId: 'city-cali', marketName: 'Cali', settings: expect.objectContaining({ scope: 'market', amounts: [30000, 60000] }) }));
    expect(list.body.markets).toContainEqual({ marketId: 'city-bogota', marketName: 'Bogotá', settings: null });
  });

  it("lets the market's goalkeepers see its amounts, and back to the country's once removed", async () => {
    const { context, admin } = await world();
    const goalkeeper = as(context, (await signInGoalkeeper(context, 'sub-3601')).token);

    await admin.put('/admin/payment-gateways/market/city-cali', OVERRIDE);
    const overridden = await goalkeeper.get('/goalkeepers/me/operating-balance/deposit-options');
    const removed = await admin.post('/admin/payment-gateways/market/city-cali/delete');
    const back = await goalkeeper.get('/goalkeepers/me/operating-balance/deposit-options');
    const again = await admin.post('/admin/payment-gateways/market/city-cali/delete');

    expect(overridden.body.options.map((option: { amount: number }) => option.amount)).toEqual([30000, 60000]);
    expect(removed.status).toBe(204);
    expect(back.body.options.map((option: { amount: number }) => option.amount)).toEqual([10000, 20000, 30000, 50000, 100000]);
    expect(again.status).toBe(404);
  });

  it('refuses a zone, an unknown market and an unknown country', async () => {
    const { admin } = await world();

    expect((await admin.put('/admin/payment-gateways/zone/zone-cali-norte', OVERRIDE)).body.error).toBe('invalid_scope');
    expect((await admin.get('/admin/payment-gateways/zone/zone-cali-norte')).status).toBe(400);
    expect((await admin.put('/admin/payment-gateways/market/nowhere', OVERRIDE)).status).toBe(404);
    expect((await admin.get('/admin/payment-gateways?countryId=nowhere')).status).toBe(404);
  });
});
