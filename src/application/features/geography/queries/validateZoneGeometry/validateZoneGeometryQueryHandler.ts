import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IAdminCityRepository, IAdminZoneRepository } from '../../common/ports.js';
import { NEW_ZONE_ORDER, checkZoneCity, reviewZoneGeometry } from '../../common/zoneChecks.js';
import { ValidateZoneGeometryQuery, type ValidateZoneGeometryResult } from './validateZoneGeometryQuery.js';

export class ValidateZoneGeometryQueryHandler implements IQueryHandler<ValidateZoneGeometryQuery, ValidateZoneGeometryResult> {
  constructor(private readonly deps: { cities: IAdminCityRepository; zones: IAdminZoneRepository }) {}

  async handle(query: ValidateZoneGeometryQuery): Promise<ValidateZoneGeometryResult> {
    const city = await checkZoneCity(this.deps.cities, query.cityId);
    if (city.outcome !== 'ok') return city;
    const stored = query.zoneId ? await this.deps.zones.getById(query.zoneId) : null;
    const displayOrder = query.displayOrder ?? stored?.displayOrder ?? NEW_ZONE_ORDER;
    const review = await reviewZoneGeometry(this.deps.zones, query.cityId, query.geometry, { id: query.zoneId, displayOrder });
    return { outcome: 'ok', ...review };
  }
}
