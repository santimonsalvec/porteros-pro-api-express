import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { IInternalTokenIssuer } from '../../application/features/auth/common/ports.js';
import type { TokenPairResponse } from '../../application/features/auth/common/dtos.js';
import type { User } from '../../domain/users/user.js';
import type { AccessTokenClaims } from '../../application/features/auth/common/accessTokenClaims.js';
import { JWT_AUDIENCE, JWT_ISSUER, type JwtOptions } from './jwtOptions.js';

export class JwtInternalTokenIssuer implements IInternalTokenIssuer {
  constructor(private readonly options: JwtOptions) {}

  async issue(user: User): Promise<TokenPairResponse> {
    const expiresInSeconds = this.options.accessTokenLifetimeMinutes * 60;
    const signingKey = new TextEncoder().encode(this.options.signingKey());

    const accessToken = await new SignJWT({
      email: user.email,
      isAdmin: user.isAdmin ? 'true' : 'false',
      profileComplete: user.isProfileComplete ? 'true' : 'false',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(signingKey);

    const refreshToken = randomBytes(32).toString('base64url');

    return { accessToken, refreshToken, expiresInSeconds };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const signingKey = new TextEncoder().encode(this.options.signingKey());
      const { payload } = await jwtVerify(token, signingKey, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
      if (!payload.sub || typeof payload.email !== 'string') return null;
      return {
        sub: payload.sub,
        email: payload.email,
        isAdmin: payload.isAdmin === 'true' ? 'true' : 'false',
        profileComplete: payload.profileComplete === 'true' ? 'true' : 'false',
      };
    } catch {
      return null;
    }
  }

  hashRefreshToken(rawRefreshToken: string): string {
    return createHash('sha256').update(rawRefreshToken).digest('hex');
  }
}
