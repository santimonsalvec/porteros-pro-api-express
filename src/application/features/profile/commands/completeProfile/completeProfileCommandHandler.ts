import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator, IInternalTokenIssuer } from '../../../auth/common/ports.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { ICountryRepository, ITermsAcceptanceRepository } from '../../common/ports.js';
import { validateNameAndWhatsApp } from '../../common/validation.js';
import { TermsAcceptance } from '../../../../../domain/users/termsAcceptance.js';
import { CompleteProfileCommand, type CompleteProfileResult } from './completeProfileCommand.js';

export interface LegalDocumentVersions {
  termsVersion: string;
  privacyPolicyVersion: string;
}

export class CompleteProfileCommandHandler
  implements ICommandHandler<CompleteProfileCommand, CompleteProfileResult>
{
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly countryRepository: ICountryRepository,
    private readonly termsAcceptanceRepository: ITermsAcceptanceRepository,
    private readonly tokenIssuer: IInternalTokenIssuer,
    private readonly idGenerator: IIdGenerator,
    private readonly legalVersions: LegalDocumentVersions,
  ) {}

  async handle(command: CompleteProfileCommand): Promise<CompleteProfileResult> {
    const user = await this.userRepository.getById(command.userId);
    // Identical outcome whether the account doesn't exist or is already complete (FR-043).
    if (!user || user.isProfileComplete) {
      return { outcome: 'already_complete' };
    }

    const fieldErrors = validateNameAndWhatsApp({
      firstName: command.firstName,
      lastName: command.lastName,
      whatsAppNumber: command.whatsAppNumber,
    });
    if (!command.acceptedTerms) {
      fieldErrors.acceptedTerms = 'You must accept the Terms & Conditions and Privacy Policy to continue.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { outcome: 'validation_failed', fieldErrors };
    }

    const country = await this.countryRepository.findByCountryCode(command.countryCode);
    if (!country) {
      return { outcome: 'invalid_country_code' };
    }

    const duplicate = await this.userRepository.existsByPhoneNumber(country.dialCode, command.whatsAppNumber);
    if (duplicate) {
      return { outcome: 'duplicate_phone_number' };
    }

    const firstName = command.firstName.trim();
    const lastName = command.lastName.trim();
    user.completeProfile(firstName, lastName, country.dialCode, command.whatsAppNumber);
    await this.userRepository.update(user);

    await this.termsAcceptanceRepository.add(
      new TermsAcceptance({
        id: this.idGenerator.newId(),
        userId: user.id,
        termsVersion: this.legalVersions.termsVersion,
        privacyPolicyVersion: this.legalVersions.privacyPolicyVersion,
        acceptedAt: new Date(),
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
      }),
    );

    const tokens = await this.tokenIssuer.issue(user);
    return { outcome: 'success', tokens };
  }
}
