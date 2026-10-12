import { describe, expect, it } from 'vitest';
import { City } from '../../../src/domain/locations/city.js';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { signInClient } from '../walletTestHelpers.js';

const CALI_90_FUTBOL_11 = { scope: 'city', refId: 'city-cali', durationMinutes: 90, modality: 'futbol_11', level: 'competitive', amount: 70000 };

describe('/admin/rental-rates (admin spec 004, US1)', () => {
  it('creates, edits the amount and deletes a rate, auditing who and the before and after', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const created = await editor.post('/admin/rental-rates', CALI_90_FUTBOL_11);
    const id = created.body.id as string;
    const read = await editor.get(`/admin/rental-rates/${id}`);
    const edited = await editor.patch(`/admin/rental-rates/${id}`, { revision: 0, amount: 72000 });
    const impact = await editor.get(`/admin/rental-rates/${id}/delete-impact`);
    const deleted = await editor.post(`/admin/rental-rates/${id}/delete`, { reason: 'Precio de prueba' });
    const gone = await editor.get(`/admin/rental-rates/${id}`);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...CALI_90_FUTBOL_11, revision: 0, currency: 'COP', cityName: 'Cali', countryId: 'country-co', targetValid: true });
    expect(read.body.id).toBe(id);
    expect([edited.status, edited.body.amount, edited.body.revision]).toEqual([200, 72000, 1]);
    expect(impact.body).toEqual({ zoneCount: 0, zoneNames: [] });
    expect(deleted.status).toBe(204);
    expect(gone.status).toBe(404);

    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done');
    expect(done.map((entry) => entry.action)).toEqual(['rentalRate.create', 'rentalRate.update', 'rentalRate.delete']);
    expect(done[1]).toMatchObject({
      permission: 'pricing.manage',
      resourceType: 'rentalRate',
      resourceId: id,
      actor: { staffId: expect.any(String) },
      before: { amount: 70000 },
      after: { amount: 72000 },
    });
    expect(done[0]).toMatchObject({ resourceId: id });
    expect(done[2]?.request).toMatchObject({ reason: 'Precio de prueba' });
  });

  it("lists a city's rates by duration, city first, with their amount and currency", async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);

    const listed = await reader.get('/admin/rental-rates?cityId=city-cali&durationMinutes=60');

    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { scope: string; refId: string; amount: number }) => [item.scope, item.refId, item.amount])).toEqual([
      ['city', 'city-cali', 41000],
      ['zone', 'zone-cali-norte', 40000],
      ['zone', 'zone-cali-sur', 45000],
    ]);
    expect(listed.body).toMatchObject({ page: 1, totalItems: 3, totalPages: 1 });
  });

  it('answers every refusal with its code', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    context.cityRepository.seed(new City({ id: 'city-jamundi', name: 'Jamundí', regionId: 'region-valle', zoneCityId: 'city-cali' }));
    const existing = (await editor.get('/admin/rental-rates?cityId=city-cali&durationMinutes=60&modality=general')).body.items[0];

    const fieldErrors = await editor.post('/admin/rental-rates', { ...CALI_90_FUTBOL_11, modality: null, amount: 1.5 });
    const levelAlone = await editor.post('/admin/rental-rates', { ...CALI_90_FUTBOL_11, modality: null });
    const satellite = await editor.post('/admin/rental-rates', { ...CALI_90_FUTBOL_11, refId: 'city-jamundi' });
    const noCity = await editor.post('/admin/rental-rates', { ...CALI_90_FUTBOL_11, refId: 'nowhere' });
    const noZone = await editor.post('/admin/rental-rates', { ...CALI_90_FUTBOL_11, scope: 'zone', refId: 'nowhere' });
    const duplicate = await editor.post('/admin/rental-rates', { scope: 'city', refId: 'city-cali', durationMinutes: 60, modality: null, level: null, amount: 1 });
    const identityChange = await editor.patch(`/admin/rental-rates/${existing.id}`, { revision: 0, amount: 1, durationMinutes: 90 });
    const stale = await editor.patch(`/admin/rental-rates/${existing.id}`, { revision: 5, amount: 1 });
    const missing = await editor.patch('/admin/rental-rates/nope', { revision: 0, amount: 1 });
    const noReason = await editor.post(`/admin/rental-rates/${existing.id}/delete`, {});

    expect([fieldErrors.status, fieldErrors.body.error, Object.keys(fieldErrors.body.fieldErrors)]).toEqual([400, 'validation_failed', ['amount']]);
    expect([levelAlone.status, levelAlone.body.fieldErrors]).toEqual([400, { level: 'level_requires_modality' }]);
    expect([satellite.status, satellite.body.error, satellite.body.anchorCityId]).toEqual([409, 'city_not_anchor', 'city-cali']);
    expect([noCity.status, noCity.body.error]).toEqual([404, 'city_not_found']);
    expect([noZone.status, noZone.body.error]).toEqual([404, 'zone_not_found']);
    expect([duplicate.status, duplicate.body.error, duplicate.body.existingId]).toEqual([409, 'rate_already_exists', existing.id]);
    expect([identityChange.status, identityChange.body.error]).toEqual([400, 'validation_failed']);
    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
    expect([missing.status, missing.body.error]).toEqual([404, 'rate_not_found']);
    expect([noReason.status, Object.keys(noReason.body.fieldErrors)]).toEqual([400, ['reason']]);
  });

  it('warns which zones stop quoting a duration when its last rate goes', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const cityRate = (await editor.get('/admin/rental-rates?cityId=city-cali&durationMinutes=90')).body.items.find(
      (item: { scope: string }) => item.scope === 'city',
    );

    const impact = await editor.get(`/admin/rental-rates/${cityRate.id}/delete-impact`);

    expect(impact.body).toEqual({ zoneCount: 2, zoneNames: ['Sur', 'Centro'] });
  });

  it('reads with pricing.read, writes only with pricing.manage, and refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0401');

    expect((await reader.get('/admin/rental-rates')).status).toBe(200);
    expect((await reader.post('/admin/rental-rates', CALI_90_FUTBOL_11)).status).toBe(403);
    expect((await as(context, client.token).get('/admin/rental-rates')).status).toBe(401);
  });
});
