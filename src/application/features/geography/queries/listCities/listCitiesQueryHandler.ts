import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf, toCityViews, type CityView, type CityViewDependencies, type Page } from '../../common/views.js';
import { ListCitiesQuery } from './listCitiesQuery.js';

export class ListCitiesQueryHandler implements IQueryHandler<ListCitiesQuery, Page<CityView>> {
  constructor(private readonly deps: CityViewDependencies) {}

  async handle(query: ListCitiesQuery): Promise<Page<CityView>> {
    const { countryId, regionId, ...rest } = query.filters;
    // A country has no cities of its own: they are found through its regions.
    const regionIds = regionId ? [regionId] : countryId ? (await this.deps.regions.getByCountry(countryId)).map((region) => region.id) : undefined;
    if (regionIds?.length === 0) return pageOf([], query.page, query.pageSize, 0);

    const zoneOwnerIds = await this.deps.zones.zoneOwnerIds();
    const found = await this.deps.cities.list({ ...rest, regionIds, zoneOwnerIds, page: query.page, pageSize: query.pageSize });
    return pageOf(await toCityViews(found.items, this.deps, query.withReadiness), query.page, query.pageSize, found.totalItems);
  }
}
