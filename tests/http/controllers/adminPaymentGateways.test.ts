import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInAdmin, signInClient } from '../walletTestHelpers.js';

const VALID = {
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_abc', environment: 'sandbox' },
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [10000, 20000, 30000, 50000, 100000],
};

describe('/api/admin/payment-gateways/{countryId} — US5: an administrator chooses each country\'s gateway', () => {
  it('saves Colombia\'s settings and reads them back, without any secret', async () => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    const missing = await request(context.app).get('/api/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`);
    const saved = await request(context.app).put('/api/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`).send(VALID);
    const read = await request(context.app).get('/api/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`);

    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('settings_not_found');
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ countryId: 'country-co', gateway: 'wompi', currency: 'COP', amounts: VALID.amounts, updatedBy: 'admin-1' });
    expect(read.body).toEqual(saved.body);
    expect(JSON.stringify(read.body)).not.toMatch(/prv_|_events_|_integrity_/);
  });

  it.each<[string, object]>([
    ['an unsupported gateway', { ...VALID, gateway: 'stripe' }],
    ['a production key in sandbox', { ...VALID, publicConfig: { publicKey: 'pub_prod_abc', environment: 'sandbox' } }],
    ['no amounts', { ...VALID, amounts: [] }],
    ['a fractional amount', { ...VALID, amounts: [10000.5] }],
    ['a secret field', { ...VALID, publicConfig: { ...VALID.publicConfig, privateKey: 'prv_test_x' } }],
  ])('400 for %s', async (_label, body) => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    const response = await request(context.app).put('/api/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
  });

  it('404 for an unknown country, 403 for a non-administrator', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);
    const client = await signInClient(context, 'sub-2221');

    const unknown = await request(context.app).put('/api/admin/payment-gateways/nowhere').set('Authorization', `Bearer ${admin.token}`).send(VALID);
    const forbidden = await request(context.app).put('/api/admin/payment-gateways/country-co').set('Authorization', `Bearer ${client.token}`).send(VALID);

    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('country_not_found');
    expect(forbidden.status).toBe(403);
  });
});
