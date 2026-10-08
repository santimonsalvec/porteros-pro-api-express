export const JWT_ISSUER = 'porterospro-api';
export const JWT_AUDIENCE = 'porterospro-api';

export interface JwtOptions {
  /** Read lazily by the issuer — a missing key only breaks authenticated routes. */
  signingKey: () => string;
  accessTokenLifetimeMinutes: number;
  refreshTokenLifetimeDays: number;
}

/** The admin web's tokens are for this audience only, so the app never accepts them and vice versa. */
export const ADMIN_JWT_AUDIENCE = 'porterospro-admin';

export interface AdminJwtOptions {
  signingKey: () => string;
  accessTokenLifetimeSeconds: number;
}
