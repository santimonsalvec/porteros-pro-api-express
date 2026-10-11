import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as, geographyStaff } from '../geographyTestHelpers.js';
import { signInClient } from '../walletTestHelpers.js';

const square = (lng: number, lat: number) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + 0.02, lat], [lng + 0.02, lat + 0.02], [lng, lat + 0.02], [lng, lat]]],
});
const LAURELES = { cityId: 'city-medellin', name: 'Laureles', slug: 'laureles', geometry: square(-75.6, 6.24), active: true, displayOrder: 3 };

describe('/admin/zones (admin spec 003, US2)', () => {
  it("lists an anchor city's zones, and names the anchor of a satellite", async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);

    const listed = await reader.get('/admin/zones?cityId=city-medellin');
    const satellite = await reader.get('/admin/zones?cityId=city-envigado');
    const missing = await reader.get('/admin/zones?cityId=nope');
    const noCity = await reader.get('/admin/zones');

    expect(listed.status).toBe(200);
    expect(listed.body.city).toEqual({ id: 'city-medellin', name: 'Medellín' });
    expect(listed.body.items.map((z: { id: string }) => z.id)).toEqual(['zone-bello', 'zone-copacabana']);
    expect(listed.body.items[0].geometry).toBeUndefined();
    expect([satellite.status, satellite.body.error, satellite.body.anchorCity]).toEqual([409, 'zone_city_not_anchor', { id: 'city-medellin', name: 'Medellín' }]);
    expect([missing.status, missing.body.error]).toEqual([404, 'city_not_found']);
    expect(noCity.status).toBe(400);
  });

  it('checks a polygon without saving nor auditing it', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    await editor.post('/admin/zones', LAURELES);
    const entries = context.adminAuditLog.entries.length;

    const overlap = await editor.post('/admin/zones/validate', { cityId: 'city-medellin', geometry: square(-75.59, 6.24) });
    const broken = await editor.post('/admin/zones/validate', { cityId: 'city-medellin', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] } });

    expect(overlap.status).toBe(200);
    expect(overlap.body).toMatchObject({ errors: [], warnings: [{ code: 'overlaps_zone', data: { zoneName: 'Laureles' } }] });
    expect(broken.body.errors.map((e: { code: string }) => e.code)).toEqual(['ring_too_short']);
    expect(context.adminAuditLog.entries.length).toBe(entries);
  });

  it('creates, edits, deactivates, reactivates and deletes a zone, each write audited with its action', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);

    const created = await editor.post('/admin/zones', LAURELES);
    const id = created.body.id as string;
    const renamed = await editor.patch(`/admin/zones/${id}`, { revision: 0, name: 'Laureles-Estadio' });
    const off = await editor.patch(`/admin/zones/${id}`, { revision: 1, active: false, reason: 'Cierre temporal' });
    const on = await editor.patch(`/admin/zones/${id}`, { revision: 2, active: true });
    const deleted = await editor.post(`/admin/zones/${id}/delete`, { reason: 'Se unió a otra zona' });

    expect([created.status, created.body.slug, created.body.revision, created.body.inUse]).toEqual([201, 'laureles', 0, false]);
    expect([renamed.status, off.body.active, on.body.active, deleted.status]).toEqual([200, false, true, 204]);
    expect(context.adminAuditLog.entries.map((e) => [e.action, e.resourceId])).toEqual([
      ['zone.create', id],
      ['zone.update', id],
      ['zone.deactivate', id],
      ['zone.reactivate', id],
      ['zone.delete', id],
    ]);
    expect(context.adminAuditLog.entries[0]!.after).toMatchObject({ geometry: LAURELES.geometry });
    expect(context.adminAuditLog.entries[2]!.request).toMatchObject({ reason: 'Cierre temporal' });
  });

  it('answers each problem with its code', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    const created = await editor.post('/admin/zones', LAURELES);
    const id = created.body.id as string;
    context.referenceUsage.use(id, 'zone_in_use');

    const broken = await editor.post('/admin/zones', { ...LAURELES, slug: 'otra', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0.5, -1], [0, 0]]] } });
    const taken = await editor.post('/admin/zones', { ...LAURELES, geometry: square(-75.4, 6.24) });
    const held = await editor.post('/admin/zones', { ...LAURELES, slug: 'pisada', geometry: square(-75.59, 6.24) });
    const satellite = await editor.post('/admin/zones', { ...LAURELES, cityId: 'city-envigado', slug: 'en-satelite' });
    const noReason = await editor.patch(`/admin/zones/${id}`, { revision: 0, active: false });
    const redrawNoReason = await editor.patch(`/admin/zones/${id}`, { revision: 0, geometry: square(-75.601, 6.24) });
    const stale = await editor.patch(`/admin/zones/${id}`, { revision: 9, name: 'Laureles' });
    const moved = await editor.patch(`/admin/zones/${id}`, { revision: 0, cityId: 'city-bogota' });
    const inUse = await editor.post(`/admin/zones/${id}/delete`, { reason: 'Limpieza' });

    expect([broken.status, broken.body.error, Object.keys(broken.body.fieldErrors), broken.body.geometryErrors[0].code]).toEqual([
      400,
      'validation_failed',
      ['geometry'],
      'self_intersection',
    ]);
    expect([taken.status, taken.body.error, Object.keys(taken.body.fieldErrors ?? {})]).toEqual([409, 'zone_slug_taken', ['slug']]);
    expect([held.status, held.body.error, held.body.warnings[0].code]).toEqual([409, 'warnings_unacknowledged', 'overlaps_zone']);
    expect([satellite.status, satellite.body.error]).toEqual([409, 'zone_city_not_anchor']);
    expect([noReason.status, Object.keys(noReason.body.fieldErrors)]).toEqual([400, ['reason']]);
    expect([redrawNoReason.status, Object.keys(redrawNoReason.body.fieldErrors)]).toEqual([400, ['reason']]);
    expect([stale.status, stale.body.error]).toEqual([409, 'stale_revision']);
    expect(moved.status).toBe(400);
    expect([inUse.status, inUse.body.error]).toEqual([409, 'zone_in_use']);
  });

  it('needs geography.manage to write and to check a polygon; refuses mobile tokens', async () => {
    const context = await buildTestApp();
    const { reader } = await geographyStaff(context);
    const client = await signInClient(context, 'sub-0001');

    expect((await reader.post('/admin/zones', LAURELES)).status).toBe(403);
    expect((await reader.post('/admin/zones/validate', { cityId: 'city-medellin', geometry: LAURELES.geometry })).status).toBe(403);
    expect((await reader.patch('/admin/zones/zone-bello', { revision: 0, name: 'Bello' })).status).toBe(403);
    expect((await as(context, client.token).get('/admin/zones?cityId=city-medellin')).status).toBe(401);
  });

  it("gives the map the city's polygons apart, simplified, with whether each is valid", async () => {
    const context = await buildTestApp();
    const { reader, editor } = await geographyStaff(context);
    await editor.post('/admin/zones', LAURELES);

    const shapes = await reader.get('/admin/zones/shapes?cityId=city-medellin');
    const satellite = await reader.get('/admin/zones/shapes?cityId=city-envigado');

    expect(shapes.status).toBe(200);
    expect(shapes.body.items.map((z: { name: string; geometryValid: boolean }) => [z.name, z.geometryValid])).toEqual([
      ['Bello', false],
      ['Copacabana', false],
      ['Laureles', true],
    ]);
    expect([satellite.status, satellite.body.error]).toEqual([409, 'zone_city_not_anchor']);
  });
});

