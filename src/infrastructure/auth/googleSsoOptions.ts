export interface GoogleSsoOptions {
  clientIdMobile?: string;
  clientIdWeb?: string;
  /** Sent to mobile as `serverClientId`, for Android's sign-in. */
  clientIdAndroidServer?: string;
  scopes: string[];
}

export const DEFAULT_GOOGLE_SCOPES = ['openid', 'email', 'profile'];
