import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
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
    private readonly marketRepository: IMarketRepository,
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

    const marketId = lookup.profile.marketId;
    if (command.marketId !== null && command.marketId !== marketId) return { outcome: 'use_market_change' };

    const validation = await validateAvailabilitySelection(this.marketRepository, this.zoneRepository, marketId, command.zoneIds, { allowDisabled: true });
    if (!validation.valid) {
      return validation.outcome === 'invalid_market'
        ? { outcome: 'invalid_market' }
        : { outcome: 'invalid_zones', invalidZoneIds: validation.invalidZoneIds };
    }

    const updated = await this.goalkeeperProfileRepository.updateAvailability(command.userId, marketId, validation.zoneIds);
    // The profile is never deleted, so `null` here can only mean it vanished between the lookup and the write.
    if (!updated) {
      return { outcome: 'not_a_goalkeeper' };
    }

    return { outcome: 'success', goalkeeper: toActiveGoalkeeperResponse(updated) };
  }
}
