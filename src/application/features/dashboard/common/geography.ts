import type { IAdminCountryRepository } from '../../geography/common/ports.js';
import type { IAdminMarketRepository } from '../../markets/common/ports.js';
import type { DashboardGeographyMarket, IDashboardGeography } from './ports.js';

/** The dashboard's geography over the market and country repositories (spec 031), the same in Mongo and in fakes. */
export function dashboardGeography(repositories: {
  countries: Pick<IAdminCountryRepository, 'getById'>;
  markets: Pick<IAdminMarketRepository, 'getById' | 'listByCountry'>;
}): IDashboardGeography {
  const { countries, markets } = repositories;
  const view = (market: { id: string; countryId: string; timeZone: string }): DashboardGeographyMarket => ({
    id: market.id,
    countryId: market.countryId,
    timeZone: market.timeZone,
  });
  return {
    countryExists: async (countryId) => (await countries.getById(countryId)) !== null,
    getMarket: async (marketId) => {
      const market = await markets.getById(marketId);
      return market ? view(market) : null;
    },
    marketsOfCountry: async (countryId) => (await markets.listByCountry(countryId)).map(view),
  };
}
