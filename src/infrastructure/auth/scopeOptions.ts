import type { MarketStatus } from '../../domain/markets/market.js';
import { fullCountryIds, hasPlatformScope, scopedMarketIds, type StaffScope } from '../../domain/staff/staffScope.js';
import type { RequireScopeDependencies } from './middleware/requireScope.js';

/** What the admin's country and market picker offers this member (spec 031, contract B2). */
export interface ScopeOptions {
  platform: boolean;
  countries: {
    id: string;
    name: string;
    currency: string | null;
    /** `false` when the member holds only some of its markets. */
    full: boolean;
    markets: { id: string; name: string; status: MarketStatus }[];
  }[];
}

/** The countries with markets the member may work in, each with the markets they hold, by name. */
export async function scopeOptions(access: { scopes: readonly StaffScope[]; isOwner: boolean }, deps: RequireScopeDependencies): Promise<ScopeOptions> {
  const platform = hasPlatformScope(access.scopes, access.isOwner);
  const fullCountries = new Set(fullCountryIds(access.scopes));
  const ownMarkets = new Set(scopedMarketIds(access.scopes));
  const markets = (await deps.markets.list()).filter((market) => platform || fullCountries.has(market.countryId) || ownMarkets.has(market.id));
  const countryIds = [...new Set(markets.map((market) => market.countryId))];
  const countries = (await Promise.all(countryIds.map((id) => deps.countries.getById(id)))).flatMap((country) => (country ? [country] : []));
  return {
    platform,
    countries: countries
      .map((country) => ({
        id: country.id,
        name: country.name,
        currency: country.currency,
        full: platform || fullCountries.has(country.id),
        markets: markets
          .filter((market) => market.countryId === country.id)
          .map((market) => ({ id: market.id, name: market.name, status: market.status }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}
