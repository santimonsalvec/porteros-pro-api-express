import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCountryRepository } from '../../../geography/common/ports.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import { GetDashboardAreasQuery, type DashboardAreasResult } from './getDashboardAreasQuery.js';

/** Far above the catalog's size: one page reads it all (a few countries). */
const ALL = { page: 1, pageSize: 10_000 };

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'es');

export interface DashboardAreasDependencies {
  countries: Pick<IAdminCountryRepository, 'list'>;
  markets: Pick<IAdminMarketRepository, 'list'>;
}

/** The countries and markets of the dashboard's filter, with `dashboard.read` alone (research §12). */
export class GetDashboardAreasQueryHandler implements IQueryHandler<GetDashboardAreasQuery, DashboardAreasResult> {
  constructor(private readonly deps: DashboardAreasDependencies) {}

  async handle(_query: GetDashboardAreasQuery): Promise<DashboardAreasResult> {
    const [countries, markets] = await Promise.all([this.deps.countries.list(ALL), this.deps.markets.list()]);
    return {
      countries: countries.items.map((country) => ({ id: country.id, name: country.name, countryCode: country.countryCode })).sort(byName),
      markets: markets.map((market) => ({ id: market.id, name: market.name, countryId: market.countryId })).sort(byName),
    };
  }
}
