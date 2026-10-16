import { describe, expect, it } from 'vitest';
import { ReorderZonesCommand } from '../../../../../src/application/features/geography/commands/reorderZones/reorderZonesCommand.js';
import { ReorderZonesCommandHandler } from '../../../../../src/application/features/geography/commands/reorderZones/reorderZonesCommandHandler.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { geographyKit } from './geographyTestKit.js';

const square = (lng: number) => ({ type: 'Polygon' as const, coordinates: [[[lng, 6.2], [lng + 0.01, 6.2], [lng + 0.01, 6.21], [lng, 6.2]]] });

/** Medellín with Laureles (1), Belén (2) and Poblado (3); Belén was edited once. */
function setup() {
  const kit = geographyKit();
  kit.zones.items.set('z-belen', new Zone({ id: 'z-belen', marketId: 'med', name: 'Belén', slug: 'belen', geometry: square(-75.62), active: true, displayOrder: 2, revision: 1 }));
  kit.zones.items.set('z-poblado', new Zone({ id: 'z-poblado', marketId: 'med', name: 'Poblado', slug: 'poblado', geometry: square(-75.56), active: false, displayOrder: 3 }));
  const reorder = (zones: { id: string; revision: number }[], marketId = 'med') => new ReorderZonesCommandHandler(kit).handle(new ReorderZonesCommand(marketId, zones));
  const order = () => [...kit.zones.items.values()].sort((a, b) => a.displayOrder - b.displayOrder).map((zone) => [zone.id, zone.displayOrder, zone.revision]);
  return { kit, reorder, order };
}

describe('ReorderZonesCommandHandler', () => {
  it('numbers the zones 1, 2, 3… in the order given, writing only the ones that moved', async () => {
    const { reorder, order } = setup();

    const result = await reorder([
      { id: 'z-poblado', revision: 0 },
      { id: 'z-laureles', revision: 0 },
      { id: 'z-belen', revision: 1 },
    ]);

    expect(result).toEqual({ outcome: 'reordered', zoneIds: ['z-poblado', 'z-laureles', 'z-belen'] });
    expect(order()).toEqual([
      ['z-poblado', 1, 1],
      ['z-laureles', 2, 1],
      ['z-belen', 3, 2],
    ]);
  });

  it('writes nothing when the order is the same', async () => {
    const { reorder, order } = setup();
    const before = order();

    expect(await reorder([{ id: 'z-laureles', revision: 0 }, { id: 'z-belen', revision: 1 }, { id: 'z-poblado', revision: 0 }])).toMatchObject({ outcome: 'reordered' });
    expect(order()).toEqual(before);
  });

  it('refuses a list that misses a zone, adds one, or holds an old revision', async () => {
    const { reorder, order } = setup();
    const before = order();

    expect(await reorder([{ id: 'z-belen', revision: 1 }, { id: 'z-laureles', revision: 0 }])).toEqual({ outcome: 'stale' });
    expect(await reorder([{ id: 'z-belen', revision: 1 }, { id: 'z-laureles', revision: 0 }, { id: 'z-poblado', revision: 0 }, { id: 'z-otra', revision: 0 }])).toEqual({ outcome: 'stale' });
    expect(await reorder([{ id: 'z-belen', revision: 0 }, { id: 'z-laureles', revision: 0 }, { id: 'z-poblado', revision: 0 }])).toEqual({ outcome: 'stale' });
    expect(order()).toEqual(before);
  });

  it('never reads the polygons (they weigh up to ~300 KB each)', async () => {
    const { kit, reorder } = setup();
    kit.zones.listByMarket = () => Promise.reject(new Error('read the polygons'));
    kit.zones.getById = () => Promise.reject(new Error('read the polygons'));

    expect(await reorder([{ id: 'z-belen', revision: 1 }, { id: 'z-laureles', revision: 0 }, { id: 'z-poblado', revision: 0 }])).toMatchObject({ outcome: 'reordered' });
  });

  it('answers an unknown market', async () => {
    const { reorder } = setup();
    expect(await reorder([{ id: 'z-laureles', revision: 0 }], 'nope')).toEqual({ outcome: 'market_not_found' });
  });
});
