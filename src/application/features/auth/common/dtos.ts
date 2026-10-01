export interface SsoProviderConfig {
  provider: string;
  clientId: string;
  /** The client Android must request its ID token for, when it differs from `clientId`. */
  serverClientId?: string;
  scopes: string[];
}

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}
