import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { City } from '../../../src/domain/locations/city.js';
import { COLOMBIA_SIIGO_CONFIG } from '../../fakes/fakeInvoicingSettingsRepository.js';
import { TEST_INVOICING_CREDENTIALS } from '../../fakes/fakeInvoicingSecrets.js';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInAdmin, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

function admin(context: TestApp, token: string) {
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  return {
    getTax: (countryId: string) => auth(request(context.app).get(`/admin/tax-settings/${countryId}`)),
    putTax: (countryId: string, body: unknown) => auth(request(context.app).put(`/admin/tax-settings/${countryId}`).send(body as object)),
    getInvoicing: (countryId: string) => auth(request(context.app).get(`/admin/invoicing/settings/${countryId}`)),
    putInvoicing: (countryId: string, body: unknown) => auth(request(context.app).put(`/admin/invoicing/settings/${countryId}`).send(body as object)),
    documents: (query = '') => auth(request(context.app).get(`/admin/invoicing/documents${query}`)),
    retry: (documentId: string) => auth(request(context.app).post(`/admin/invoicing/documents/${documentId}/retry`)),
  };
}

describe('/admin/tax-settings/{countryId} — US4: VAT per country', () => {
  it('sets Colombia at 19 % and reads it back; it applies to the next acceptance', async () => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    expect((await admin(context, token).getTax('country-co')).status).toBe(404);
    const saved = await admin(context, token).putTax('country-co', { vatRateBps: 1900 });

    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ countryId: 'country-co', vatRateBps: 1900, vatRatePercent: 19, updatedBy: 'admin-1' });
    expect((await admin(context, token).getTax('country-co')).body).toEqual(saved.body);
  });

  it.each([[{ vatRateBps: 10001 }], [{ vatRateBps: 19.5 }], [{}], [{ vatRateBps: 1900, extra: 1 }]])('400 for %j', async (body) => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    expect((await admin(context, token).putTax('country-co', body)).status).toBe(400);
  });

  it('404 for an unknown country and 401 for an app token (spec 001: other audience)', async () => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);
    const client = await signInClient(context, 'sub-2311');

    expect((await admin(context, token).putTax('nowhere', { vatRateBps: 1900 })).status).toBe(404);
    expect((await admin(context, client.token).putTax('country-co', { vatRateBps: 1900 })).status).toBe(401);
  });
});

describe('/admin/invoicing/settings/{countryId} — US4: the provider of each country', () => {
  it('saves Colombia with Siigo, says whether its credentials exist, and never shows them', async () => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    const saved = await admin(context, token).putInvoicing('country-co', { provider: 'siigo', config: COLOMBIA_SIIGO_CONFIG });
    context.invoicingSecrets.credentials.clear();
    const read = await admin(context, token).getInvoicing('country-co');

    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ countryId: 'country-co', provider: 'siigo', config: COLOMBIA_SIIGO_CONFIG, credentialsPresent: true });
    expect(read.body).toMatchObject({ provider: 'siigo', credentialsPresent: false });
    expect(JSON.stringify([saved.body, read.body])).not.toContain(TEST_INVOICING_CREDENTIALS.accessKey);
  });

  it.each<[string, object]>([
    ['an unsupported provider', { provider: 'alegra', config: COLOMBIA_SIIGO_CONFIG }],
    ['a missing field', { provider: 'siigo', config: { ...COLOMBIA_SIIGO_CONFIG, sellerId: undefined } }],
    ['a secret-like key', { provider: 'siigo', config: { ...COLOMBIA_SIIGO_CONFIG, accessKey: 'x' } }],
  ])('400 for %s', async (_label, body) => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);

    const response = await admin(context, token).putInvoicing('country-co', body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
  });
});

describe('/admin/invoicing/documents — US4: watching invoicing and retrying failures', () => {
  it('shows a rejected invoice with its reason, and retries it after its city gets its DANE codes', async () => {
    const context = await buildTestApp({ eventsMode: 'local' });
    context.clock.set(MATCH_NOW);
    context.invoicingSettingsRepository.seed();
    const { token } = await signInAdmin(context);
    const client = await signInClient(context, 'sub-2312');
    const goalkeeper = await signInGoalkeeper(context, 'sub-2313');
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-1' });
    const bookingId = (await createRequestAsClient(context, client.token)).bookings[0]!.bookingId;
    context.invoicingProvider.script('invalid');
    await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${goalkeeper.token}`);

    const rejected = await admin(context, token).documents('?status=rejected');
    expect(rejected.body).toMatchObject({
      totalItems: 1,
      items: [{ status: 'rejected', goalkeeperId: goalkeeper.userId, provider: 'siigo', lastError: { kind: 'rejected', code: 'provider_validation' }, stale: false }],
    });

    // The data is fixed (here: the city's official codes), then the administrator retries.
    context.cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'America/Bogota', daneStateCode: '76', daneCityCode: '76001' }));
    const documentId = rejected.body.items[0].documentId as string;
    const retried = await admin(context, token).retry(documentId);
    const again = await admin(context, token).retry(documentId);

    expect(retried.status).toBe(202);
    expect(retried.body).toMatchObject({ documentId, status: 'issued' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('document_not_retryable');
    expect(context.invoicingProvider.invoices()).toHaveLength(2);
  });

  it('404 for an unknown document and 401 for an app token (spec 001: other audience)', async () => {
    const context = await buildTestApp();
    const { token } = await signInAdmin(context);
    const client = await signInClient(context, 'sub-2314');

    expect((await admin(context, token).retry('unknown')).status).toBe(404);
    expect((await admin(context, client.token).documents()).status).toBe(401);
  });
});
