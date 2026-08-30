import type { User } from '../../../../domain/users/user.js';

export interface ClientProfileResponse {
  firstName: string | null;
  lastName: string | null;
  email: string;
  countryCallingCode: string | null;
  whatsAppNumber: string | null;
  createdAt: string;
}

/** Single place the User -> ClientProfileResponse projection exists, reused by get and update. */
export function toClientProfileResponse(user: User): ClientProfileResponse {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    countryCallingCode: user.countryCallingCode,
    whatsAppNumber: user.whatsAppNumber,
    createdAt: user.createdAt.toISOString(),
  };
}
