export interface SsoProviderConfig {
  provider: string;
  clientId: string;
  scopes: string[];
}

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}
