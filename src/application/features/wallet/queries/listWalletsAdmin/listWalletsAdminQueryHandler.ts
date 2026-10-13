import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { pageOf } from '../../../geography/common/views.js';
import { personNames } from '../../../goalkeeperRequests/common/adminNames.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import type { ICityRepository, IRegionRepository } from '../../../locations/common/ports.js';
import type { IWalletAdminReader } from '../../common/adminPorts.js';
import { ListWalletsAdminQuery, type ListWalletsAdminResult } from './listWalletsAdminQuery.js';

export interface ListWalletsAdminDependencies {
  reader: IWalletAdminReader;
  users: Pick<IUserRepository, 'getByIds'>;
  cities: Pick<ICityRepository, 'getByIds'>;
  regions: Pick<IRegionRepository, 'getByIds'>;
  countries: ICountryLookup;
}

/** The goalkeepers' wallets, with where each one plays (city → region → country). */
export class ListWalletsAdminQueryHandler implements IQueryHandler<ListWalletsAdminQuery, ListWalletsAdminResult> {
  constructor(private readonly deps: ListWalletsAdminDependencies) {}

  async handle({ criteria }: ListWalletsAdminQuery): Promise<ListWalletsAdminResult> {
    const { items, totalItems } = await this.deps.reader.list(criteria);
    const cityIds = [...new Set(items.flatMap((item) => (item.cityId ? [item.cityId] : [])))];
    const [people, cities] = await Promise.all([personNames(this.deps, items.map((item) => item.goalkeeperId)), cityIds.length > 0 ? this.deps.cities.getByIds(cityIds) : []]);
    const regionIds = [...new Set(cities.map((city) => city.regionId))];
    const regions = regionIds.length > 0 ? await this.deps.regions.getByIds(regionIds) : [];
    const countryIds = [...new Set(regions.flatMap((region) => (region.countryId ? [region.countryId] : [])))];
    const countries = await Promise.all(countryIds.map((id) => this.deps.countries.getById(id)));

    const cityById = new Map(cities.map((city) => [city.id, city]));
    const countryOfRegion = new Map(regions.map((region) => [region.id, region.countryId]));
    const countryName = new Map(countries.filter((country) => country !== null).map((country) => [country.id, country.name]));
    const rows = items.map((item) => {
      const city = item.cityId ? cityById.get(item.cityId) : undefined;
      const countryId = city ? (countryOfRegion.get(city.regionId) ?? null) : null;
      return {
        goalkeeper: people(item.goalkeeperId),
        cityName: city?.name ?? null,
        countryId,
        countryName: countryId ? (countryName.get(countryId) ?? null) : null,
        balance: item.balance,
        currency: item.currency,
        lastMovementAt: item.lastMovementAt.toISOString(),
      };
    });
    return { outcome: 'ok', page: pageOf(rows, criteria.page, criteria.pageSize, totalItems) };
  }
}
