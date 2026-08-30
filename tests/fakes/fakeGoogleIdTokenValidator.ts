import type { IGoogleIdTokenValidator } from '../../src/application/features/auth/common/ports.js';
import { ExternalIdentity } from '../../src/domain/users/externalIdentity.js';

/** Maps a fixed set of "credential" strings to identities; anything else is invalid. */
export class FakeGoogleIdTokenValidator implements IGoogleIdTokenValidator {
  private readonly credentials = new Map<string, ExternalIdentity>();

  registerValidCredential(credential: string, identity: ExternalIdentity): void {
    this.credentials.set(credential, identity);
  }

  async validate(credential: string, _platform: string): Promise<ExternalIdentity | null> {
    return this.credentials.get(credential) ?? null;
  }
}
