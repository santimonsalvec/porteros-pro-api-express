import type { Country } from '../../../../domain/countries/country.js';
import type { Market } from '../../../../domain/markets/market.js';
import type { IAdminCountryRepository, IAdminZoneRepository, ZoneSummary } from '../../geography/common/ports.js';
import type { IAdminMarketRepository } from '../../markets/common/ports.js';
import type { PriceTarget } from './views.js';

export interface PricingGeographyDependencies {
  countries: IAdminCountryRepository;
  markets: Pick<IAdminMarketRepository, 'getById' | 'getByIds' | 'list'>;
  zones: IAdminZoneRepository;
}

const NO_TARGET: PriceTarget = {
  valid: false,
  countryId: null,
  countryName: null,
  currency: null,
  marketId: null,
  marketName: null,
  zoneId: null,
  zoneName: null,
  zoneActive: null,
};

/**
 * The geography prices hang from, read once per request (admin spec 004; spec 031): every market,
 * their zones without polygons and their countries. A few dozen markets and a few hundred zones,
 * so lists join and sort in memory.
 */
export class PricingGeography {
  private readonly zoneById: Map<string, ZoneSummary>;

  private constructor(
    private readonly marketById: Map<string, Market>,
    private readonly countryById: Map<string, Country>,
    private readonly zonesOfMarket: Map<string, ZoneSummary[]>,
  ) {
    this.zoneById = new Map([...zonesOfMarket.values()].flat().map((zone) => [zone.id, zone]));
  }

  static async load(deps: PricingGeographyDependencies): Promise<PricingGeography> {
    const markets = await deps.markets.list();
    const zones = await deps.zones.summariesByMarkets(markets.map((market) => market.id));
    const countries = await deps.countries.getByIds([...new Set(markets.map((market) => market.countryId))]);
    const zonesOfMarket = new Map<string, ZoneSummary[]>();
    for (const zone of zones) zonesOfMarket.set(zone.marketId, [...(zonesOfMarket.get(zone.marketId) ?? []), zone]);
    return new PricingGeography(
      new Map(markets.map((market) => [market.id, market])),
      new Map(countries.map((country) => [country.id, country])),
      zonesOfMarket,
    );
  }

  /** The countries of the markets, by name. */
  countries(): Country[] {
    return [...this.countryById.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** Every market, by name. */
  markets(): Market[] {
    return [...this.marketById.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  zones(marketId: string): ZoneSummary[] {
    return this.zonesOfMarket.get(marketId) ?? [];
  }

  zone(zoneId: string): ZoneSummary | null {
    return this.zoneById.get(zoneId) ?? null;
  }

  market(marketId: string): Market | null {
    return this.marketById.get(marketId) ?? null;
  }

  /** The markets of the country, by name. */
  marketsOf(countryId: string): Market[] {
    return this.markets().filter((market) => market.countryId === countryId);
  }

  countryOf(marketId: string): Country | null {
    const market = this.marketById.get(marketId);
    return market ? (this.countryById.get(market.countryId) ?? null) : null;
  }

  /** The country, market and zone of a price document. */
  target(scope: string, refId: string): PriceTarget {
    if (scope === 'country') {
      const country = this.countryById.get(refId);
      return country ? { ...NO_TARGET, valid: true, ...countryPart(country) } : NO_TARGET;
    }
    const zone = scope === 'zone' ? this.zone(refId) : null;
    if (scope === 'zone' && !zone) return NO_TARGET;
    const market = this.market(zone?.marketId ?? refId);
    if (!market) return NO_TARGET;
    const country = this.countryOf(market.id);
    return {
      valid: true,
      ...(country ? countryPart(country) : { countryId: null, countryName: null, currency: null }),
      marketId: market.id,
      marketName: market.name,
      zoneId: zone?.id ?? null,
      zoneName: zone?.name ?? null,
      zoneActive: zone?.active ?? null,
    };
  }
}

function countryPart(country: Country) {
  return { countryId: country.id, countryName: country.name, currency: country.currency };
}

/** Why a price cannot point at a target. */
export type TargetFailure = { outcome: 'zone_not_found' | 'market_not_found' | 'country_not_found' | 'country_without_currency' };

/**
 * Whether a new price may point at this target: it exists, and its country has a currency to
 * price in. `null` when it may.
 */
export async function checkWriteTarget(deps: PricingGeographyDependencies, scope: string, refId: string): Promise<TargetFailure | null> {
  if (scope === 'country') {
    const country = await deps.countries.getById(refId);
    if (!country) return { outcome: 'country_not_found' };
    return country.currency ? null : { outcome: 'country_without_currency' };
  }
  const zone = scope === 'zone' ? await deps.zones.getById(refId) : null;
  if (scope === 'zone' && !zone) return { outcome: 'zone_not_found' };
  const market = await deps.markets.getById(zone?.marketId ?? refId);
  if (!market) return { outcome: 'market_not_found' };
  const country = await deps.countries.getById(market.countryId);
  return country?.currency ? null : { outcome: 'country_without_currency' };
}
