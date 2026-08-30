import { describe, expect, it } from 'vitest';
import { GetSsoOptionsQuery } from '../../../../../src/application/features/auth/queries/getSsoOptions/getSsoOptionsQuery.js';
import { GetSsoOptionsQueryHandler } from '../../../../../src/application/features/auth/queries/getSsoOptions/getSsoOptionsQueryHandler.js';
import { InvalidPlatformError } from '../../../../../src/application/features/auth/common/errors.js';
import type { ISsoProviderCatalog } from '../../../../../src/application/features/auth/common/ports.js';

function makeCatalog(providersByPlatform: Record<string, { provider: string; clientId: string; scopes: string[] }[]>): ISsoProviderCatalog {
  return {
    getProviders: (platform: string) => providersByPlatform[platform] ?? [],
  };
}

describe('GetSsoOptionsQueryHandler', () => {
  it('returns the configured providers for a valid platform', async () => {
    const catalog = makeCatalog({
      mobile: [{ provider: 'google', clientId: 'mobile-client-id', scopes: ['openid', 'email', 'profile'] }],
    });
    const handler = new GetSsoOptionsQueryHandler(catalog);

    const result = await handler.handle(new GetSsoOptionsQuery('mobile'));

    expect(result.providers).toEqual([
      { provider: 'google', clientId: 'mobile-client-id', scopes: ['openid', 'email', 'profile'] },
    ]);
  });

  it('returns an empty list for a platform with nothing configured', async () => {
    const catalog = makeCatalog({});
    const handler = new GetSsoOptionsQueryHandler(catalog);

    const result = await handler.handle(new GetSsoOptionsQuery('admin-web'));

    expect(result.providers).toEqual([]);
  });

  it('rejects a missing/unrecognized platform', async () => {
    const catalog = makeCatalog({});
    const handler = new GetSsoOptionsQueryHandler(catalog);

    await expect(handler.handle(new GetSsoOptionsQuery('desktop'))).rejects.toBeInstanceOf(InvalidPlatformError);
  });
});
