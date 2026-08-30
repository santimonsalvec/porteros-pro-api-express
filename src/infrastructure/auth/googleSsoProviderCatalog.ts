import type { ISsoProviderCatalog } from '../../application/features/auth/common/ports.js';
import type { SsoProviderConfig } from '../../application/features/auth/common/dtos.js';
import type { GoogleSsoOptions } from './googleSsoOptions.js';

/** Omits Google from the response for a platform with no configured client id (edge case). */
export class GoogleSsoProviderCatalog implements ISsoProviderCatalog {
  constructor(private readonly options: GoogleSsoOptions) {}

  getProviders(platform: string): SsoProviderConfig[] {
    const clientId = platform === 'mobile' ? this.options.clientIdMobile : this.options.clientIdWeb;
    if (!clientId) return [];
    return [{ provider: 'google', clientId, scopes: this.options.scopes }];
  }
}
