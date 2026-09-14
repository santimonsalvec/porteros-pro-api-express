import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { validatePhysicalData } from '../../common/validation.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { SavePhysicalDataSectionCommand, type SavePhysicalDataSectionResult } from './savePhysicalDataSectionCommand.js';

export class SavePhysicalDataSectionCommandHandler
  implements ICommandHandler<SavePhysicalDataSectionCommand, SavePhysicalDataSectionResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SavePhysicalDataSectionCommand): Promise<SavePhysicalDataSectionResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const fieldErrors = validatePhysicalData({ heightCm: command.heightCm, weightKg: command.weightKg });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const isNew = registration === null;
    if (!registration) {
      registration = GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.savePhysicalData({
      ...(command.heightCm !== undefined ? { heightCm: command.heightCm } : {}),
      ...(command.weightKg !== undefined ? { weightKg: command.weightKg } : {}),
    });

    if (isNew) {
      await this.goalkeeperRegistrationRepository.add(registration);
    } else {
      await this.goalkeeperRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
