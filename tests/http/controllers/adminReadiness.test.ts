import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as, geographyStaff } from '../geographyTestHelpers.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';

describe('/admin/readiness (admin spec 003, US3)', () => {
  it("answers a country's dashboard: its items, its operating cities and how many are available", async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    const entries = context.adminAuditLog.entries.length;

    const response = await reader.get('/admin/readiness?countryId=c1');

    expect(response.status).toBe(200);
    expect(response.body.country).toMatchObject({ countryId: 'c1', name: 'Colombia', ready: false });
    expect(response.body.country.items.find((i: { key: string }) => i.key === 'currency')).toMatchObject({
      status: 'missing',
      target: { kind: 'admin', screen: 'country', id: 'c1' },
    });
    expect(response.body.cities.map((c: { cityId: string }) => c.cityId).sort()).toEqual(['city-envigado', 'city-medellin']);
    expect(typeof response.body.availableCityCount).toBe('number');
    expect(context.adminAuditLog.entries.length).toBe(entries);
  });

  it("answers an operating city's checklist with its country, and an available city's empty one", async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const operating = await reader.get('/admin/readiness?cityId=city-medellin');
    const available = await reader.get('/admin/readiness?cityId=city-bogota');

    expect(operating.body).toMatchObject({ cityId: 'city-medellin', state: 'operating', country: { countryId: 'c1' } });
    expect(operating.body.items.map((i: { key: string }) => i.key)).toContain('zones');
    expect(available.body).toMatchObject({ cityId: 'city-bogota', state: 'available', items: [] });
  });

  it('needs exactly one of countryId and cityId; 404 for unknown ones; geography.read', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    await seedRole(context, 'nada', ['staff.read']);
    const outsider = as(context, (await signInStaff(context, { key: 'otro', roleId: 'nada' })).token);

    expect((await reader.get('/admin/readiness')).status).toBe(400);
    expect((await reader.get('/admin/readiness?countryId=c1&cityId=city-medellin')).status).toBe(400);
    expect([(await reader.get('/admin/readiness?countryId=pe')).body.error]).toEqual(['country_not_found']);
    expect([(await reader.get('/admin/readiness?cityId=nope')).body.error]).toEqual(['city_not_found']);
    expect((await outsider.get('/admin/readiness?countryId=c1')).status).toBe(403);
  });

  it('fills the readiness column of the city list', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const list = await reader.get('/admin/cities?state=operating');

    for (const city of list.body.items) expect(city.readiness).toEqual({ ready: expect.any(Boolean), missingCount: expect.any(Number) });
  });
});
