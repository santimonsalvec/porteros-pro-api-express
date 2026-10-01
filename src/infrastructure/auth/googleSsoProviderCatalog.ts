import type { ISsoProviderCatalog } from '../../application/features/auth/common/ports.js';
import type { SsoProviderConfig } from '../../application/features/auth/common/dtos.js';
import type { GoogleSsoOptions } from './googleSsoOptions.js';

/** Omits Google from the response for a platform with no configured client id (edge case). */
export class GoogleSsoProviderCatalog implements ISsoProviderCatalog {
  constructor(private readonly options: GoogleSsoOptions) {}

  getProviders(platform: string): SsoProviderConfig[] {
    const mobile = platform === 'mobile';
    const clientId = mobile ? this.options.clientIdMobile : this.options.clientIdWeb;
    if (!clientId) return [];
    const serverClientId = mobile ? this.options.clientIdAndroidServer : undefined;
    return [{ provider: 'google', clientId, ...(serverClientId && { serverClientId }), scopes: this.options.scopes }];
  }
}
