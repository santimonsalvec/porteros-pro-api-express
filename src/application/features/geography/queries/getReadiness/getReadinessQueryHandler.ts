import type { Country } from '../../../../../domain/countries/country.js';
import type { City } from '../../../../../domain/locations/city.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { cityReadiness, countryReadiness, readinessForCities, type ReadinessDependencies } from '../../common/readiness.js';
import { cityState } from '../../common/views.js';
import { GetReadinessQuery, type CityReadinessView, type CountryReadinessView, type GetReadinessResult } from './getReadinessQuery.js';

/** More operating cities than a country will ever have: the dashboard lists them all. */
const ALL_OPERATING = 1000;

export class GetReadinessQueryHandler implements IQueryHandler<GetReadinessQuery, GetReadinessResult> {
  constructor(private readonly deps: ReadinessDependencies) {}

  async handle(query: GetReadinessQuery): Promise<GetReadinessResult> {
    return query.cityId !== null ? this.city(query.cityId) : this.country(query.countryId ?? '');
  }

  private async country(countryId: string): Promise<GetReadinessResult> {
    const country = await this.deps.countries.getById(countryId);
    if (!country) return { outcome: 'country_not_found' };
    const regions = await this.deps.regions.getByCountry(country.id);
    const regionIds = regions.map((region) => region.id);
    const zoneOwnerIds = await this.deps.zones.zoneOwnerIds();
    const [operating, available] =
      regionIds.length === 0
        ? [{ items: [] as City[] }, { totalItems: 0 }]
        : await Promise.all([
            this.deps.cities.list({ regionIds, state: 'operating', zoneOwnerIds, page: 1, pageSize: ALL_OPERATING }),
            this.deps.cities.list({ regionIds, state: 'available', zoneOwnerIds, page: 1, pageSize: 1 }),
          ]);
    const regionName = new Map(regions.map((region) => [region.id, region.name]));
    // The checklists of every operating city in one batch, beside the country's own.
    const [results, countryView] = await Promise.all([readinessForCities(this.deps, operating.items), this.countryView(country)]);
    const cities = operating.items.map((city) => {
      const { ready, missingCount } = results.get(city.id)!;
      return { cityId: city.id, name: city.name, regionName: regionName.get(city.regionId) ?? '', ready, missingCount };
    });
    return { outcome: 'country', dashboard: { country: countryView, cities, availableCityCount: available.totalItems } };
  }

  private async city(cityId: string): Promise<GetReadinessResult> {
    const city = await this.deps.cities.getById(cityId);
    if (!city) return { outcome: 'city_not_found' };
    const region = await this.deps.regions.getById(city.regionId);
    const country = region?.countryId ? await this.deps.countries.getById(region.countryId) : null;
    const zones = await this.deps.zones.countByCity([city.id]);
    const state = cityState(city, zones.get(city.id) ?? 0);
    const countryView = country ? this.countryView(country) : Promise.resolve(null);
    if (state === 'available') {
      return { outcome: 'city', readiness: { cityId: city.id, name: city.name, state, country: await countryView, ready: false, missingCount: 0, items: [] } };
    }
    const [{ items, ready, missingCount }, countryResult] = await Promise.all([cityReadiness(this.deps, city), countryView]);
    const base = { cityId: city.id, name: city.name, state, country: countryResult };
    const readiness: CityReadinessView = { ...base, items, ready, missingCount };
    return { outcome: 'city', readiness };
  }

  private async countryView(country: Country): Promise<CountryReadinessView> {
    const { items, ready } = await countryReadiness(this.deps, country);
    return { countryId: country.id, name: country.name, ready, items };
  }
}
