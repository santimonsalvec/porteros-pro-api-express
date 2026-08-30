import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { ICountryRepository } from '../../../profile/common/ports.js';
import { validateNameAndWhatsApp } from '../../../profile/common/validation.js';
import { toClientProfileResponse } from '../../common/clientProfileResponse.js';
import { UpdateClientProfileCommand, type UpdateClientProfileResult } from './updateClientProfileCommand.js';

export class UpdateClientProfileCommandHandler
  implements ICommandHandler<UpdateClientProfileCommand, UpdateClientProfileResult>
{
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly countryRepository: ICountryRepository,
  ) {}

  async handle(command: UpdateClientProfileCommand): Promise<UpdateClientProfileResult> {
    const user = await this.userRepository.getById(command.userId);
    if (!user) {
      return { outcome: 'not_found' };
    }

    // Pre-empted in practice by the stacked requireCompleteProfile middleware;
    // kept as defense-in-depth and for direct handler-level testability.
    if (!user.isProfileComplete) {
      return { outcome: 'profile_not_complete' };
    }

    const fieldErrors = validateNameAndWhatsApp({
      firstName: command.firstName,
      lastName: command.lastName,
      whatsAppNumber: command.whatsAppNumber,
    });
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const country = await this.countryRepository.findByCountryCode(command.countryCode);
    if (!country) {
      return { outcome: 'invalid_country_code' };
    }

    const duplicate = await this.userRepository.existsByPhoneNumber(
      country.dialCode,
      command.whatsAppNumber,
      user.id,
    );
    if (duplicate) {
      return { outcome: 'duplicate_phone_number' };
    }

    user.updateProfile(command.firstName.trim(), command.lastName.trim(), country.dialCode, command.whatsAppNumber);
    await this.userRepository.update(user);

    return { outcome: 'success', profile: toClientProfileResponse(user) };
  }
}
