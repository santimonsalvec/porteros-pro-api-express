import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as } from '../geographyTestHelpers.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';
import { RentalRate } from '../../../src/domain/pricing/rentalRate.js';

const RIONEGRO = { name: 'Rionegro', countryId: 'country-co', timeZone: 'America/Bogota' };

async function marketStaff(context: Awaited<ReturnType<typeof buildTestApp>>) {
  // The markets' country, as the admin's country store holds it.
  context.countryRepository.seed(context.quoteCountryRepository.countries.get('country-co')!);
  await seedRole(context, 'sedes-lector', ['markets.read']);
  await seedRole(context, 'sedes-editor', ['markets.read', 'markets.manage']);
  const reader = await signInStaff(context, { key: 'sedes-lector', roleId: 'sedes-lector' });
  const editor = await signInStaff(context, { key: 'sedes-editor', roleId: 'sedes-editor' });
  return { reader: as(context, reader.token), editor: as(context, editor.token) };
}

describe('/admin/markets (spec 031, contract §C)', () => {
  it('lists the markets by name with their country, zones and checklist summary', async () => {
    const context = await buildTestApp();
    const { reader } = await marketStaff(context);

    const all = await reader.get('/admin/markets');
    const drafts = await reader.get('/admin/markets?status=draft');

    expect(all.status).toBe(200);
    const names = all.body.items.map((market: { name: string }) => market.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, 'es')));
    expect(all.body.items.find((market: { id: string }) => market.id === 'city-medellin')).toMatchObject({
      name: 'Medellín',
      status: 'enabled',
      country: { id: 'country-co', name: 'Colombia', currency: 'COP' },
      zoneCount: 2,
      readiness: { ready: expect.any(Boolean), missingCount: expect.any(Number) },
    });
    expect(drafts.body.items).toEqual([]);
    expect((await reader.get('/admin/markets?status=nope')).status).toBe(400);
  });

  it('creates a draft market, reads it and edits it, each write audited', async () => {
    const context = await buildTestApp();
    const { editor } = await marketStaff(context);

    const created = await editor.post('/admin/markets', RIONEGRO);
    const id = created.body.marketId as string;
    const read = await editor.get(`/admin/markets/${id}`);
    const edited = await editor.patch(`/admin/markets/${id}`, { revision: 0, name: 'Rionegro (Oriente)' });

    expect(created.status).toBe(201);
    expect(read.body).toMatchObject({ id, name: 'Rionegro', status: 'draft', timeZone: 'America/Bogota', zoneCount: 0, readiness: null, revision: 0 });
    expect([edited.status, edited.body.name, edited.body.revision]).toEqual([200, 'Rionegro (Oriente)', 1]);
    expect(context.adminAuditLog.entries.map((entry) => [entry.action, entry.resourceType, entry.outcome])).toEqual([
      ['market.create', 'market', 'done'],
      ['market.update', 'market', 'done'],
    ]);
    expect(context.adminAuditLog.entries[1]!.before).toMatchObject({ name: 'Rionegro', revision: 0 });
  });

  it('answers each refusal with its code', async () => {
    const context = await buildTestApp();
    const { editor } = await marketStaff(context);
    await editor.post('/admin/markets', RIONEGRO);

    const noCountry = await editor.post('/admin/markets', { ...RIONEGRO, name: 'X Y', countryId: 'nope' });
    const badZone = await editor.post('/admin/markets', { ...RIONEGRO, name: 'X Y', timeZone: 'Mars/Olympus' });
    const taken = await editor.post('/admin/markets', { ...RIONEGRO, name: 'rionegro' });
    const missingField = await editor.post('/admin/markets', { name: 'Sin país' });
    const country = await editor.patch('/admin/markets/city-medellin', { revision: 0, countryId: 'country-mx' });
    const stale = await editor.patch('/admin/markets/city-medellin', { revision: 4, name: 'Medellín' });
    const missing = await editor.get('/admin/markets/nope');

    expect([noCountry.status, noCountry.body.error]).toEqual([404, 'country_not_found']);
    expect([badZone.status, badZone.body.fieldErrors]).toEqual([400, { timeZone: 'invalid_time_zone' }]);
    expect([taken.status, taken.body.error]).toEqual([409, 'market_name_taken']);
    expect(missingField.status).toBe(400);
    expect([country.status, country.body.error]).toEqual([409, 'country_immutable']);
    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
    expect([missing.status, missing.body.error]).toEqual([404, 'market_not_found']);
  });

  it('needs markets.read to read and markets.manage to write; refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const { reader } = await marketStaff(context);
    await seedRole(context, 'nada', ['staff.read']);
    const outsider = as(context, (await signInStaff(context, { key: 'otro', roleId: 'nada' })).token);
    const client = await signInClient(context, 'sub-0310');

    expect((await outsider.get('/admin/markets')).status).toBe(403);
    expect((await reader.post('/admin/markets', RIONEGRO)).status).toBe(403);
    expect((await reader.patch('/admin/markets/city-medellin', { revision: 0, name: 'X Y' })).status).toBe(403);
    expect((await as(context, client.token).get('/admin/markets')).status).toBe(401);
  });
});

describe('/admin/markets lifecycle (spec 031, US3)', () => {
  async function lifecycleStaff(context: Awaited<ReturnType<typeof buildTestApp>>) {
    const { editor } = await marketStaff(context);
    await seedRole(context, 'sedes-ciclo', ['markets.read', 'markets.manage', 'markets.lifecycle']);
    const owner = await signInStaff(context, { key: 'sedes-ciclo', roleId: 'sedes-ciclo' });
    return { editor, owner: as(context, owner.token) };
  }

  it('refuses to enable a market whose checklist is not complete, naming what is missing', async () => {
    const context = await buildTestApp();
    const { owner } = await lifecycleStaff(context);
    const { marketId } = (await owner.post('/admin/markets', RIONEGRO)).body;

    const readiness = await owner.get(`/admin/markets/${marketId}/readiness`);
    const enabled = await owner.post(`/admin/markets/${marketId}/enable`, { revision: 0 });

    expect(readiness.status).toBe(200);
    expect(readiness.body).toMatchObject({ ready: false, missingCount: expect.any(Number), items: expect.any(Array) });
    expect([enabled.status, enabled.body.error]).toEqual([409, 'not_ready']);
    expect(enabled.body.items.length).toBe(readiness.body.missingCount);
    expect(enabled.body.items.every((item: { status: string }) => item.status === 'missing')).toBe(true);
    expect((await owner.get(`/admin/markets/${marketId}`)).body.status).toBe('draft');
  });

  it('disables an enabled market with a reason and enables it again, each audited', async () => {
    const context = await buildTestApp();
    const { owner } = await lifecycleStaff(context);
    const { revision } = (await owner.get('/admin/markets/city-medellin')).body;

    const noReason = await owner.post('/admin/markets/city-medellin/disable', { revision });
    const disabled = await owner.post('/admin/markets/city-medellin/disable', { revision, reason: 'Temporada baja' });
    const twice = await owner.post('/admin/markets/city-medellin/disable', { revision: revision + 1, reason: 'Otra vez' });
    const notReady = await owner.post('/admin/markets/city-medellin/enable', { revision: revision + 1 });
    for (const durationMinutes of [60, 90, 120]) {
      context.rentalRateRepository.seed(new RentalRate({ id: `rate-med-${durationMinutes}`, scope: 'market', refId: 'city-medellin', durationMinutes, amount: 50000 }));
    }
    const enabled = await owner.post('/admin/markets/city-medellin/enable', { revision: revision + 1 });
    const again = await owner.post('/admin/markets/city-medellin/enable', { revision: revision + 2 });
    const staleEnable = await owner.post('/admin/markets/city-medellin/enable', { revision: revision + 9 });

    expect([noReason.status, Object.keys(noReason.body.fieldErrors)]).toEqual([400, ['reason']]);
    expect([again.status, again.body.error]).toEqual([409, 'already_enabled']);
    expect([staleEnable.status, staleEnable.body.error]).toEqual([409, 'stale_revision']);
    expect([disabled.status, disabled.body.status, disabled.body.disabledBy]).toEqual([200, 'disabled', expect.any(String)]);
    expect([twice.status, twice.body.error]).toEqual([409, 'not_enabled']);
    expect([notReady.status, notReady.body.items.map((item: { key: string }) => item.key)]).toEqual([409, ['rental_rates']]);
    expect([enabled.status, enabled.body.status]).toEqual([200, 'enabled']);
    const done = context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done');
    expect(done[0]).toMatchObject({ action: 'market.disable', resourceType: 'market', resourceId: 'city-medellin', request: { reason: 'Temporada baja' } });
  });

  it('answers not_found and stale_revision on disable and delete', async () => {
    const context = await buildTestApp();
    const { owner } = await lifecycleStaff(context);
    const { revision } = (await owner.get('/admin/markets/city-medellin')).body;

    const unknownDisable = await owner.post('/admin/markets/nope/disable', { revision: 0, reason: 'Temporada baja' });
    const staleDisable = await owner.post('/admin/markets/city-medellin/disable', { revision: revision + 5, reason: 'Temporada baja' });
    const unknownDelete = await owner.post('/admin/markets/nope/delete', { revision: 0 });

    expect([unknownDisable.status, unknownDisable.body.error]).toEqual([404, 'market_not_found']);
    expect([staleDisable.status, staleDisable.body.error]).toEqual([409, 'stale_revision']);
    expect([unknownDelete.status, unknownDelete.body.error]).toEqual([404, 'market_not_found']);
  });

  it('deletes a market nothing points at, and refuses one in use naming what uses it', async () => {
    const context = await buildTestApp();
    const { owner } = await lifecycleStaff(context);
    const { marketId } = (await owner.post('/admin/markets', RIONEGRO)).body;
    const other = (await owner.post('/admin/markets', { ...RIONEGRO, name: 'La Ceja' })).body.marketId as string;
    context.marketUsage.uses.set(other, { kind: 'zones', count: 2 });

    const stale = await owner.post(`/admin/markets/${marketId}/delete`, { revision: 3 });
    const deleted = await owner.post(`/admin/markets/${marketId}/delete`, { revision: 0 });
    const inUse = await owner.post(`/admin/markets/${other}/delete`, { revision: 0 });

    expect(stale.status).toBe(409);
    expect(deleted.status).toBe(204);
    expect((await owner.get(`/admin/markets/${marketId}`)).status).toBe(404);
    expect([inUse.status, inUse.body.error, inUse.body.kind, inUse.body.count]).toEqual([409, 'in_use', 'zones', 2]);
    expect(context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done').map((entry) => entry.action)).toContain('market.delete');
  });

  it('needs markets.lifecycle to enable, disable or delete', async () => {
    const context = await buildTestApp();
    const { editor } = await lifecycleStaff(context);

    expect((await editor.post('/admin/markets/city-medellin/disable', { revision: 0, reason: 'Cierre' })).status).toBe(403);
    expect((await editor.post('/admin/markets/city-medellin/enable', { revision: 0 })).status).toBe(403);
    expect((await editor.post('/admin/markets/city-medellin/delete', { revision: 0 })).status).toBe(403);
    expect((await editor.get('/admin/markets/city-medellin/readiness')).status).toBe(200);
  });
});
