import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository, IRegionRepository } from '../../common/ports.js';
import { GetCitiesQuery, type GetCitiesResult, type CityOption } from './getCitiesQuery.js';

const SEARCH_RESULT_LIMIT = 15;
/** The search reads a few more than it shows, since municipalities without codes are left out. */
const SEARCH_READ_LIMIT = 30;

/**
 * The municipality search of the goalkeeper's billing data (spec 031, FR-023): only those with
 * official codes, which an electronic invoice needs. Nothing until something is typed.
 */
export class GetCitiesQueryHandler implements IQueryHandler<GetCitiesQuery, GetCitiesResult> {
  constructor(
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
  ) {}

  async handle(query: GetCitiesQuery): Promise<GetCitiesResult> {
    const q = query.q.trim();
    if (q === '') return { cities: [] };

    const found = await this.cityRepository.searchByName(q, SEARCH_READ_LIMIT);
    const cities = found.filter((city) => city.daneStateCode !== null && city.daneCityCode !== null).slice(0, SEARCH_RESULT_LIMIT);
    if (cities.length === 0) return { cities: [] };

    const regions = await this.regionRepository.getByIds([...new Set(cities.map((city) => city.regionId))]);
    const regionNameById = new Map(regions.map((region) => [region.id, region.name]));
    const options: CityOption[] = cities.map((city) => ({ id: city.id, name: city.name, stateName: regionNameById.get(city.regionId) ?? '' }));
    return { cities: options };
  }
}
