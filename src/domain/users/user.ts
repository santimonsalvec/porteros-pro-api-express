import { Entity } from '../common/entity.js';
import { ExternalIdentity } from './externalIdentity.js';

/**
 * The central identity record for anyone who can sign in. Shared by mobile clients
 * and the admin web, distinguished only by `isAdmin`. Profile fields (`firstName`,
 * `lastName`, `countryCallingCode`, `whatsAppNumber`) are `null` until profile
 * completion (see `completeProfile`); `normalizedPhoneNumber` is the actual
 * uniqueness key derived from them (see `normalizePhoneNumber`).
 */
export class User extends Entity<string> {
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  externalIdentities: ExternalIdentity[];
  readonly createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  countryCallingCode: string | null;
  whatsAppNumber: string | null;
  isProfileComplete: boolean;
  normalizedPhoneNumber: string | null;

  constructor(params: {
    id: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
    externalIdentities: ExternalIdentity[];
    createdAt: Date;
    firstName: string | null;
    lastName: string | null;
    countryCallingCode: string | null;
    whatsAppNumber: string | null;
    isProfileComplete: boolean;
    normalizedPhoneNumber: string | null;
  }) {
    super(params.id);
    this.email = params.email;
    this.displayName = params.displayName;
    this.isAdmin = params.isAdmin;
    this.externalIdentities = params.externalIdentities;
    this.createdAt = params.createdAt;
    this.firstName = params.firstName;
    this.lastName = params.lastName;
    this.countryCallingCode = params.countryCallingCode;
    this.whatsAppNumber = params.whatsAppNumber;
    this.isProfileComplete = params.isProfileComplete;
    this.normalizedPhoneNumber = params.normalizedPhoneNumber;
  }

  /** Factory for mobile auto-provisioning (FR-014) and out-of-band admin provisioning. */
  static createFromExternalIdentity(params: {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    subject: string;
    isAdmin?: boolean;
  }): User {
    return new User({
      id: params.id,
      email: params.email,
      displayName: params.displayName,
      isAdmin: params.isAdmin ?? false,
      externalIdentities: [new ExternalIdentity(params.provider, params.subject, params.email)],
      createdAt: new Date(),
      firstName: null,
      lastName: null,
      countryCallingCode: null,
      whatsAppNumber: null,
      isProfileComplete: false,
      normalizedPhoneNumber: null,
    });
  }

  findExternalIdentity(provider: string, subject: string): ExternalIdentity | undefined {
    return this.externalIdentities.find((identity) => identity.provider === provider && identity.subject === subject);
  }

  /**
   * Sets the four profile fields and flips `isProfileComplete` to `true`. Callable
   * only when not already complete — the *handler*, not this method, enforces that
   * (FR-027), consistent with keeping entity methods simple, unconditional setters.
   */
  completeProfile(firstName: string, lastName: string, countryCallingCode: string, whatsAppNumber: string): void {
    this.firstName = firstName;
    this.lastName = lastName;
    this.countryCallingCode = countryCallingCode;
    this.whatsAppNumber = whatsAppNumber;
    this.normalizedPhoneNumber = User.normalizePhoneNumber(countryCallingCode, whatsAppNumber);
    this.isProfileComplete = true;
  }

  /**
   * Sets the same four fields without touching `isProfileComplete`. The handler
   * confirms the profile is already complete before calling this (FR-035).
   */
  updateProfile(firstName: string, lastName: string, countryCallingCode: string, whatsAppNumber: string): void {
    this.firstName = firstName;
    this.lastName = lastName;
    this.countryCallingCode = countryCallingCode;
    this.whatsAppNumber = whatsAppNumber;
    this.normalizedPhoneNumber = User.normalizePhoneNumber(countryCallingCode, whatsAppNumber);
  }

  /** Strips every non-digit character from both inputs and concatenates them. */
  static normalizePhoneNumber(countryCallingCode: string, whatsAppNumber: string): string {
    return `${countryCallingCode}${whatsAppNumber}`.replace(/\D/g, '');
  }
}
