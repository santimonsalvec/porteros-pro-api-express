import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IPorteroRegistrationRepository } from '../../common/ports.js';
import { validateLocation } from '../../common/validation.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { PorteroRegistration } from '../../../../../domain/porteros/porteroRegistration.js';
import { SaveLocationSectionCommand, type SaveLocationSectionResult } from './saveLocationSectionCommand.js';

export class SaveLocationSectionCommandHandler
  implements ICommandHandler<SaveLocationSectionCommand, SaveLocationSectionResult>
{
  constructor(
    private readonly porteroRegistrationRepository: IPorteroRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveLocationSectionCommand): Promise<SaveLocationSectionResult> {
    let registration = await this.porteroRegistrationRepository.getByUserId(command.userId);
    if (registration?.status === 'active') {
      return { outcome: 'already_active' };
    }

    const fieldErrors = validateLocation({
      latitude: command.latitude,
      longitude: command.longitude,
      city: command.city,
      state: command.state,
      country: command.country,
    });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const isNew = registration === null;
    if (!registration) {
      registration = PorteroRegistration.createEmpty(this.idGenerator.newId(), command.userId);
    }

    registration.saveLocation({
      ...(command.latitude !== undefined ? { latitude: command.latitude } : {}),
      ...(command.longitude !== undefined ? { longitude: command.longitude } : {}),
      ...(command.city !== undefined ? { city: command.city.trim() } : {}),
      ...(command.state !== undefined ? { state: command.state.trim() } : {}),
      ...(command.country !== undefined ? { country: command.country.trim() } : {}),
      ...(command.neighborhood !== undefined ? { neighborhood: command.neighborhood } : {}),
      ...(command.formattedAddress !== undefined ? { formattedAddress: command.formattedAddress } : {}),
    });

    if (isNew) {
      await this.porteroRegistrationRepository.add(registration);
    } else {
      await this.porteroRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toPorteroRegistrationResponse(registration) };
  }
}
