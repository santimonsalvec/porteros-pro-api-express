import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCityRepository, IAdminZoneRepository, IReferenceUsage } from '../../common/ports.js';
import { toZoneListItems } from '../../common/views.js';
import { checkZoneCity } from '../../common/zoneChecks.js';
import { ListZonesQuery, type ListZonesResult } from './listZonesQuery.js';

export class ListZonesQueryHandler implements IQueryHandler<ListZonesQuery, ListZonesResult> {
  constructor(private readonly deps: { cities: IAdminCityRepository; zones: IAdminZoneRepository; usage: IReferenceUsage }) {}

  async handle(query: ListZonesQuery): Promise<ListZonesResult> {
    const city = await checkZoneCity(this.deps.cities, query.cityId);
    if (city.outcome !== 'ok') return city;
    const items = await toZoneListItems(await this.deps.zones.summariesByCities([query.cityId]), this.deps.usage);
    return { outcome: 'ok', city: { id: city.city.id, name: city.city.name }, items };
  }
}
