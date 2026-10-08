import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type {
  AdminAccessToken,
  AdminAccessTokenClaims,
  IAdminTokenIssuer,
} from '../../application/features/staff/common/ports.js';
import { ADMIN_JWT_AUDIENCE, JWT_ISSUER, type AdminJwtOptions } from './jwtOptions.js';

/**
 * Admin web access tokens: same issuer and key as the app's, a different audience (research §2).
 * They carry no permissions — those are resolved on every request — only the session and member.
 */
export class JwtAdminTokenIssuer implements IAdminTokenIssuer {
  constructor(private readonly options: AdminJwtOptions) {}

  async issueAccessToken(claims: AdminAccessTokenClaims): Promise<AdminAccessToken> {
    const expiresInSeconds = this.options.accessTokenLifetimeSeconds;
    const accessToken = await new SignJWT({ sid: claims.sessionId, stf: claims.staffId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(ADMIN_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(this.key());
    return { accessToken, expiresInSeconds };
  }

  async verifyAccessToken(token: string): Promise<AdminAccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key(), { issuer: JWT_ISSUER, audience: ADMIN_JWT_AUDIENCE });
      if (!payload.sub || typeof payload.sid !== 'string' || typeof payload.stf !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid, staffId: payload.stf };
    } catch {
      return null;
    }
  }

  newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(rawRefreshToken: string): string {
    return createHash('sha256').update(rawRefreshToken).digest('hex');
  }

  private key(): Uint8Array {
    return new TextEncoder().encode(this.options.signingKey());
  }
}
