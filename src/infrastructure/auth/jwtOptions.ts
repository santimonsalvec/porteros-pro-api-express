export const JWT_ISSUER = 'porterospro-api';
export const JWT_AUDIENCE = 'porterospro-api';

export interface JwtOptions {
  /** Read lazily by the issuer — a missing key only breaks authenticated routes. */
  signingKey: () => string;
  accessTokenLifetimeMinutes: number;
  refreshTokenLifetimeDays: number;
}
