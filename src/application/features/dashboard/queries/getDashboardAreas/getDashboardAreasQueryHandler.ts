import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCityRepository, IAdminCountryRepository, IAdminRegionRepository } from '../../../geography/common/ports.js';
import { GetDashboardAreasQuery, type DashboardAreasResult } from './getDashboardAreasQuery.js';

/** Far above the catalog's size: one page reads it all (a few countries, dozens of cities). */
const ALL = { page: 1, pageSize: 10_000 };

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'es');

export interface DashboardAreasDependencies {
  countries: Pick<IAdminCountryRepository, 'list'>;
  regions: Pick<IAdminRegionRepository, 'list'>;
  cities: Pick<IAdminCityRepository, 'list'>;
}

/**
 * The countries and cities of the dashboard's filter, with `dashboard.read` alone: the pricing
 * areas need `pricing.read` and leave satellite cities out (research §12).
 */
export class GetDashboardAreasQueryHandler implements IQueryHandler<GetDashboardAreasQuery, DashboardAreasResult> {
  constructor(private readonly deps: DashboardAreasDependencies) {}

  async handle(_query: GetDashboardAreasQuery): Promise<DashboardAreasResult> {
    const [countries, regions, cities] = await Promise.all([this.deps.countries.list(ALL), this.deps.regions.list(ALL), this.deps.cities.list(ALL)]);
    const countryOfRegion = new Map(regions.items.map((region) => [region.id, region.countryId]));
    return {
      countries: countries.items.map((country) => ({ id: country.id, name: country.name, countryCode: country.countryCode })).sort(byName),
      cities: cities.items
        .flatMap((city) => {
          const countryId = countryOfRegion.get(city.regionId);
          return countryId ? [{ id: city.id, name: city.name, countryId }] : [];
        })
        .sort(byName),
    };
  }
}
