import { ICommand } from '../../../../common/mediator/types.js';
import type { TokenPairResponse } from '../../common/dtos.js';

export type ExchangeSsoCredentialOutcome = 'success' | 'invalid_credential' | 'unauthorized_admin_account';

export interface ExchangeSsoCredentialResult {
  outcome: ExchangeSsoCredentialOutcome;
  tokens?: TokenPairResponse;
}

export class ExchangeSsoCredentialCommand extends ICommand<ExchangeSsoCredentialResult> {
  constructor(
    public readonly provider: string,
    public readonly platform: string,
    public readonly credential: string,
  ) {
    super();
  }
}
