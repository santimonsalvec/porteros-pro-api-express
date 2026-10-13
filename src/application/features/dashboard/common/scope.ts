import { PLATFORM_TIME_ZONE } from '../../../../domain/common/platformTimeZone.js';
import type { DashboardGeographyCity, IDashboardGeography } from './ports.js';

export type TimeZoneSource = 'city' | 'country' | 'platform';
/** Why a filtered scope ended on the platform's clock. */
export type TimeZoneFallback = 'mixed' | 'missing';

export interface DashboardScope {
  countryId: string | null;
  cityId: string | null;
  /** `null` = the whole platform. */
  cityIds: string[] | null;
  timeZone: string;
  timeZoneSource: TimeZoneSource;
  timeZoneFallback: TimeZoneFallback | null;
}

export type ScopeResolution =
  | { outcome: 'ok'; scope: DashboardScope }
  | { outcome: 'invalid' }
  | { outcome: 'country_not_found' }
  | { outcome: 'city_not_found' }
  | { outcome: 'city_not_in_country' };

/** The one zone a country's zoned cities share, or why there is none. */
function countryZone(cities: readonly DashboardGeographyCity[]): { timeZone: string } | { fallback: TimeZoneFallback } {
  const zones = new Set(cities.map((city) => city.timeZone).filter((zone): zone is string => zone !== null));
  if (zones.size === 1) return { timeZone: [...zones][0]! };
  return { fallback: zones.size === 0 ? 'missing' : 'mixed' };
}

/**
 * Which cities the dashboard counts and on which clock (admin spec 008, FR-003, Clarifications):
 * the city's zone; else the zone its country's cities share; else the platform's, saying why.
 */
export async function resolveDashboardScope(
  geography: IDashboardGeography,
  filter: { countryId?: string; cityId?: string },
): Promise<ScopeResolution> {
  const { countryId, cityId } = filter;
  if (cityId !== undefined && countryId === undefined) return { outcome: 'invalid' };
  if (countryId === undefined) {
    return { outcome: 'ok', scope: { countryId: null, cityId: null, cityIds: null, timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: null } };
  }
  if (!(await geography.countryExists(countryId))) return { outcome: 'country_not_found' };

  let city: DashboardGeographyCity | null = null;
  if (cityId !== undefined) {
    city = await geography.getCity(cityId);
    if (!city) return { outcome: 'city_not_found' };
    if (city.countryId !== countryId) return { outcome: 'city_not_in_country' };
  }
  const base = { countryId, cityId: cityId ?? null };
  if (city?.timeZone) {
    return { outcome: 'ok', scope: { ...base, cityIds: [city.id], timeZone: city.timeZone, timeZoneSource: 'city', timeZoneFallback: null } };
  }

  const cities = await geography.citiesOfCountry(countryId);
  const cityIds = city ? [city.id] : cities.map((each) => each.id);
  const zone = countryZone(cities);
  return 'timeZone' in zone
    ? { outcome: 'ok', scope: { ...base, cityIds, timeZone: zone.timeZone, timeZoneSource: 'country', timeZoneFallback: null } }
    : { outcome: 'ok', scope: { ...base, cityIds, timeZone: PLATFORM_TIME_ZONE, timeZoneSource: 'platform', timeZoneFallback: zone.fallback } };
}
