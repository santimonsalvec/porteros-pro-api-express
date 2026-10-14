import type { AdminGoogleIdentity, AppGoogleIdentity, IGoogleIdTokenValidator } from '../../src/application/features/auth/common/ports.js';
import { ExternalIdentity } from '../../src/domain/users/externalIdentity.js';

/** Maps a fixed set of "credential" strings to identities; anything else is invalid. */
export class FakeGoogleIdTokenValidator implements IGoogleIdTokenValidator {
  private readonly credentials = new Map<string, AppGoogleIdentity>();
  private readonly adminCredentials = new Map<string, AdminGoogleIdentity>();

  /** `emailVerified`, when given, is what Google says of the address (admin spec 009). */
  registerValidCredential(credential: string, identity: ExternalIdentity, emailVerified?: boolean): void {
    const registered = new ExternalIdentity(identity.provider, identity.subject, identity.email);
    this.credentials.set(credential, emailVerified === undefined ? registered : Object.assign(registered, { emailVerified }));
  }

  /** A credential the admin web's sign-in accepts (`validateForAdmin`). */
  registerValidAdminCredential(credential: string, identity: ExternalIdentity, emailVerified = true, displayName: string | null = null): void {
    this.adminCredentials.set(credential, { identity, emailVerified, displayName });
  }

  async validate(credential: string, _platform: string): Promise<AppGoogleIdentity | null> {
    return this.credentials.get(credential) ?? null;
  }

  async validateForAdmin(credential: string): Promise<AdminGoogleIdentity | null> {
    return this.adminCredentials.get(credential) ?? null;
  }
}
