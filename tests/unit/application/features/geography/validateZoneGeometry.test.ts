import { describe, expect, it } from 'vitest';
import { ValidateZoneGeometryQuery } from '../../../../../src/application/features/geography/queries/validateZoneGeometry/validateZoneGeometryQuery.js';
import { ValidateZoneGeometryQueryHandler } from '../../../../../src/application/features/geography/queries/validateZoneGeometry/validateZoneGeometryQueryHandler.js';
import { geographyKit } from './geographyTestKit.js';

const square = (lng: number, lat: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[lng, lat], [lng + 0.02, lat], [lng + 0.02, lat + 0.02], [lng, lat + 0.02], [lng, lat]]],
});

function setup() {
  const kit = geographyKit();
  const writes = { count: 0 };
  const zones = new Proxy(kit.zones, {
    get: (target, key) => (key === 'create' || key === 'update' || key === 'delete' ? () => void writes.count++ : Reflect.get(target, key)),
  });
  const validate = (query: ValidateZoneGeometryQuery) => new ValidateZoneGeometryQueryHandler({ ...kit, zones }).handle(query);
  return { kit, writes, validate };
}

describe('ValidateZoneGeometryQueryHandler', () => {
  it('names the active zones the polygon crosses, without writing (spec 031, FR-003)', async () => {
    const { validate, writes } = setup();

    const result = await validate(new ValidateZoneGeometryQuery('med', square(-75.59, 6.24)));

    expect(result).toEqual({ outcome: 'ok', errors: [], conflicts: [{ zoneId: 'z-laureles', zoneName: 'Laureles', marketId: 'med', marketName: 'Medellín' }] });
    expect(writes.count).toBe(0);
  });

  it('leaves out the zone being edited, and checks nothing for an inactive zone', async () => {
    const { validate } = setup();
    expect(await validate(new ValidateZoneGeometryQuery('med', square(-75.59, 6.24), 'z-laureles'))).toEqual({ outcome: 'ok', errors: [], conflicts: [] });
    expect(await validate(new ValidateZoneGeometryQuery('med', square(-75.59, 6.24), null, false))).toEqual({ outcome: 'ok', errors: [], conflicts: [] });
  });

  it('reports the errors alone for a broken polygon', async () => {
    const { validate } = setup();
    const result = await validate(new ValidateZoneGeometryQuery('med', { type: 'Point', coordinates: [0, 0] }));
    expect(result).toMatchObject({ outcome: 'ok', errors: [{ code: 'geometry_type' }], conflicts: [] });
  });

  it('refuses an unknown market', async () => {
    const { validate } = setup();
    expect(await validate(new ValidateZoneGeometryQuery('nope', square(-75.59, 6.24)))).toEqual({ outcome: 'market_not_found' });
  });
});
