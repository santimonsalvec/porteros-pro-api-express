import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as, geographyStaff } from '../geographyTestHelpers.js';
import { signInClient } from '../walletTestHelpers.js';

const ENVIGADO = { name: 'Sabaneta', regionId: 'region-antioquia', timeZone: 'America/Bogota', zoneCityId: 'city-medellin', daneStateCode: '05', daneCityCode: '05631' };

describe('/admin/cities (admin spec 003, US1)', () => {
  it('lists cities with their view, filters and pages', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const all = await reader.get('/admin/cities');
    const available = await reader.get('/admin/cities?state=available');
    const anchors = await reader.get('/admin/cities?anchor=true&q=Me');
    const paged = await reader.get('/admin/cities?pageSize=1&page=2');

    expect(all.status).toBe(200);
    const total = context.cityRepository.cities.size;
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, totalItems: total });
    expect(all.body.items.find((c: { id: string }) => c.id === 'city-envigado')).toMatchObject({
      region: { id: 'region-antioquia', name: 'Antioquia' },
      country: { id: 'c1', name: 'Colombia', countryCode: 'CO' },
      zoneCity: { id: 'city-medellin', name: 'Medellín' },
      state: 'operating',
      revision: 0,
    });
    expect(all.body.items.find((c: { id: string }) => c.id === 'city-medellin')).toMatchObject({ zoneCount: 2, satelliteCount: 1 });
    const availableIds = available.body.items.map((c: { id: string }) => c.id);
    expect(availableIds).toContain('city-bogota');
    expect(availableIds).not.toContain('city-medellin');
    expect(availableIds).not.toContain('city-envigado');
    expect(anchors.body.items.map((c: { id: string }) => c.id)).toEqual(['city-medellin']);
    expect([paged.body.items.length, paged.body.totalPages]).toEqual([1, total]);
    expect((await reader.get('/admin/cities?state=nope')).status).toBe(400);
  });

  it('creates, reads, edits and deletes a city, each write audited', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);

    const created = await editor.post('/admin/cities', ENVIGADO);
    const id = created.body.id as string;
    const read = await editor.get(`/admin/cities/${id}`);
    const edited = await editor.patch(`/admin/cities/${id}`, { revision: 0, name: 'Sabaneta (Antioquia)' });
    const deleted = await editor.post(`/admin/cities/${id}/delete`, { reason: 'Creada por error' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Sabaneta', state: 'operating', revision: 0 });
    expect(read.body.daneCityCode).toBe('05631');
    expect([edited.status, edited.body.name, edited.body.revision]).toEqual([200, 'Sabaneta (Antioquia)', 1]);
    expect(deleted.status).toBe(204);
    expect((await editor.get(`/admin/cities/${id}`)).status).toBe(404);
    expect(context.adminAuditLog.entries.map((e) => [e.action, e.resourceId, e.outcome])).toEqual([
      ['city.create', id, 'done'],
      ['city.update', id, 'done'],
      ['city.delete', id, 'done'],
    ]);
    expect(context.adminAuditLog.entries[1]!.before).toMatchObject({ name: 'Sabaneta', revision: 0 });
    expect(context.adminAuditLog.entries[1]!.after).toMatchObject({ name: 'Sabaneta (Antioquia)', revision: 1 });
    expect(context.adminAuditLog.entries[2]!.request).toEqual({ reason: 'Creada por error' });
  });

  it('answers each field error on its field', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);

    const cases = await Promise.all([
      editor.post('/admin/cities', { ...ENVIGADO, timeZone: 'US/Eastern' }),
      editor.post('/admin/cities', { ...ENVIGADO, daneCityCode: '5631' }),
      editor.post('/admin/cities', { ...ENVIGADO, regionId: 'nope' }),
      editor.post('/admin/cities', { ...ENVIGADO, zoneCityId: 'city-envigado' }),
      editor.post('/admin/cities', { ...ENVIGADO, name: 'S' }),
    ]);

    expect(cases.map((r) => [r.status, r.body.error, Object.keys(r.body.fieldErrors ?? {})])).toEqual([
      [400, 'validation_failed', ['timeZone']],
      [400, 'validation_failed', ['daneCityCode']],
      [400, 'validation_failed', ['regionId']],
      [400, 'validation_failed', ['zoneCityId']],
      [400, 'validation_failed', ['name']],
    ]);
    expect(cases[3]!.body.fieldErrors.zoneCityId).toBe('invalid_anchor_city');
  });

  it('answers the conflicts with stable codes', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    context.referenceUsage.use('city-bogota', 'city_in_use');
    context.futureBookings.areasWithFutureRequests.add('city-medellin');

    const stale = await editor.patch('/admin/cities/city-envigado', { revision: 5, name: 'Envigado' });
    const anchor = await editor.patch('/admin/cities/city-medellin', { revision: 0, zoneCityId: 'city-bogota' });
    const held = await editor.patch('/admin/cities/city-envigado', { revision: 0, timeZone: 'America/Lima' });
    const confirmed = await editor.patch('/admin/cities/city-envigado', { revision: 0, timeZone: 'America/Lima', acknowledgeWarnings: true });
    const inUse = await editor.post('/admin/cities/city-bogota/delete', { reason: 'Limpieza' });
    const noReason = await editor.post('/admin/cities/city-bogota/delete', {});
    const missing = await editor.patch('/admin/cities/nope', { revision: 0, name: 'Nada' });

    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
    expect([anchor.status, anchor.body.error]).toEqual([409, 'city_has_zones']);
    expect([held.status, held.body.error, held.body.warnings[0].code]).toEqual([409, 'warnings_unacknowledged', 'time_zone_has_future_bookings']);
    expect([confirmed.status, confirmed.body.timeZone]).toEqual([200, 'America/Lima']);
    expect([inUse.status, inUse.body.error]).toEqual([409, 'city_in_use']);
    expect([noReason.status, Object.keys(noReason.body.fieldErrors)]).toEqual([400, ['reason']]);
    expect([missing.status, missing.body.error]).toEqual([404, 'city_not_found']);
  });

  it('lists the time zones, cacheable for a day', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const response = await reader.get('/admin/time-zones');

    expect(response.status).toBe(200);
    expect(response.body.timeZones).toContain('America/Bogota');
    expect(response.headers['cache-control']).toBe('private, max-age=86400');
  });

  it('needs geography.read to read and geography.manage to write; refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    await (await import('../adminTestHelpers.js')).seedRole(context, 'nada', ['staff.read']);
    const outsider = as(context, (await (await import('../adminTestHelpers.js')).signInStaff(context, { key: 'otro', roleId: 'nada' })).token);
    const client = await signInClient(context, 'sub-0001');

    expect((await outsider.get('/admin/cities')).status).toBe(403);
    expect((await outsider.get('/admin/time-zones')).status).toBe(403);
    expect((await reader.post('/admin/cities', ENVIGADO)).status).toBe(403);
    expect((await reader.patch('/admin/cities/city-bogota', { revision: 0 })).status).toBe(403);
    expect((await reader.post('/admin/cities/city-bogota/delete', { reason: 'Limpieza' })).status).toBe(403);
    expect((await as(context, client.token).get('/admin/cities')).status).toBe(401);
  });

  it('leaves the readiness out for pickers (`readiness=false`) and in the detail', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const picker = await reader.get('/admin/cities?anchor=true&readiness=false');
    const detail = await reader.get('/admin/cities/city-medellin');
    const list = await reader.get('/admin/cities?anchor=true');

    expect(picker.body.items.every((c: { readiness: unknown }) => c.readiness === null)).toBe(true);
    expect(detail.body.readiness).toBeNull();
    expect(list.body.items.find((c: { id: string }) => c.id === 'city-medellin').readiness).not.toBeNull();
    expect((await reader.get('/admin/cities?readiness=nope')).status).toBe(400);
  });
});

