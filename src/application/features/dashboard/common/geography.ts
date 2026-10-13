import type { IAdminCityRepository, IAdminCountryRepository, IAdminRegionRepository } from '../../geography/common/ports.js';
import type { DashboardGeographyCity, IDashboardGeography } from './ports.js';

/** Far above any country's number of cities: one page reads them all. */
const ALL_CITIES = 10_000;

/** The dashboard's geography over the catalog repositories (spec 003), the same in Mongo and in fakes. */
export function dashboardGeography(repositories: {
  countries: Pick<IAdminCountryRepository, 'getById'>;
  regions: Pick<IAdminRegionRepository, 'getById' | 'getByCountry'>;
  cities: Pick<IAdminCityRepository, 'getById' | 'list'>;
}): IDashboardGeography {
  const { countries, regions, cities } = repositories;
  return {
    countryExists: async (countryId) => (await countries.getById(countryId)) !== null,
    getCity: async (cityId) => {
      const city = await cities.getById(cityId);
      if (!city) return null;
      const region = await regions.getById(city.regionId);
      return { id: city.id, countryId: region?.countryId ?? null, timeZone: city.timeZone };
    },
    citiesOfCountry: async (countryId) => {
      const regionIds = (await regions.getByCountry(countryId)).map((region) => region.id);
      if (regionIds.length === 0) return [];
      const found = await cities.list({ regionIds, page: 1, pageSize: ALL_CITIES });
      return found.items.map((city): DashboardGeographyCity => ({ id: city.id, countryId, timeZone: city.timeZone }));
    },
  };
}
