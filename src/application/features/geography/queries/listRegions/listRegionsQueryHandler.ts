import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCityRepository, IAdminCountryRepository, IAdminRegionRepository } from '../../common/ports.js';
import { pageOf, toRegionViews, type Page, type RegionView } from '../../common/views.js';
import { ListRegionsQuery } from './listRegionsQuery.js';

export class ListRegionsQueryHandler implements IQueryHandler<ListRegionsQuery, Page<RegionView>> {
  constructor(private readonly deps: { regions: IAdminRegionRepository; countries: IAdminCountryRepository; cities: IAdminCityRepository }) {}

  async handle(query: ListRegionsQuery): Promise<Page<RegionView>> {
    const found = await this.deps.regions.list({ ...query.filters, page: query.page, pageSize: query.pageSize });
    return pageOf(await toRegionViews(found.items, this.deps), query.page, query.pageSize, found.totalItems);
  }
}
