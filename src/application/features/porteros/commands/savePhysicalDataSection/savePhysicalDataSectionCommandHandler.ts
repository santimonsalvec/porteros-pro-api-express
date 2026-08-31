import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IPorteroRegistrationRepository } from '../../common/ports.js';
import { validatePhysicalData } from '../../common/validation.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { PorteroRegistration } from '../../../../../domain/porteros/porteroRegistration.js';
import { SavePhysicalDataSectionCommand, type SavePhysicalDataSectionResult } from './savePhysicalDataSectionCommand.js';

export class SavePhysicalDataSectionCommandHandler
  implements ICommandHandler<SavePhysicalDataSectionCommand, SavePhysicalDataSectionResult>
{
  constructor(
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SavePhysicalDataSectionCommand): Promise<SavePhysicalDataSectionResult> {
    let registration = await this.porteroRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const fieldErrors = validatePhysicalData({ heightCm: command.heightCm, weightKg: command.weightKg });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const isNew = registration === null;
    if (!registration) {
      registration = PorteroRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.savePhysicalData({
      ...(command.heightCm !== undefined ? { heightCm: command.heightCm } : {}),
      ...(command.weightKg !== undefined ? { weightKg: command.weightKg } : {}),
    });

    if (isNew) {
      await this.porteroRegistrationRepository.add(registration);
    } else {
      await this.porteroRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toPorteroRegistrationResponse(registration) };
  }
}
