import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ISsoProviderCatalog } from '../../common/ports.js';
import { InvalidPlatformError } from '../../common/errors.js';
import { GetSsoOptionsQuery, type SsoOptionsResult } from './getSsoOptionsQuery.js';

const RECOGNIZED_PLATFORMS = new Set(['mobile', 'admin-web']);

export class GetSsoOptionsQueryHandler implements IQueryHandler<GetSsoOptionsQuery, SsoOptionsResult> {
  constructor(private readonly catalog: ISsoProviderCatalog) {}

  async handle(query: GetSsoOptionsQuery): Promise<SsoOptionsResult> {
    if (!RECOGNIZED_PLATFORMS.has(query.platform)) {
      throw new InvalidPlatformError(query.platform);
    }
    return { providers: this.catalog.getProviders(query.platform) };
  }
}
