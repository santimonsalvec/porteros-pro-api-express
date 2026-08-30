export interface GoogleSsoOptions {
  clientIdMobile?: string;
  clientIdWeb?: string;
  scopes: string[];
}

export const DEFAULT_GOOGLE_SCOPES = ['openid', 'email', 'profile'];
