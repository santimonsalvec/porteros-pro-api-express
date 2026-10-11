import type { AdminAccessToken, AdminAccessTokenClaims, IAdminTokenIssuer } from '../../src/application/features/staff/common/ports.js';

export class FakeAdminTokenIssuer implements IAdminTokenIssuer {
  private counter = 0;
  private readonly issued = new Map<string, AdminAccessTokenClaims>();

  async issueAccessToken(claims: AdminAccessTokenClaims): Promise<AdminAccessToken> {
    this.counter += 1;
    const accessToken = `admin-access-${this.counter}`;
    this.issued.set(accessToken, claims);
    return { accessToken, expiresInSeconds: 300 };
  }

  /** Registers an arbitrary token→claims mapping, e.g. a hand-crafted or stale token. */
  registerAccessToken(token: string, claims: AdminAccessTokenClaims): void {
    this.issued.set(token, claims);
  }

  async verifyAccessToken(token: string): Promise<AdminAccessTokenClaims | null> {
    return this.issued.get(token) ?? null;
  }

  newRefreshToken(): string {
    this.counter += 1;
    return `admin-refresh-${this.counter}`;
  }

  hashRefreshToken(rawRefreshToken: string): string {
    return `hash:${rawRefreshToken}`;
  }
}
