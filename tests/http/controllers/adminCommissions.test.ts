import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

const NORTE = { scope: 'zone', refId: 'zone-cali-norte', fixedAmount: 9000, percentBps: 0 };

describe('/admin/commissions (admin spec 004, US3)', () => {
  it('creates, edits the amount and deletes a commission, with its VAT, auditing the before and after', async () => {
    const context = await buildTestApp();
    context.taxSettingsRepository.seed('country-co', 1900);
    const { editor } = await pricingStaff(context);

    const created = await editor.post('/admin/commissions', NORTE);
    const id = created.body.id as string;
    const edited = await editor.patch(`/admin/commissions/${id}`, { revision: 0, fixedAmount: 9500, percentBps: 0 });
    const impact = await editor.get(`/admin/commissions/${id}/delete-impact`);
    const deleted = await editor.post(`/admin/commissions/${id}/delete`, { reason: 'Vuelve a la del país' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...NORTE, kind: 'fixed', zoneName: 'Norte', marketName: 'Cali', currency: 'COP', vatRateBps: 1900, vatAmount: 1710, totalWithVat: 10710 });
    expect([edited.status, edited.body.fixedAmount, edited.body.totalWithVat]).toEqual([200, 9500, 11305]);
    expect(impact.body).toEqual({ zoneCount: 0, zoneNames: [] });
    expect(deleted.status).toBe(204);
    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done');
    expect(done.map((entry) => entry.action)).toEqual(['commission.create', 'commission.update', 'commission.delete']);
    expect(done[1]).toMatchObject({ resourceType: 'commissionSetting', resourceId: id, before: { fixedAmount: 9000, percentBps: 0 }, after: { fixedAmount: 9500, percentBps: 0 } });
  });

  it('lists the country commission first, and filters by scope', async () => {
    const context = await buildTestApp();
    const { reader, editor } = await pricingStaff(context);
    await editor.post('/admin/commissions', NORTE);

    const all = await reader.get('/admin/commissions?countryId=country-co');
    const zones = await reader.get('/admin/commissions?scope=zone');

    expect(all.body.items.map((item: { scope: string; refId: string }) => [item.scope, item.refId])).toEqual([
      ['country', 'country-co'],
      ['zone', 'zone-cali-norte'],
    ]);
    expect(zones.body.items.map((item: { refId: string }) => item.refId)).toEqual(['zone-cali-norte']);
  });

  it('warns that the zones lose their only commission, and answers the refusals', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const impact = await editor.get('/admin/commissions/commission-country-co/delete-impact');
    const duplicate = await editor.post('/admin/commissions', { scope: 'country', refId: 'country-co', fixedAmount: 1, percentBps: 0 });
    const unknown = await editor.post('/admin/commissions', { scope: 'country', refId: 'nowhere', fixedAmount: 1, percentBps: 0 });
    const openModality = await editor.post('/admin/commissions', { ...NORTE, modality: 'any' });
    const stale = await editor.patch('/admin/commissions/commission-country-co', { revision: 3, fixedAmount: 1, percentBps: 0 });
    const missing = await editor.get('/admin/commissions/nope');

    expect(impact.body).toEqual({ zoneCount: 5, zoneNames: ['Norte', 'Sur', 'Centro', 'Bello', 'Copacabana'] });
    expect([duplicate.status, duplicate.body.error, duplicate.body.existingId]).toEqual([409, 'commission_already_exists', 'commission-country-co']);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'country_not_found']);
    expect([openModality.status, openModality.body.error]).toEqual([400, 'validation_failed']);
    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
    expect([missing.status, missing.body.error]).toEqual([404, 'commission_not_found']);
  });

  it('reads with pricing.read, writes only with pricing.manage, and refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const { reader } = await pricingStaff(context);
    const client = await signInClient(context, 'sub-0404');

    expect((await reader.get('/admin/commissions')).status).toBe(200);
    expect((await reader.post('/admin/commissions', NORTE)).status).toBe(403);
    expect((await as(context, client.token).get('/admin/commissions')).status).toBe(401);
  });
});

describe('/admin/commissions — fixed, percent or both (feature 033, US1)', () => {
  it('creates a percent and a mixed rule, without VAT figures, and edits both components', async () => {
    const context = await buildTestApp();
    context.taxSettingsRepository.seed('country-co', 1900);
    const { editor } = await pricingStaff(context);

    const percent = await editor.post('/admin/commissions', { ...NORTE, fixedAmount: 0, percentBps: 1250 });
    const mixed = await editor.post('/admin/commissions', { scope: 'market', refId: 'city-cali', fixedAmount: 3000, percentBps: 1000 });
    const edited = await editor.patch(`/admin/commissions/${percent.body.id}`, { revision: 0, fixedAmount: 2000, percentBps: 500 });

    expect([percent.status, percent.body.kind, percent.body.vatAmount, percent.body.totalWithVat]).toEqual([201, 'percent', null, null]);
    expect(mixed.body).toMatchObject({ kind: 'mixed', fixedAmount: 3000, percentBps: 1000, vatAmount: null });
    expect(edited.body).toMatchObject({ kind: 'mixed', fixedAmount: 2000, percentBps: 500, revision: 1 });
  });

  it('refuses a rule with nothing to charge, naming both fields, and a legacy amount-only body', async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const empty = await editor.post('/admin/commissions', { ...NORTE, fixedAmount: 0, percentBps: 0 });
    const tooHigh = await editor.post('/admin/commissions', { ...NORTE, percentBps: 10001 });
    const legacy = await editor.post('/admin/commissions', { scope: 'zone', refId: 'zone-cali-norte', amount: 9000 });
    const emptyEdit = await editor.patch('/admin/commissions/commission-country-co', { revision: 0, fixedAmount: 0, percentBps: 0 });

    expect([empty.status, empty.body.error]).toEqual([400, 'validation_failed']);
    expect(empty.body.fieldErrors).toMatchObject({ fixedAmount: 'Indica un valor fijo, un porcentaje o ambos', percentBps: 'Indica un valor fijo, un porcentaje o ambos' });
    expect([tooHigh.status, Object.keys(tooHigh.body.fieldErrors)]).toEqual([400, ['percentBps']]);
    expect(legacy.status).toBe(400);
    expect([emptyEdit.status, Object.keys(emptyEdit.body.fieldErrors).sort()]).toEqual([400, ['fixedAmount', 'percentBps']]);
  });
});

describe('/admin/commissions by market (spec 031, US2)', () => {
  it("takes a market's commission and refuses the old city scope", async () => {
    const context = await buildTestApp();
    const { editor } = await pricingStaff(context);

    const market = await editor.post('/admin/commissions', { scope: 'market', refId: 'city-cali', fixedAmount: 8000, percentBps: 0 });
    const city = await editor.post('/admin/commissions', { scope: 'city', refId: 'city-cali', fixedAmount: 8000, percentBps: 0 });
    const listed = await editor.get('/admin/commissions?scope=market');

    expect([market.status, market.body.scope, market.body.marketName]).toEqual([201, 'market', 'Cali']);
    expect(city.status).toBe(400);
    expect(listed.body.items.map((item: { refId: string }) => item.refId)).toEqual(['city-cali']);
  });
});
