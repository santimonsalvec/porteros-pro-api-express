import { ICommand } from '../../../../common/mediator/types.js';
import type { TokenPairResponse } from '../../common/dtos.js';

/**
 * `admin_sign_in_moved`: the admin web signs in through `POST /auth/admin/sign-in` (porteros-pro-admin
 * spec 001). `account_blocked`: the administration blocked this user (porteros-pro-admin spec 005).
 */
export type ExchangeSsoCredentialOutcome = 'success' | 'invalid_credential' | 'admin_sign_in_moved' | 'account_blocked';

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
