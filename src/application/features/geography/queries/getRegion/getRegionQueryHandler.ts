import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCityRepository, IAdminCountryRepository, IAdminRegionRepository } from '../../common/ports.js';
import { toRegionViews } from '../../common/views.js';
import { GetRegionQuery, type GetRegionResult } from './getRegionQuery.js';

export class GetRegionQueryHandler implements IQueryHandler<GetRegionQuery, GetRegionResult> {
  constructor(private readonly deps: { regions: IAdminRegionRepository; countries: IAdminCountryRepository; cities: IAdminCityRepository }) {}

  async handle(query: GetRegionQuery): Promise<GetRegionResult> {
    const region = await this.deps.regions.getById(query.regionId);
    if (!region) return { outcome: 'not_found' };
    const [view] = await toRegionViews([region], this.deps);
    return { outcome: 'ok', region: view! };
  }
}
