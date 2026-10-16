import { PLATFORM_TIME_ZONE } from '../../../../domain/common/platformTimeZone.js';
import type { DashboardGeographyMarket, IDashboardGeography } from './ports.js';

export type TimeZoneSource = 'market' | 'country' | 'platform';
/** Why a filtered scope ended on the platform's clock. */
export type TimeZoneFallback = 'mixed' | 'missing';

export interface DashboardScope {
  countryId: string | null;
  marketId: string | null;
  /** `null` = the whole platform. */
  marketIds: string[] | null;
  timeZone: string;
  timeZoneSource: TimeZoneSource;
  timeZoneFallback: TimeZoneFallback | null;
}

export type ScopeResolution =
  | { outcome: 'ok'; scope: DashboardScope }
  | { outcome: 'invalid' }
  | { outcome: 'country_not_found' }
  | { outcome: 'market_not_found' }
  | { outcome: 'market_not_in_country' };

/** The one zone a country's zoned markets share, or why there is none. */
function countryZone(markets: readonly DashboardGeographyMarket[]): { timeZone: string } | { fallback: TimeZoneFallback } {
  const zones = new Set(markets.map((market) => market.timeZone).filter((zone): zone is string => zone !== null));
  if (zones.size === 1) return { timeZone: [...zones][0]! };
  return { fallback: zones.size === 0 ? 'missing' : 'mixed' };
}

/**
 * Which markets the dashboard counts and on which clock (admin spec 008, FR-003, Clarifications):
 * the market's zone; else the zone its country's markets share; else the platform's, saying why.
 */
export async function resolveDashboardScope(
  geography: IDashboardGeography,
  filter: { countryId?: string; marketId?: string },
): Promise<ScopeResolution> {
  const { countryId, marketId } = filter;
  if (marketId !== undefined && countryId === undefined) return { outcome: 'invalid' };
  if (countryId === undefined) {
    return { outcome: 'ok', scope: { countryId: null, marketId: null, marketIds: null, timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: null } };
  }
  if (!(await geography.countryExists(countryId))) return { outcome: 'country_not_found' };

  let market: DashboardGeographyMarket | null = null;
  if (marketId !== undefined) {
    market = await geography.getMarket(marketId);
    if (!market) return { outcome: 'market_not_found' };
    if (market.countryId !== countryId) return { outcome: 'market_not_in_country' };
  }
  const base = { countryId, marketId: marketId ?? null };
  if (market?.timeZone) {
    return { outcome: 'ok', scope: { ...base, marketIds: [market.id], timeZone: market.timeZone, timeZoneSource: 'market', timeZoneFallback: null } };
  }

  const markets = await geography.marketsOfCountry(countryId);
  const marketIds = market ? [market.id] : markets.map((each) => each.id);
  const zone = countryZone(markets);
  return 'timeZone' in zone
    ? { outcome: 'ok', scope: { ...base, marketIds, timeZone: zone.timeZone, timeZoneSource: 'country', timeZoneFallback: null } }
    : { outcome: 'ok', scope: { ...base, marketIds, timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: zone.fallback } };
}
