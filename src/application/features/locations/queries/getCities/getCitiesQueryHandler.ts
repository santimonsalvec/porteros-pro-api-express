import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository, IRegionRepository } from '../../common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { resolveAnchorCityId } from '../../common/resolveAnchorCityId.js';
import { GetCitiesQuery, type GetCitiesResult, type CityOption } from './getCitiesQuery.js';

const SEARCH_RESULT_LIMIT = 15;

export class GetCitiesQueryHandler implements IQueryHandler<GetCitiesQuery, GetCitiesResult> {
  constructor(
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
    private readonly zoneRepository: IZoneRepository,
  ) {}

  async handle(query: GetCitiesQuery): Promise<GetCitiesResult> {
    const q = query.q.trim();
    if (q === '') return { cities: [] };

    const cities = await this.cityRepository.searchByName(q, SEARCH_RESULT_LIMIT);
    if (cities.length === 0) return { cities: [] };

    const anchorIds = cities.map((city) => resolveAnchorCityId(city));
    const citiesWithZones = await this.zoneRepository.hasActiveZonesForCityIds(anchorIds);

    const regionIds = [...new Set(cities.map((city) => city.regionId))];
    const regions = await this.regionRepository.getByIds(regionIds);
    const regionNameById = new Map(regions.map((region) => [region.id, region.name]));

    const options: CityOption[] = cities.map((city) => ({
      id: city.id,
      name: city.name,
      region: regionNameById.get(city.regionId) ?? '',
      hasZones: citiesWithZones.has(resolveAnchorCityId(city)),
    }));

    return { cities: options };
  }
}
