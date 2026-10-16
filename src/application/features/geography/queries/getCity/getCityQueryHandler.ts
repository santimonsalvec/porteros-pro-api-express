import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toCityViews, type CityViewDependencies } from '../../common/views.js';
import { GetCityQuery, type GetCityResult } from './getCityQuery.js';

export class GetCityQueryHandler implements IQueryHandler<GetCityQuery, GetCityResult> {
  constructor(private readonly deps: CityViewDependencies) {}

  async handle(query: GetCityQuery): Promise<GetCityResult> {
    const city = await this.deps.cities.getById(query.cityId);
    if (!city) return { outcome: 'not_found' };
    const [view] = await toCityViews([city], this.deps);
    return { outcome: 'ok', city: view! };
  }
}
