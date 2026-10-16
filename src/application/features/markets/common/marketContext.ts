import type { Country } from '../../../../domain/countries/country.js';
import type { Market } from '../../../../domain/markets/market.js';
import { InvalidConfigurationError } from '../../../../domain/pricing/invalidConfigurationError.js';
import type { Zone } from '../../../../domain/zones/zone.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IMarketRepository } from './ports.js';

export interface MarketContextDependencies {
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  markets: Pick<IMarketRepository, 'getByIds'>;
  countries: ICountryLookup;
}

/** The ids every setting level of a zone hangs from (FR-013). */
export interface ZoneLevels {
  zoneId: string;
  marketId: string;
  countryId: string;
}

/**
 * The geography settings hang from, read once per request or sweep run (spec 031, research §4):
 * zone → market → country. It replaces the city → region → country lookups each resolver did.
 */
export interface MarketContext {
  zone(zoneId: string): Zone | null;
  market(marketId: string): Market | null;
  marketOfZone(zoneId: string): Market | null;
  country(marketId: string): Country | null;
  currency(marketId: string): string | null;
  timeZone(marketId: string): string | null;
  levelsForZone(zoneId: string): ZoneLevels | null;
}

export async function loadMarketContext(
  deps: MarketContextDependencies,
  ids: { zoneIds?: readonly string[]; marketIds?: readonly string[] },
): Promise<MarketContext> {
  const zoneIds = [...new Set(ids.zoneIds ?? [])];
  const zones = zoneIds.length > 0 ? await deps.zones.getManyByIds(zoneIds) : [];
  const marketIds = [...new Set([...(ids.marketIds ?? []), ...zones.map((zone) => zone.marketId)])];
  const markets = marketIds.length > 0 ? await deps.markets.getByIds(marketIds) : [];
  const marketById = new Map(markets.map((market) => [market.id, market]));
  for (const zone of zones) {
    if (!marketById.has(zone.marketId)) {
      throw new InvalidConfigurationError(`zones document ${zone.id}: market ${zone.marketId} does not exist`);
    }
  }
  const countryIds = [...new Set(markets.map((market) => market.countryId))];
  const countries = (await Promise.all(countryIds.map((id) => deps.countries.getById(id)))).filter((country): country is Country => country !== null);
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

  const market = (marketId: string) => marketById.get(marketId) ?? null;
  const country = (marketId: string) => {
    const found = market(marketId);
    return found ? (countryById.get(found.countryId) ?? null) : null;
  };
  const marketOfZone = (zoneId: string) => {
    const found = zoneById.get(zoneId);
    return found ? market(found.marketId) : null;
  };
  return {
    zone: (zoneId) => zoneById.get(zoneId) ?? null,
    market,
    marketOfZone,
    country,
    currency: (marketId) => country(marketId)?.currency ?? null,
    timeZone: (marketId) => market(marketId)?.timeZone ?? null,
    levelsForZone: (zoneId) => {
      const found = marketOfZone(zoneId);
      return found ? { zoneId, marketId: found.id, countryId: found.countryId } : null;
    },
  };
}
