import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { validateLocation } from '../../common/validation.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GoalkeeperRegistration } from '../../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { SaveLocationSectionCommand, type SaveLocationSectionResult } from './saveLocationSectionCommand.js';

export class SaveLocationSectionCommandHandler
  implements ICommandHandler<SaveLocationSectionCommand, SaveLocationSectionResult>
{
  constructor(
    private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async handle(command: SaveLocationSectionCommand): Promise<SaveLocationSectionResult> {
    let registration = await this.goalkeeperRegistrationRepository.getByUserId(command.userId);
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
      registration = GoalkeeperRegistration.createEmpty(this.idGenerator.newId(), command.userId);
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
      await this.goalkeeperRegistrationRepository.add(registration);
    } else {
      await this.goalkeeperRegistrationRepository.update(registration);
    }

    return { outcome: 'success', registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
