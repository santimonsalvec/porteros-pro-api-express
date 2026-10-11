import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCountryRepository, IAdminRegionRepository, IReferenceUsage } from '../../common/ports.js';
import { pageOf, toCountryViews, type CountryView, type Page } from '../../common/views.js';
import { ListCountriesQuery } from './listCountriesQuery.js';

export class ListCountriesQueryHandler implements IQueryHandler<ListCountriesQuery, Page<CountryView>> {
  constructor(private readonly deps: { countries: IAdminCountryRepository; regions: IAdminRegionRepository; usage: IReferenceUsage }) {}

  async handle(query: ListCountriesQuery): Promise<Page<CountryView>> {
    const found = await this.deps.countries.list({ ...query.filters, page: query.page, pageSize: query.pageSize });
    return pageOf(await toCountryViews(found.items, this.deps), query.page, query.pageSize, found.totalItems);
  }
}
