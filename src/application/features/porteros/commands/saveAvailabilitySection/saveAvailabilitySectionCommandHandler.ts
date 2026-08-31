import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IPorteroRegistrationRepository } from '../../common/ports.js';
import { validateAvailability } from '../../common/validation.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { PorteroRegistration } from '../../../../../domain/porteros/porteroRegistration.js';
import { SaveAvailabilitySectionCommand, type SaveAvailabilitySectionResult } from './saveAvailabilitySectionCommand.js';

export class SaveAvailabilitySectionCommandHandler
  implements ICommandHandler<SaveAvailabilitySectionCommand, SaveAvailabilitySectionResult>
{
  constructor(
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveAvailabilitySectionCommand): Promise<SaveAvailabilitySectionResult> {
    let registration = await this.porteroRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const fieldErrors = validateAvailability({ radiusKm: command.radiusKm });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const isNew = registration === null;
    if (!registration) {
      registration = PorteroRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.saveAvailability({
      ...(command.radiusKm !== undefined ? { radiusKm: command.radiusKm } : {}),
    });

    if (isNew) {
      await this.porteroRegistrationRepository.add(registration);
    } else {
      await this.porteroRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toPorteroRegistrationResponse(registration) };
  }
}
