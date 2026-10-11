import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toCityViews, type CityViewDependencies } from '../../common/views.js';
import { GetCityQuery, type GetCityResult } from './getCityQuery.js';

export class GetCityQueryHandler implements IQueryHandler<GetCityQuery, GetCityResult> {
  constructor(private readonly deps: CityViewDependencies) {}

  async handle(query: GetCityQuery): Promise<GetCityResult> {
    const city = await this.deps.cities.getById(query.cityId);
    if (!city) return { outcome: 'not_found' };
    // The city page reads its checklist from `/admin/readiness`; writes read this view for the audit.
    const [view] = await toCityViews([city], this.deps, false);
    return { outcome: 'ok', city: view! };
  }
}
