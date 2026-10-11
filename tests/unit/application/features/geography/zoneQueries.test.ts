import { describe, expect, it } from 'vitest';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { ListZonesQuery } from '../../../../../src/application/features/geography/queries/listZones/listZonesQuery.js';
import { ListZonesQueryHandler } from '../../../../../src/application/features/geography/queries/listZones/listZonesQueryHandler.js';
import { ListZoneShapesQuery } from '../../../../../src/application/features/geography/queries/listZoneShapes/listZoneShapesQuery.js';
import { ListZoneShapesQueryHandler } from '../../../../../src/application/features/geography/queries/listZoneShapes/listZoneShapesQueryHandler.js';
import { GetZoneQuery } from '../../../../../src/application/features/geography/queries/getZone/getZoneQuery.js';
import { GetZoneQueryHandler } from '../../../../../src/application/features/geography/queries/getZone/getZoneQueryHandler.js';
import { DeleteZoneCommand } from '../../../../../src/application/features/geography/commands/deleteZone/deleteZoneCommand.js';
import { DeleteZoneCommandHandler } from '../../../../../src/application/features/geography/commands/deleteZone/deleteZoneCommandHandler.js';
import { geographyKit } from './geographyTestKit.js';

describe('zone lists, shapes and detail', () => {
  it('lists every zone of an anchor city without polygons, marking the ones in use', async () => {
    const kit = geographyKit();
    kit.zones.items.set(
      'z-broken',
      new Zone({ id: 'z-broken', cityId: 'med', name: 'Rota', slug: 'rota', geometry: { type: 'Polygon', coordinates: [[[0, 0]]] }, active: false, displayOrder: 5 }),
    );
    kit.usage.use('z-laureles', 'zone_in_use');

    const result = await new ListZonesQueryHandler(kit).handle(new ListZonesQuery('med'));

    expect(result).toEqual({
      outcome: 'ok',
      city: { id: 'med', name: 'Medellín' },
      items: [
        { id: 'z-laureles', cityId: 'med', name: 'Laureles', slug: 'laureles', active: true, displayOrder: 1, inUse: true, revision: 0 },
        { id: 'z-broken', cityId: 'med', name: 'Rota', slug: 'rota', active: false, displayOrder: 5, inUse: false, revision: 0 },
      ],
    });
  });

  it("gives the city's polygons simplified for the map, with whether each is valid", async () => {
    const kit = geographyKit();
    const detailed = Array.from({ length: 3000 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 3000;
      return [-75.55 + 0.03 * Math.cos(angle), 6.2 + 0.03 * Math.sin(angle)];
    });
    detailed.push(detailed[0]!);
    kit.zones.items.set('z-big', new Zone({ id: 'z-big', cityId: 'med', name: 'Grande', slug: 'grande', geometry: { type: 'Polygon', coordinates: [detailed] }, active: true, displayOrder: 2 }));

    const result = await new ListZoneShapesQueryHandler(kit).handle(new ListZoneShapesQuery('med'));

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(result.items.map((shape) => [shape.id, shape.name, shape.active, shape.geometryValid])).toEqual([
      ['z-laureles', 'Laureles', true, true],
      ['z-big', 'Grande', true, true],
    ]);
    expect((result.items[1]!.geometry.coordinates as number[][][])[0]!.length).toBeLessThan(300);
  });

  it('names the anchor of a satellite city, and an unknown city', async () => {
    const kit = geographyKit();
    expect(await new ListZonesQueryHandler(kit).handle(new ListZonesQuery('env'))).toEqual({
      outcome: 'zone_city_not_anchor',
      anchorCity: { id: 'med', name: 'Medellín' },
    });
    expect(await new ListZonesQueryHandler(kit).handle(new ListZonesQuery('nope'))).toEqual({ outcome: 'city_not_found' });
  });

  it('reads one zone as the list shows it', async () => {
    const kit = geographyKit();
    const handler = new GetZoneQueryHandler(kit);
    expect(await handler.handle(new GetZoneQuery('z-laureles'))).toMatchObject({ outcome: 'ok', zone: { id: 'z-laureles', inUse: false, geometryValid: true } });
    expect(await handler.handle(new GetZoneQuery('nope'))).toEqual({ outcome: 'not_found' });
  });
});

describe('DeleteZoneCommandHandler', () => {
  it('keeps a zone in use, deletes an unused one', async () => {
    const kit = geographyKit();
    const handler = new DeleteZoneCommandHandler(kit);
    kit.usage.use('z-laureles', 'zone_in_use');
    expect(await handler.handle(new DeleteZoneCommand('z-laureles'))).toEqual({ outcome: 'in_use', reason: 'zone_in_use' });

    kit.usage.reasons.clear();
    expect(await handler.handle(new DeleteZoneCommand('z-laureles'))).toEqual({ outcome: 'deleted' });
    expect(kit.zones.items.size).toBe(0);
  });
});
