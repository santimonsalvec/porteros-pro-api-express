import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCityRepository, IAdminZoneRepository } from '../../common/ports.js';
import { toZoneShape } from '../../common/views.js';
import { checkZoneCity } from '../../common/zoneChecks.js';
import { ListZoneShapesQuery, type ListZoneShapesResult } from './listZoneShapesQuery.js';

export class ListZoneShapesQueryHandler implements IQueryHandler<ListZoneShapesQuery, ListZoneShapesResult> {
  constructor(private readonly deps: { cities: IAdminCityRepository; zones: IAdminZoneRepository }) {}

  async handle(query: ListZoneShapesQuery): Promise<ListZoneShapesResult> {
    const city = await checkZoneCity(this.deps.cities, query.cityId);
    if (city.outcome !== 'ok') return city;
    return { outcome: 'ok', items: (await this.deps.zones.listByCity(query.cityId)).map(toZoneShape) };
  }
}
