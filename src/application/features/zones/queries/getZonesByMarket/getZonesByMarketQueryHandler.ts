import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import { resolveAnchorCityId } from '../../../locations/common/resolveAnchorCityId.js';
import type { IZoneRepository } from '../../common/ports.js';
import { GetZonesByCityQuery, type GetZonesByCityResult, type ZoneOption } from './getZonesByCityQuery.js';

export class GetZonesByCityQueryHandler implements IQueryHandler<GetZonesByCityQuery, GetZonesByCityResult> {
  constructor(
    private readonly cityRepository: ICityRepository,
    private readonly zoneRepository: IZoneRepository,
  ) {}

  async handle(query: GetZonesByCityQuery): Promise<GetZonesByCityResult> {
    const city = await this.cityRepository.getById(query.cityId);
    if (!city) return { outcome: 'city_not_found' };

    const anchorCityId = resolveAnchorCityId(city);
    const zones = await this.zoneRepository.getActiveByCityId(anchorCityId);
    if (zones.length === 0) return { outcome: 'no_zones_configured' };

    const options: ZoneOption[] = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      slug: zone.slug,
      displayOrder: zone.displayOrder,
      geometry: zone.geometry,
    }));

    return { outcome: 'success', zones: options };
  }
}
