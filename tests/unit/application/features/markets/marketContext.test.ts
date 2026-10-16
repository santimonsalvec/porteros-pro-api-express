import { describe, expect, it } from 'vitest';
import { loadMarketContext } from '../../../../../src/application/features/markets/common/marketContext.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { InvalidConfigurationError } from '../../../../../src/domain/pricing/invalidConfigurationError.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';

const zone = (id: string, marketId: string) =>
  new Zone({ id, marketId, name: id, slug: id, geometry: { type: 'Polygon', coordinates: [] }, active: true, displayOrder: 1 });

function setup() {
  const zones = new FakeZoneRepository();
  const markets = new FakeMarketRepository();
  const countries = new FakeCountryRepository();
  countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  countries.seed(new Country({ id: 'pe', name: 'Perú', dialCode: '+51', countryCode: 'PE', currency: 'PEN' }));
  markets.seed(testMarket({ id: 'med', countryId: 'co' }));
  markets.seed(testMarket({ id: 'lim', name: 'Lima', countryId: 'pe', timeZone: 'America/Lima' }));
  zones.seed(zone('z-med', 'med'));
  zones.seed(zone('z-lim', 'lim'));
  return { deps: { zones, markets, countries }, zones, markets };
}

describe('loadMarketContext (spec 031, research §4)', () => {
  it('resolves zone → market → country, with the clock and the currency', async () => {
    const { deps } = setup();
    const context = await loadMarketContext(deps, { zoneIds: ['z-med', 'z-lim'] });

    expect(context.zone('z-med')?.marketId).toBe('med');
    expect(context.market('lim')?.name).toBe('Lima');
    expect(context.country('med')?.id).toBe('co');
    expect(context.currency('lim')).toBe('PEN');
    expect(context.timeZone('lim')).toBe('America/Lima');
    expect(context.levelsForZone('z-med')).toEqual({ zoneId: 'z-med', marketId: 'med', countryId: 'co' });
    expect(context.marketOfZone('z-lim')?.id).toBe('lim');
  });

  it('reads the markets once, whatever the number of zones', async () => {
    const { deps, markets } = setup();
    await loadMarketContext(deps, { zoneIds: ['z-med', 'z-lim'] });
    expect(markets.getByIdsCalls).toBe(1);
  });

  it('loads markets without zones', async () => {
    const { deps } = setup();
    const context = await loadMarketContext(deps, { marketIds: ['med'] });
    expect(context.currency('med')).toBe('COP');
    expect(context.zone('z-med')).toBeNull();
  });

  it('answers null for what it did not load', async () => {
    const { deps } = setup();
    const context = await loadMarketContext(deps, { marketIds: ['med'] });
    expect(context.market('nope')).toBeNull();
    expect(context.country('nope')).toBeNull();
    expect(context.currency('nope')).toBeNull();
    expect(context.levelsForZone('nope')).toBeNull();
  });

  it('treats a zone whose market is missing as broken configuration', async () => {
    const { deps, zones } = setup();
    zones.seed(zone('z-orphan', 'gone'));
    await expect(loadMarketContext(deps, { zoneIds: ['z-orphan'] })).rejects.toBeInstanceOf(InvalidConfigurationError);
  });
});
