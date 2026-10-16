import { describe, expect, it } from 'vitest';
import { GetMarketQuery } from '../../../../../src/application/features/markets/queries/getMarket/getMarketQuery.js';
import { GetMarketQueryHandler } from '../../../../../src/application/features/markets/queries/getMarket/getMarketQueryHandler.js';
import { ListMarketsQuery } from '../../../../../src/application/features/markets/queries/listMarkets/listMarketsQuery.js';
import { ListMarketsQueryHandler } from '../../../../../src/application/features/markets/queries/listMarkets/listMarketsQueryHandler.js';
import { testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { geographyKit } from '../geography/geographyTestKit.js';

function setup() {
  const kit = geographyKit();
  kit.markets.seed(testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co', status: 'draft' }));
  kit.readiness.summaries.set('bog', { ready: false, missingCount: 3 });
  return kit;
}

describe('ListMarketsQueryHandler (spec 031, contract §C)', () => {
  it('lists every market by name with its country, zones and checklist summary', async () => {
    const kit = setup();

    const result = await new ListMarketsQueryHandler(kit).handle(new ListMarketsQuery({}));

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'bog', name: 'Bogotá', status: 'draft', country: { id: 'co', name: 'Colombia', currency: 'COP' }, zoneCount: 0, readiness: { ready: false, missingCount: 3 } }),
      expect.objectContaining({ id: 'med', name: 'Medellín', status: 'enabled', zoneCount: 1, readiness: { ready: true, missingCount: 0 } }),
    ]);
  });

  it('filters by status', async () => {
    const kit = setup();
    const result = await new ListMarketsQueryHandler(kit).handle(new ListMarketsQuery({ status: 'draft' }));
    expect(result.items.map((market) => market.id)).toEqual(['bog']);
  });
});

describe('GetMarketQueryHandler', () => {
  it('returns the market with its history and revision, or not found', async () => {
    const kit = setup();
    const handler = new GetMarketQueryHandler(kit);

    expect(await handler.handle(new GetMarketQuery('med'))).toMatchObject({
      outcome: 'ok',
      market: { id: 'med', name: 'Medellín', timeZone: 'America/Bogota', mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 }, status: 'enabled', enabledBy: 'staff-1', revision: 0 },
    });
    expect(await handler.handle(new GetMarketQuery('nope'))).toEqual({ outcome: 'not_found' });
  });
});
