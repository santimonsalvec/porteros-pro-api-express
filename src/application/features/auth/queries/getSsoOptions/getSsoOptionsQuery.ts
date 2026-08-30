import { IQuery } from '../../../../common/mediator/types.js';
import type { SsoProviderConfig } from '../../common/dtos.js';

export interface SsoOptionsResult {
  providers: SsoProviderConfig[];
}

export class GetSsoOptionsQuery extends IQuery<SsoOptionsResult> {
  constructor(public readonly platform: string) {
    super();
  }
}
