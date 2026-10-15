import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInAdmin, signInClient } from '../operatingBalanceTestHelpers.js';

// Admin spec 007 (FR-025): every save names the revision it read; `null` creates the country's first.
const VALID = {
  revision: null,
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_abc', environment: 'sandbox' },
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [10000, 20000, 30000, 50000, 100000],
};

describe('/admin/payment-gateways/{countryId} — US5: an administrator chooses each country\'s gateway', () => {
  it('saves Colombia\'s settings and reads them back, without any secret', async () => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    const missing = await request(context.app).get('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`);
    const saved = await request(context.app).put('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`).send(VALID);
    const read = await request(context.app).get('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`);

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

    const response = await request(context.app).put('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
  });

  it('404 for an unknown country, 401 for an app token (spec 001: other audience)', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);
    const client = await signInClient(context, 'sub-2221');

    const unknown = await request(context.app).put('/admin/payment-gateways/nowhere').set('Authorization', `Bearer ${admin.token}`).send(VALID);
    const forbidden = await request(context.app).put('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${client.token}`).send(VALID);

    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('country_not_found');
    expect(forbidden.status).toBe(401);
  });
});

describe('/admin/payment-gateways/{countryId} — admin spec 007: revision and credentials (FR-012, FR-025)', () => {
  async function saved() {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);
    const put = (body: object) => request(context.app).put('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`).send(body);
    const get = () => request(context.app).get('/admin/payment-gateways/country-co').set('Authorization', `Bearer ${token}`);
    expect((await put(VALID)).status).toBe(200);
    return { context, put, get };
  }

  it('reads the revision and whether the credentials are loaded, and moves the revision on each save', async () => {
    const { put, get } = await saved();

    expect((await get()).body).toMatchObject({ revision: 0, credentialsPresent: true });
    const next = await put({ ...VALID, revision: 0, amounts: [20000] });
    expect(next.status).toBe(200);
    expect(next.body).toMatchObject({ revision: 1, amounts: [20000] });
  });

  it('refuses a save without revision, with an old one, and a create over existing settings', async () => {
    const { put, get } = await saved();
    const withoutRevision: Partial<typeof VALID> = { ...VALID };
    delete withoutRevision.revision;

    const missing = await put(withoutRevision);
    expect(missing.status).toBe(400);
    expect(missing.body.fieldErrors).toHaveProperty('revision');
    await put({ ...VALID, revision: 0 });
    for (const revision of [0, null]) {
      const response = await put({ ...VALID, revision, amounts: [30000] });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('stale_revision');
    }
    expect((await get()).body).toMatchObject({ revision: 1, amounts: VALID.amounts });
  });

  it('says when the credentials are missing, never their value', async () => {
    const { context, get } = await saved();
    context.paymentSecrets.secrets.clear();
    const read = await get();
    expect(read.body.credentialsPresent).toBe(false);
    expect(JSON.stringify(read.body)).not.toMatch(/prv_|_events_|_integrity_/);
  });

  it('audits the change with the before and the after, without secrets', async () => {
    const { context, put } = await saved();
    context.adminAuditLog.entries.length = 0;

    await put({ ...VALID, revision: 0, amounts: [20000] });

    const [entry] = context.adminAuditLog.entries;
    expect(entry).toMatchObject({ action: 'paymentGatewaySettings.update', before: { revision: 0 }, after: { revision: 1, amounts: [20000], credentialsPresent: true } });
    expect(JSON.stringify(entry)).not.toMatch(/publicKey|prv_|secret/i);
  });
});
