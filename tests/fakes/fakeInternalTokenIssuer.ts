import type { IInternalTokenIssuer, TokenIssueOptions } from '../../src/application/features/auth/common/ports.js';
import type { TokenPairResponse } from '../../src/application/features/auth/common/dtos.js';
import type { AccessTokenClaims } from '../../src/application/features/auth/common/accessTokenClaims.js';
import type { User } from '../../src/domain/users/user.js';

export class FakeInternalTokenIssuer implements IInternalTokenIssuer {
  private counter = 0;
  private readonly issuedAccessTokens = new Map<string, AccessTokenClaims>();

  async issue(user: User, options: TokenIssueOptions = {}): Promise<TokenPairResponse> {
    this.counter += 1;
    const accessToken = `access-${this.counter}`;
    const rawRefreshToken = `refresh-${this.counter}`;
    const claims: AccessTokenClaims = {
      sub: user.id,
      email: user.email,
      isAdmin: user.isAdmin ? 'true' : 'false',
      profileComplete: user.isProfileComplete ? 'true' : 'false',
      ...(options.isGoalkeeper ? { isGoalkeeper: 'true' as const } : {}),
    };
    this.issuedAccessTokens.set(accessToken, claims);
    return { accessToken, refreshToken: rawRefreshToken, expiresInSeconds: 900 };
  }

  /** Registers an arbitrary token→claims mapping, e.g. to simulate a stale or hand-crafted token. */
  registerAccessToken(token: string, claims: AccessTokenClaims): void {
    this.issuedAccessTokens.set(token, claims);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    return this.issuedAccessTokens.get(token) ?? null;
  }

  hashRefreshToken(rawRefreshToken: string): string {
    return `hash:${rawRefreshToken}`;
  }
}
