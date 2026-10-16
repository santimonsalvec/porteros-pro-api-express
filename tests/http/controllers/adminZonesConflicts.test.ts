import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { geographyStaff } from '../geographyTestHelpers.js';

const square = (lng: number, lat: number, size = 0.02) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
});

describe('/admin/zones — active zones never cross or touch (spec 031, contract §D)', () => {
  it('refuses a zone that crosses or touches an active one of any market, naming it', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    const first = await editor.post('/admin/zones', { marketId: 'city-bogota', name: 'Chapinero', slug: 'chapinero', geometry: square(-74.1, 4.6), active: true, displayOrder: 1 });

    const touching = await editor.post('/admin/zones', { marketId: 'city-medellin', name: 'Al lado', slug: 'al-lado', geometry: square(-74.08, 4.6), active: true, displayOrder: 1 });
    const checked = await editor.post('/admin/zones/validate', { marketId: 'city-medellin', geometry: square(-74.09, 4.61) });

    expect(first.status).toBe(201);
    expect([touching.status, touching.body.error, touching.body.conflicts]).toEqual([
      422,
      'zone_conflict',
      [{ zoneId: first.body.id, zoneName: 'Chapinero', marketId: 'city-bogota', marketName: 'Bogotá' }],
    ]);
    expect([checked.status, checked.body.error]).toEqual([422, 'zone_conflict']);
  });

  it('lets an inactive zone be crossed, and refuses to reactivate it then', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    const old = await editor.post('/admin/zones', { marketId: 'city-bogota', name: 'Vieja', slug: 'vieja', geometry: square(-74.1, 4.6), active: false, displayOrder: 1 });
    const fresh = await editor.post('/admin/zones', { marketId: 'city-medellin', name: 'Nueva', slug: 'nueva', geometry: square(-74.09, 4.61), active: true, displayOrder: 1 });

    const reactivated = await editor.patch(`/admin/zones/${old.body.id}`, { revision: 0, active: true });

    expect(fresh.status).toBe(201);
    expect([reactivated.status, reactivated.body.error, reactivated.body.conflicts[0].zoneId]).toEqual([422, 'zone_conflict', fresh.body.id]);
  });

  it('never moves a zone to another market', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);

    const moved = await editor.patch('/admin/zones/zone-bello', { revision: 0, marketId: 'city-bogota' });

    expect([moved.status, moved.body.error]).toEqual([409, 'zone_market_immutable']);
  });
});
