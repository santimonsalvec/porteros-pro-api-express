import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import type { ICityRepository, IRegionRepository } from '../../../locations/common/ports.js';
import {
  toActiveGoalkeeperResponse,
  toGoalkeeperRegistrationResponse,
  type GoalkeeperCityView,
} from '../../common/goalkeeperRegistrationResponse.js';
import { GetGoalkeeperRegistrationQuery, type GetGoalkeeperRegistrationResult } from './getGoalkeeperRegistrationQuery.js';

export class GetGoalkeeperRegistrationQueryHandler
  implements IQueryHandler<GetGoalkeeperRegistrationQuery, GetGoalkeeperRegistrationResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
  ) {}

  async handle(query: GetGoalkeeperRegistrationQuery): Promise<GetGoalkeeperRegistrationResult> {
    // For an active goalkeeper the profile — not the registration locked at activation — holds the current values.
    const profile = await this.goalkeeperProfileRepository.getByUserId(query.userId);
    const registration = profile
      ? toActiveGoalkeeperResponse(profile)
      : toGoalkeeperRegistrationResponse(await this.goalkeeperRegistrationRepository.getByUserId(query.userId));

    return { registration: { ...registration, city: await this.resolveCity(registration.cityId) } };
  }

  private async resolveCity(cityId: string | null): Promise<GoalkeeperCityView | null> {
    if (cityId === null) return null;

    const city = await this.cityRepository.getById(cityId);
    if (!city) return null;

    const [region] = await this.regionRepository.getByIds([city.regionId]);
    return { id: city.id, name: city.name, region: region?.name ?? '' };
  }
}
