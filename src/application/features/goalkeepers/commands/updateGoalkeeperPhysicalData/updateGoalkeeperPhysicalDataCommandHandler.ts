import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { findActiveGoalkeeperProfile } from '../../common/findActiveGoalkeeperProfile.js';
import { validatePhysicalData } from '../../common/validation.js';
import { toActiveGoalkeeperResponse } from '../../common/goalkeeperRegistrationResponse.js';
import {
  UpdateGoalkeeperPhysicalDataCommand,
  type UpdateGoalkeeperPhysicalDataResult,
} from './updateGoalkeeperPhysicalDataCommand.js';

export class UpdateGoalkeeperPhysicalDataCommandHandler
  implements ICommandHandler<UpdateGoalkeeperPhysicalDataCommand, UpdateGoalkeeperPhysicalDataResult>
{
  constructor(
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
  ) {}

  async handle(command: UpdateGoalkeeperPhysicalDataCommand): Promise<UpdateGoalkeeperPhysicalDataResult> {
    const lookup = await findActiveGoalkeeperProfile(
      this.goalkeeperProfileRepository,
      this.goalkeeperRegistrationRepository,
      command.userId,
    );
    if (!lookup.found) {
      return { outcome: lookup.outcome };
    }

    const fieldErrors = validatePhysicalData({ heightCm: command.heightCm, weightKg: command.weightKg });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const updated = await this.goalkeeperProfileRepository.updatePhysicalData(command.userId, {
      ...(command.heightCm !== undefined ? { heightCm: command.heightCm } : {}),
      ...(command.weightKg !== undefined ? { weightKg: command.weightKg } : {}),
    });
    // The profile is never deleted, so `null` here can only mean it vanished between the lookup and the write.
    if (!updated) {
      return { outcome: 'not_a_goalkeeper' };
    }

    return { outcome: 'success', goalkeeper: toActiveGoalkeeperResponse(updated) };
  }
}
