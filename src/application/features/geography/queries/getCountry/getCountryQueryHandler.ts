import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCountryRepository, IAdminRegionRepository, IReferenceUsage } from '../../common/ports.js';
import { toCountryViews } from '../../common/views.js';
import { GetCountryQuery, type GetCountryResult } from './getCountryQuery.js';

export class GetCountryQueryHandler implements IQueryHandler<GetCountryQuery, GetCountryResult> {
  constructor(private readonly deps: { countries: IAdminCountryRepository; regions: IAdminRegionRepository; usage: IReferenceUsage }) {}

  async handle(query: GetCountryQuery): Promise<GetCountryResult> {
    const country = await this.deps.countries.getById(query.countryId);
    if (!country) return { outcome: 'not_found' };
    const [view] = await toCountryViews([country], this.deps);
    return { outcome: 'ok', country: view! };
  }
}
