import type { User } from '../../../../domain/users/user.js';
import type { IUserRepository } from '../../auth/common/ports.js';

/** The only personal data one side of an assigned booking sees of the other (FR-012, FR-013). */
export interface Contact {
  firstName: string | null;
  lastName: string | null;
  /** `"<country calling code> <number>"`, e.g. `"+57 300 123 4567"`; null when not on the profile. */
  whatsApp: string | null;
}

export function toContact(user: User): Contact {
  const whatsApp = user.whatsAppNumber
    ? [user.countryCallingCode, user.whatsAppNumber].filter((part) => part).join(' ')
    : null;
  return { firstName: user.firstName, lastName: user.lastName, whatsApp };
}

/** The contacts of these users, with one read. Unknown users are simply absent. */
export async function loadContacts(userRepository: IUserRepository, userIds: readonly string[]): Promise<Map<string, Contact>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const users = await userRepository.getByIds(ids);
  return new Map(users.map((user) => [user.id, toContact(user)]));
}
