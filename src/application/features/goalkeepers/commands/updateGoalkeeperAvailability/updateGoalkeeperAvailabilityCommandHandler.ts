import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { findActiveGoalkeeperProfile } from '../../common/findActiveGoalkeeperProfile.js';
import { validateAvailabilitySelection } from '../../common/validateAvailabilitySelection.js';
import { toActiveGoalkeeperResponse } from '../../common/goalkeeperRegistrationResponse.js';
import {
  UpdateGoalkeeperAvailabilityCommand,
  type UpdateGoalkeeperAvailabilityResult,
} from './updateGoalkeeperAvailabilityCommand.js';

export class UpdateGoalkeeperAvailabilityCommandHandler
  implements ICommandHandler<UpdateGoalkeeperAvailabilityCommand, UpdateGoalkeeperAvailabilityResult>
{
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly cityRepository: ICityRepository,
    private readonly zoneRepository: IZoneRepository,
  ) {}

  async handle(command: UpdateGoalkeeperAvailabilityCommand): Promise<UpdateGoalkeeperAvailabilityResult> {
    const lookup = await findActiveGoalkeeperProfile(
      this.goalkeeperProfileRepository,
      this.goalkeeperRegistrationRepository,
      command.userId,
    );
    if (!lookup.found) {
      return { outcome: lookup.outcome };
    }

    const validation = await validateAvailabilitySelection(
      this.cityRepository,
      this.zoneRepository,
      command.cityId,
      command.zoneIds,
    );
    if (!validation.valid) {
      return validation.outcome === 'invalid_city'
        ? { outcome: 'invalid_city' }
        : { outcome: 'invalid_zones', invalidZoneIds: validation.invalidZoneIds };
    }

    const updated = await this.goalkeeperProfileRepository.updateAvailability(
      command.userId,
      command.cityId,
      validation.zoneIds,
    );
    // The profile is never deleted, so `null` here can only mean it vanished between the lookup and the write.
    if (!updated) {
      return { outcome: 'not_a_goalkeeper' };
    }

    return { outcome: 'success', goalkeeper: toActiveGoalkeeperResponse(updated) };
  }
}
