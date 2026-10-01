import { describe, expect, it } from 'vitest';
import { GoogleSsoProviderCatalog } from '../../../../src/infrastructure/auth/googleSsoProviderCatalog.js';

const scopes = ['openid', 'email', 'profile'];

describe('GoogleSsoProviderCatalog', () => {
  it("gives mobile Android's server client next to the iOS one", () => {
    const catalog = new GoogleSsoProviderCatalog({
      clientIdMobile: 'ios-client',
      clientIdWeb: 'admin-client',
      clientIdAndroidServer: 'android-server-client',
      scopes,
    });

    expect(catalog.getProviders('mobile')).toEqual([
      { provider: 'google', clientId: 'ios-client', serverClientId: 'android-server-client', scopes },
    ]);
  });

  it('leaves serverClientId out when none is configured', () => {
    const catalog = new GoogleSsoProviderCatalog({ clientIdMobile: 'ios-client', scopes });

    expect(catalog.getProviders('mobile')).toEqual([{ provider: 'google', clientId: 'ios-client', scopes }]);
  });

  it('never sends the Android server client to admin-web', () => {
    const catalog = new GoogleSsoProviderCatalog({
      clientIdWeb: 'admin-client',
      clientIdAndroidServer: 'android-server-client',
      scopes,
    });

    expect(catalog.getProviders('admin-web')).toEqual([{ provider: 'google', clientId: 'admin-client', scopes }]);
  });
});
