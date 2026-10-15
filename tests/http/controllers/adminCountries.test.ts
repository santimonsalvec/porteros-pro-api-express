import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../testAppFactory.js';
import { as, geographyStaff } from '../geographyTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

const ECUADOR = { name: 'Ecuador', countryCode: 'EC', dialCode: '+593', currency: 'USD' };

describe('/admin/countries and /admin/regions (admin spec 003, US4)', () => {
  it('creates, reads and edits a country, and creates and deletes its region, each write audited', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);

    const country = await editor.post('/admin/countries', ECUADOR);
    const countryId = country.body.id as string;
    const region = await editor.post('/admin/regions', { name: 'Pichincha', countryId });
    const regionId = region.body.id as string;
    const listed = await editor.get(`/admin/regions?countryId=${countryId}`);
    const renamed = await editor.patch(`/admin/countries/${countryId}`, { revision: 0, name: 'República del Ecuador' });
    const regionDeleted = await editor.post(`/admin/regions/${regionId}/delete`, { reason: 'Prueba' });

    expect([country.status, country.body.countryCode, country.body.regionCount, country.body.operating]).toEqual([201, 'EC', 0, false]);
    expect([region.status, region.body.countryName]).toEqual([201, 'Ecuador']);
    expect(listed.body.items.map((r: { name: string }) => r.name)).toEqual(['Pichincha']);
    expect([renamed.status, renamed.body.name, renamed.body.revision]).toEqual([200, 'República del Ecuador', 1]);
    expect(regionDeleted.status).toBe(204);
    expect(context.adminAuditLog.entries.filter((e) => e.outcome === 'done').map((e) => e.action)).toEqual([
      'country.create',
      'region.create',
      'country.update',
      'region.delete',
    ]);
  });

  it('shows a new country in the app', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);

    await editor.post('/admin/countries', ECUADOR);
    const app = await request(context.app).get('/locations/countries');

    expect(app.body.countries.map((c: { name: string }) => c.name)).toContain('Ecuador');
    expect(Object.keys(app.body.countries[0])).not.toContain('revision');
  });

  it('answers the conflicts and the field errors', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    context.referenceUsage.operatingCountries.add('c1');

    const taken = await editor.post('/admin/countries', { ...ECUADOR, countryCode: 'co' });
    const badCode = await editor.post('/admin/countries', { ...ECUADOR, countryCode: 'ECU' });
    const badCurrency = await editor.post('/admin/countries', { ...ECUADOR, currency: 'dolar' });
    const badDial = await editor.post('/admin/countries', { ...ECUADOR, dialCode: '593' });
    const locked = await editor.patch('/admin/countries/c1', { revision: 0, currency: 'USD' });
    const held = await editor.patch('/admin/countries/c1', { revision: 0, countryCode: 'CL' });
    const noCountry = await editor.post('/admin/regions', { name: 'Pichincha', countryId: 'nope' });
    const stale = await editor.patch('/admin/regions/region-antioquia', { revision: 7, name: 'Antioquia' });
    const missing = await editor.get('/admin/countries/nope');

    expect([taken.status, taken.body.error]).toEqual([409, 'country_code_taken']);
    expect([badCode.status, Object.keys(badCode.body.fieldErrors)]).toEqual([400, ['countryCode']]);
    expect([badCurrency.status, Object.keys(badCurrency.body.fieldErrors)]).toEqual([400, ['currency']]);
    expect([badDial.status, Object.keys(badDial.body.fieldErrors)]).toEqual([400, ['dialCode']]);
    expect([locked.status, locked.body.error]).toEqual([409, 'currency_locked']);
    expect([held.status, held.body.error, held.body.warnings[0].code]).toEqual([409, 'warnings_unacknowledged', 'country_code_changes_secrets']);
    expect([noCountry.status, Object.keys(noCountry.body.fieldErrors)]).toEqual([400, ['countryId']]);
    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
    expect([missing.status, missing.body.error]).toEqual([404, 'country_not_found']);
  });

  it('needs geography.manage to write; refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    const client = await signInClient(context, 'sub-0001');

    expect((await reader.get('/admin/countries')).status).toBe(200);
    expect((await reader.post('/admin/countries', ECUADOR)).status).toBe(403);
    expect((await reader.post('/admin/regions', { name: 'X', countryId: 'c1' })).status).toBe(403);
    expect((await as(context, client.token).get('/admin/regions')).status).toBe(401);
  });

  it('has no way to delete a country', async () => {
    const context = await buildTestApp();
    const { owner } = await geographyStaff(context);

    const response = await owner.post('/admin/countries/c1/delete', { reason: 'Prueba' });

    expect(response.status).toBe(404);
    expect((await owner.get('/admin/countries/c1')).status).toBe(200);
  });
});
