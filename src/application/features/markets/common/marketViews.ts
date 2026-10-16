import type { Market, MarketStatus } from '../../../../domain/markets/market.js';
import type { IAdminCountryRepository, IAdminZoneRepository, IReadinessSummary, ReadinessSummary } from '../../geography/common/ports.js';

/** A market as the admin shows it (contracts/markets-api.md §C). */
export interface MarketView {
  id: string;
  name: string;
  country: { id: string; name: string; currency: string | null } | null;
  timeZone: string;
  status: MarketStatus;
  enabledAt: string | null;
  enabledBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  createdAt: string;
  zoneCount: number;
  /** The checklist summary; `null` on the detail, which reads `/readiness` apart. */
  readiness: ReadinessSummary | null;
  revision: number;
}

export interface MarketViewDependencies {
  countries: Pick<IAdminCountryRepository, 'getByIds'>;
  zones: Pick<IAdminZoneRepository, 'countByMarket'>;
  readiness: IReadinessSummary;
}

/** The views of several markets, reading their countries, zones and checklists once. */
export async function toMarketViews(markets: readonly Market[], deps: MarketViewDependencies, withReadiness: boolean): Promise<MarketView[]> {
  const ids = markets.map((market) => market.id);
  const [countries, zoneCounts, summaries] = await Promise.all([
    deps.countries.getByIds([...new Set(markets.map((market) => market.countryId))]),
    deps.zones.countByMarket(ids),
    withReadiness && markets.length > 0 ? deps.readiness.summarize([...markets]) : Promise.resolve(new Map<string, ReadinessSummary>()),
  ]);
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const iso = (date: Date | null) => (date ? date.toISOString() : null);
  return markets.map((market) => {
    const country = countryById.get(market.countryId);
    return {
      id: market.id,
      name: market.name,
      country: country ? { id: country.id, name: country.name, currency: country.currency } : null,
      timeZone: market.timeZone,
      status: market.status,
      enabledAt: iso(market.enabledAt),
      enabledBy: market.enabledBy,
      disabledAt: iso(market.disabledAt),
      disabledBy: market.disabledBy,
      createdAt: market.createdAt.toISOString(),
      zoneCount: zoneCounts.get(market.id) ?? 0,
      readiness: summaries.get(market.id) ?? null,
      revision: market.revision,
    };
  });
}
