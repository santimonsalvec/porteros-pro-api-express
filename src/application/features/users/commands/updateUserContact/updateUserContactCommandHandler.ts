import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { contactVersion } from '../../../../../domain/users/contactVersion.js';
import { User } from '../../../../../domain/users/user.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { ICountryRepository } from '../../../profile/common/ports.js';
import { validateNameAndWhatsApp } from '../../../profile/common/validation.js';
import type { IUserContactWriter } from '../../common/ports.js';
import { userAuditView } from '../../common/userAuditViews.js';
import { UpdateUserContactCommand, type UpdateUserContactResult } from './updateUserContactCommand.js';

const CONTACT_FIELDS = ['firstName', 'lastName', 'countryCallingCode', 'whatsAppNumber'] as const;

/**
 * The same rules as the app's profile update (`validateNameAndWhatsApp`, the country's calling code,
 * one account per number), applied to what the administrator sends merged over what the user has.
 * Completing a profile stays the user's: an incomplete one is refused (US6, scenario 3).
 */
export class UpdateUserContactCommandHandler implements ICommandHandler<UpdateUserContactCommand, UpdateUserContactResult> {
  constructor(
    private readonly deps: {
      users: Pick<IUserRepository, 'getById' | 'existsByPhoneNumber'>;
      contacts: IUserContactWriter;
      countries: Pick<ICountryRepository, 'findByCountryCode'>;
    },
  ) {}

  async handle({ userId, version, correction }: UpdateUserContactCommand): Promise<UpdateUserContactResult> {
    const user = await this.deps.users.getById(userId);
    if (!user) return { outcome: 'not_found' };
    if (!user.isProfileComplete || !user.firstName || !user.lastName || !user.countryCallingCode || !user.whatsAppNumber) {
      return { outcome: 'profile_incomplete' };
    }
    if ((correction.countryCode === undefined) !== (correction.whatsAppNumber === undefined)) {
      const missing = correction.countryCode === undefined ? 'countryCode' : 'whatsAppNumber';
      return { outcome: 'validation_failed', fieldErrors: { [missing]: 'The country and the WhatsApp number go together.' } };
    }
    const firstName = correction.firstName?.trim() ?? user.firstName;
    const lastName = correction.lastName?.trim() ?? user.lastName;
    const whatsAppNumber = correction.whatsAppNumber?.trim() ?? user.whatsAppNumber;
    const fieldErrors = validateNameAndWhatsApp({ firstName, lastName, whatsAppNumber });
    if (Object.keys(fieldErrors).length > 0) return { outcome: 'validation_failed', fieldErrors };

    let countryCallingCode = user.countryCallingCode;
    if (correction.countryCode !== undefined) {
      const country = await this.deps.countries.findByCountryCode(correction.countryCode.toUpperCase());
      if (!country) return { outcome: 'invalid_country_code' };
      countryCallingCode = country.dialCode;
    }
    if (version !== contactVersion(user)) return { outcome: 'stale' };

    const changedFields = CONTACT_FIELDS.filter((field) => ({ firstName, lastName, countryCallingCode, whatsAppNumber })[field] !== user[field]);
    if (changedFields.length === 0) return { outcome: 'corrected', audit: userAuditView(user) };
    if (await this.deps.users.existsByPhoneNumber(countryCallingCode, whatsAppNumber, userId)) return { outcome: 'duplicate_phone_number' };

    const expected = { firstName: user.firstName, lastName: user.lastName, countryCallingCode: user.countryCallingCode, normalizedPhoneNumber: user.normalizedPhoneNumber };
    const next = { firstName, lastName, countryCallingCode, whatsAppNumber, normalizedPhoneNumber: User.normalizePhoneNumber(countryCallingCode, whatsAppNumber) };
    const written = await this.deps.contacts.updateContactIfUnchanged(userId, expected, next);
    if (written === 'stale') return { outcome: 'stale' };
    if (written === 'duplicate') return { outcome: 'duplicate_phone_number' };
    user.updateProfile(firstName, lastName, countryCallingCode, whatsAppNumber);
    return { outcome: 'corrected', audit: userAuditView(user, [...changedFields]) };
  }
}
