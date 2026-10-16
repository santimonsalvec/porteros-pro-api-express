import { describe, expect, it } from 'vitest';
import { resolveServiceArea } from '../../../../../src/application/features/goalkeeperRequests/common/serviceArea.js';
import type { MarketStatus } from '../../../../../src/domain/markets/market.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';

const square = (lng: number, lat: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[lng, lat], [lng + 0.02, lat], [lng + 0.02, lat + 0.02], [lng, lat + 0.02], [lng, lat]]],
});
const POINT = { latitude: 6.21, longitude: -75.59 };

function world(zones: { id: string; marketStatus: MarketStatus; active: boolean; lng?: number }[]) {
  const zoneRepository = new FakeZoneRepository();
  const marketRepository = new FakeMarketRepository();
  for (const zone of zones) {
    const marketId = `m-${zone.id}`;
    marketRepository.seed(testMarket({ id: marketId, name: `Sede ${zone.id}`, countryId: 'co', status: zone.marketStatus, timeZone: 'America/Bogota' }));
    zoneRepository.seed(
      new Zone({ id: zone.id, marketId, name: zone.id, slug: zone.id, geometry: square(zone.lng ?? -75.6, 6.2), active: zone.active, displayOrder: 1 }),
    );
  }
  return () => resolveServiceArea(zoneRepository, marketRepository, POINT.latitude, POINT.longitude);
}

describe('resolveServiceArea (spec 031, research §8)', () => {
  it("answers the active zone of an enabled market, with the market's time zone", async () => {
    const result = await world([{ id: 'z', marketStatus: 'enabled', active: true }])();
    expect(result).toMatchObject({ outcome: 'ok', zone: { id: 'z' }, market: { id: 'm-z' }, timeZone: 'America/Bogota' });
  });

  it.each([
    ['an active zone of a disabled market', [{ id: 'z', marketStatus: 'disabled', active: true }], 'market_unavailable'],
    ['an active zone of a draft market', [{ id: 'z', marketStatus: 'draft', active: true }], 'location_not_covered'],
    ['only an inactive zone of an enabled market', [{ id: 'z', marketStatus: 'enabled', active: false }], 'market_unavailable'],
    ['only an inactive zone of a disabled market', [{ id: 'z', marketStatus: 'disabled', active: false }], 'market_unavailable'],
    ['only an inactive zone of a draft market', [{ id: 'z', marketStatus: 'draft', active: false }], 'location_not_covered'],
    ['no zone at all', [{ id: 'z', marketStatus: 'enabled', active: true, lng: -70 }], 'location_not_covered'],
  ] as const)('%s → %s', async (_case, zones, outcome) => {
    expect((await world([...zones])()).outcome).toBe(outcome);
  });

  it("names the market that is unavailable", async () => {
    expect(await world([{ id: 'z', marketStatus: 'disabled', active: true }])()).toMatchObject({ outcome: 'market_unavailable', market: { id: 'm-z', name: 'Sede z' } });
  });

  it('prefers the active zone when an inactive one also contains the point', async () => {
    const result = await world([
      { id: 'old', marketStatus: 'disabled', active: false },
      { id: 'new', marketStatus: 'enabled', active: true },
    ])();
    expect(result).toMatchObject({ outcome: 'ok', zone: { id: 'new' } });
  });
});
