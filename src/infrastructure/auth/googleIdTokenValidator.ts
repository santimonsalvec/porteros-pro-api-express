import { OAuth2Client } from 'google-auth-library';
import type { IGoogleIdTokenValidator } from '../../application/features/auth/common/ports.js';
import { ExternalIdentity } from '../../domain/users/externalIdentity.js';
import { logger } from '../observability/logger.js';

export interface GoogleClientIdsByPlatform {
  mobile?: string;
  'admin-web'?: string;
}

/**
 * Validates a Google ID token via the official client library, which handles
 * signature verification, issuer/audience checks, expiration, and JWKS key rotation.
 * Any failure (bad signature, expired, wrong audience, malformed, transient network
 * error) collapses to `null` — never thrown — so the caller can uniformly reject.
 */
export class GoogleIdTokenValidator implements IGoogleIdTokenValidator {
  private readonly client = new OAuth2Client();

  constructor(private readonly clientIdsByPlatform: GoogleClientIdsByPlatform) {}

  async validate(credential: string, platform: string): Promise<ExternalIdentity | null> {
    const audience = this.clientIdsByPlatform[platform as keyof GoogleClientIdsByPlatform];
    if (!audience) return null;

    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) return null;
      return new ExternalIdentity('google', payload.sub, payload.email);
    } catch (err) {
      logger.warn({ err }, 'Google ID token validation failed');
      return null;
    }
  }
}
