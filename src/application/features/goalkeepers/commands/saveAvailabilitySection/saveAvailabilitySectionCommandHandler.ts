import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { validateAvailability } from '../../common/validation.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { SaveAvailabilitySectionCommand, type SaveAvailabilitySectionResult } from './saveAvailabilitySectionCommand.js';

export class SaveAvailabilitySectionCommandHandler
  implements ICommandHandler<SaveAvailabilitySectionCommand, SaveAvailabilitySectionResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveAvailabilitySectionCommand): Promise<SaveAvailabilitySectionResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const fieldErrors = validateAvailability({ radiusKm: command.radiusKm });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const isNew = registration === null;
    if (!registration) {
      registration = GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.saveAvailability({
      ...(command.radiusKm !== undefined ? { radiusKm: command.radiusKm } : {}),
    });

    if (isNew) {
      await this.goalkeeperRegistrationRepository.add(registration);
    } else {
      await this.goalkeeperRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
