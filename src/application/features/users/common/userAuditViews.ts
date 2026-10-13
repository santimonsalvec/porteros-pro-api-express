import type { User } from '../../../../domain/users/user.js';
import { contactVersion } from '../../../../domain/users/contactVersion.js';

/**
 * A user as the audit log keeps it (research §8): the contact fields, with the phone reduced to its
 * last 4 digits. The full number never reaches the log: the redaction drops `whatsAppNumber` too.
 */
export interface UserAuditView {
  id: string;
  firstName: string | null;
  lastName: string | null;
  countryCallingCode: string | null;
  numberEnding: string | null;
  changedFields: string[];
  version: string;
  isProfileComplete: boolean;
}

export function userAuditView(user: User, changedFields: string[] = []): UserAuditView {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    countryCallingCode: user.countryCallingCode,
    numberEnding: user.whatsAppNumber ? user.whatsAppNumber.replace(/\D/g, '').slice(-4) : null,
    changedFields,
    version: contactVersion(user),
    isProfileComplete: user.isProfileComplete,
  };
}
