import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInGoalkeeper } from '../operatingBalanceTestHelpers.js';

describe('/admin/goalkeepers/:userId/commission-rules and goalkeeper rules through /admin/commissions (feature 033, US3)', () => {
  it('creates a goalkeeper rule with an expiry, lists it on the goalkeeper with the general rules, edits and deletes it with its fallback', async () => {
    const context = await buildTestApp();
    context.taxSettingsRepository.seed('country-co', 1900);
    const { editor, reader } = await pricingStaff(context);
    const goalkeeper = await signInGoalkeeper(context, 'sub-033');

    const created = await editor.post('/admin/commissions', { scope: 'goalkeeper', refId: goalkeeper.userId, fixedAmount: 0, percentBps: 500, validUntilLocal: '2026-10-31T23:59' });
    const rules = await reader.get(`/admin/goalkeepers/${goalkeeper.userId}/commission-rules`);
    const edited = await editor.patch(`/admin/commissions/${created.body.id}`, { revision: 0, fixedAmount: 2000, percentBps: 0, validUntilLocal: null });
    const impact = await editor.get(`/admin/commissions/${created.body.id}/delete-impact`);
    const listed = await reader.get('/admin/commissions?scope=goalkeeper');
    const hidden = await reader.get('/admin/commissions');
    const deleted = await editor.post(`/admin/commissions/${created.body.id}/delete`, { reason: 'Fin del trato especial' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ scope: 'goalkeeper', kind: 'percent', percentBps: 500, countryId: 'country-co', currency: 'COP', marketName: 'Cali', validUntilLocal: '2026-10-31T23:59', timeZone: 'America/Bogota', validity: 'active', vatAmount: null });
    expect(rules.status).toBe(200);
    expect(rules.body).toMatchObject({
      goalkeeper: { userId: goalkeeper.userId, marketId: 'city-cali', marketName: 'Cali', countryId: 'country-co', currency: 'COP', timeZone: 'America/Bogota' },
      general: expect.arrayContaining([{ modality: 'any', rule: { fixedAmount: 7000, percentBps: 0, kind: 'fixed', origin: { scope: 'country', refId: 'country-co', name: 'Colombia' } } }]),
    });
    expect(rules.body.rules.map((rule: { id: string }) => rule.id)).toEqual([created.body.id]);
    expect(edited.body).toMatchObject({ kind: 'fixed', fixedAmount: 2000, validUntil: null, validUntilLocal: null, revision: 1 });
    expect(impact.body).toEqual({ zoneCount: 0, zoneNames: [], fallback: { fixedAmount: 7000, percentBps: 0, kind: 'fixed', origin: { scope: 'country', refId: 'country-co', name: 'Colombia' } } });
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([created.body.id]);
    expect(hidden.body.items.every((item: { scope: string }) => item.scope !== 'goalkeeper')).toBe(true);
    expect(deleted.status).toBe(204);
    expect(context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done').map((entry) => entry.action)).toEqual(['commission.create', 'commission.update', 'commission.delete']);
  });

  it('refuses a past expiry, an expiry on a geography rule and a user who is not a goalkeeper', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);
    const goalkeeper = await signInGoalkeeper(context, 'sub-033b');

    const past = await editor.post('/admin/commissions', { scope: 'goalkeeper', refId: goalkeeper.userId, fixedAmount: 1000, percentBps: 0, validUntilLocal: '2020-01-01T00:00' });
    const geography = await editor.post('/admin/commissions', { scope: 'zone', refId: 'zone-cali-norte', fixedAmount: 1000, percentBps: 0, validUntilLocal: '2027-01-01T00:00' });
    const nobody = await editor.post('/admin/commissions', { scope: 'goalkeeper', refId: 'not-a-goalkeeper', fixedAmount: 1000, percentBps: 0 });
    const rules = await editor.get('/admin/goalkeepers/not-a-goalkeeper/commission-rules');

    expect([past.status, past.body.fieldErrors]).toEqual([400, { validUntilLocal: 'past' }]);
    expect([geography.status, geography.body.fieldErrors]).toEqual([400, { validUntilLocal: 'only_for_goalkeeper' }]);
    expect([nobody.status, nobody.body.error]).toEqual([404, 'goalkeeper_not_found']);
    expect(rules.status).toBe(404);
  });

  it('needs pricing.read to see the rules and refuses staff without it', async () => {
    const context = await buildTestApp();
    const goalkeeper = await signInGoalkeeper(context, 'sub-033c');
    await seedRole(context, 'solo-porteros', ['goalkeepers.read']);
    const staff = await signInStaff(context, { key: 'solo-porteros', roleId: 'solo-porteros' });
    expect((await as(context, staff.token).get(`/admin/goalkeepers/${goalkeeper.userId}/commission-rules`)).status).toBe(403);
  });
});
