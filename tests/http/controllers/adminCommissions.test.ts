import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { pricingStaff } from '../pricingTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

const NORTE = { scope: 'zone', refId: 'zone-cali-norte', amount: 9000 };

describe('/admin/commissions (admin spec 004, US3)', () => {
  it('creates, edits the amount and deletes a commission, with its VAT, auditing the before and after', async () => {
    const context = await buildTestApp();
    context.taxSettingsRepository.seed('country-co', 1900);
    const { editor } = await pricingStaff(context);

    const created = await editor.post('/admin/commissions', NORTE);
    const id = created.body.id as string;
    const edited = await editor.patch(`/admin/commissions/${id}`, { revision: 0, amount: 9500 });
    const impact = await editor.get(`/admin/commissions/${id}/delete-impact`);
    const deleted = await editor.post(`/admin/commissions/${id}/delete`, { reason: 'Vuelve a la del país' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...NORTE, zoneName: 'Norte', cityName: 'Cali', currency: 'COP', vatRateBps: 1900, vatAmount: 1710, totalWithVat: 10710 });
    expect([edited.status, edited.body.amount, edited.body.totalWithVat]).toEqual([200, 9500, 11305]);
    expect(impact.body).toEqual({ zoneCount: 0, zoneNames: [] });
    expect(deleted.status).toBe(204);
    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done');
    expect(done.map((entry) => entry.action)).toEqual(['commission.create', 'commission.update', 'commission.delete']);
    expect(done[1]).toMatchObject({ resourceType: 'commissionSetting', resourceId: id, before: { amount: 9000 }, after: { amount: 9500 } });
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
    const duplicate = await editor.post('/admin/commissions', { scope: 'country', refId: 'country-co', amount: 1 });
    const unknown = await editor.post('/admin/commissions', { scope: 'country', refId: 'nowhere', amount: 1 });
    const levelAlone = await editor.post('/admin/commissions', { ...NORTE, level: 'competitive' });
    const stale = await editor.patch('/admin/commissions/commission-country-co', { revision: 3, amount: 1 });
    const missing = await editor.get('/admin/commissions/nope');

    expect(impact.body).toEqual({ zoneCount: 3, zoneNames: ['Norte', 'Sur', 'Centro'] });
    expect([duplicate.status, duplicate.body.error, duplicate.body.existingId]).toEqual([409, 'commission_already_exists', 'commission-country-co']);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'country_not_found']);
    expect([levelAlone.status, levelAlone.body.fieldErrors]).toEqual([400, { level: 'level_requires_modality' }]);
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
